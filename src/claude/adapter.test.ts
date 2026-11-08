import { getPendingQuestion } from "@/chat/adapter";
import { EMPTY_TRANSCRIBED } from "@/chat/transcribed";
import type { Pane } from "@/herdr/backend";
import { FileReadError, type HostReader } from "@/ssh/hostReader";

import { claudeAdapter } from "./adapter";

function pane(fields: Partial<Pane> = {}): Pane {
  return { id: "p1", title: "", agent: "claude", state: "idle", isFinished: false, columns: null, ...fields };
}

describe("the Claude adapter: finding the transcript", () => {
  const readFile = jest.fn();
  const findFiles = jest.fn();
  const host: HostReader = { readFile, findFiles };
  const TRANSCRIPT = ".claude/projects/-work-demo/s-1.jsonl";

  beforeEach(() => jest.resetAllMocks());

  it("takes the path Herdr gives", async () => {
    expect(await claudeAdapter.locate(host, pane({ sessionPath: "/work/s.jsonl", pid: 100 }))).toBe("/work/s.jsonl");
    expect(readFile).not.toHaveBeenCalled();
  });

  it("reads the session file of the process, then names the transcript", async () => {
    readFile.mockResolvedValue({ text: '{"sessionId":"s-1","cwd":"/work/demo"}' });

    expect(await claudeAdapter.locate(host, pane({ pid: 100 }))).toBe(TRANSCRIPT);
    expect(readFile).toHaveBeenCalledWith(".claude/sessions/100.json");
  });

  it("fails with FileReadError when the process has no session file, which the chat takes as no chat", async () => {
    readFile.mockRejectedValue(new FileReadError("gone"));

    await expect(claudeAdapter.locate(host, pane({ pid: 100 }))).rejects.toBeInstanceOf(FileReadError);
  });

  it("looks for the one transcript named for the session id", async () => {
    findFiles.mockResolvedValue([TRANSCRIPT]);

    expect(await claudeAdapter.locate(host, pane({ sessionId: "s-1" }))).toBe(TRANSCRIPT);
    expect(findFiles).toHaveBeenCalledWith(".claude/projects", "s-1.jsonl", 2);
  });

  it.each([
    { where: "none has the name", paths: [], sessionId: "s-1" },
    { where: "two have the name", paths: [TRANSCRIPT, ".claude/projects/-work-other/s-1.jsonl"], sessionId: "s-1" },
    { where: "the id has a character a file name pattern reads", paths: [TRANSCRIPT], sessionId: "s-[1]" },
  ])("finds no chat when $where", async ({ paths, sessionId }) => {
    findFiles.mockResolvedValue(paths);

    expect(await claudeAdapter.locate(host, pane({ sessionId }))).toBeNull();
  });
});

describe("the Claude adapter: the question the agent waits for", () => {
  const ask = (questions: unknown[], id = "toolu_1") =>
    JSON.stringify({
      type: "assistant",
      uuid: "a1",
      message: { content: [{ type: "tool_use", id, name: "AskUserQuestion", input: { questions } }] },
    });

  const question = {
    question: "Which color?",
    header: "Color",
    multiSelect: true,
    options: [{ label: "Red", description: "Warm" }, { label: "Blue" }],
  };

  it("gives the options of the question call that has no result", () => {
    const { chat } = claudeAdapter.addLines(EMPTY_TRANSCRIBED, [ask([question])], 1);

    expect(getPendingQuestion(claudeAdapter, chat)).toEqual({
      callId: "toolu_1",
      questions: [{ text: "Which color?", header: "Color", isMultiSelect: true, options: [{ label: "Red", description: "Warm" }, { label: "Blue" }] }],
    });
  });

  it("gives none once the call has its result", () => {
    const result = JSON.stringify({ type: "user", uuid: "u1", message: { content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "Red" }] } });
    const { chat } = claudeAdapter.addLines(EMPTY_TRANSCRIBED, [ask([question]), result], 1);

    expect(getPendingQuestion(claudeAdapter, chat)).toBeNull();
  });

  it("gives the last of two calls that wait", () => {
    const { chat } = claudeAdapter.addLines(EMPTY_TRANSCRIBED, [ask([question], "toolu_1"), ask([{ ...question, question: "Which size?" }], "toolu_2")], 1);

    expect(getPendingQuestion(claudeAdapter, chat)).toMatchObject({ callId: "toolu_2", questions: [{ text: "Which size?" }] });
  });

  it.each([
    { where: "a question with no options", questions: [{ question: "Why?", options: [] }] },
    { where: "a question with no text", questions: [{ options: [{ label: "A" }] }] },
    { where: "questions that are not objects", questions: ["Why?", null] },
  ])("gives none for $where", ({ questions }) => {
    const { chat } = claudeAdapter.addLines(EMPTY_TRANSCRIBED, [ask(questions)], 1);

    expect(getPendingQuestion(claudeAdapter, chat)).toBeNull();
  });
});
