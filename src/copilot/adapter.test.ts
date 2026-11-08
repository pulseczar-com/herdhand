/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { EMPTY_TRANSCRIBED } from "@/chat/transcribed";
import type { Pane } from "@/herdr/backend";
import type { HostReader } from "@/ssh/hostReader";

import { copilotAdapter } from "./adapter";

// The fixture is a trimmed, demo-data `events.jsonl` in the event shape that the Copilot SDK
// documents (github/copilot-sdk, docs/features/streaming-events.md).
const LINES = readFileSync(join(__dirname, "fixtures", "events.jsonl"), "utf8").trimEnd().split("\n");

function pane(fields: Partial<Pane> = {}): Pane {
  return { id: "p1", title: "", agent: "copilot", state: "idle", isFinished: false, columns: null, ...fields };
}

describe("the Copilot adapter: reading events", () => {
  const { chat } = copilotAdapter.addLines(EMPTY_TRANSCRIBED, LINES, 1);

  it("shows prompts, replies, tool calls and compactions in order, and nothing else", () => {
    expect(Array.from(chat.values(), (item) => item.kind === "tool" ? `tool ${item.name}` : `${item.kind}: ${item.text}`)).toEqual([
      "prompt: Run the tests",
      "tool bash",
      "reply: The tests pass.",
      "note: Conversation compacted",
      "tool ask_user",
    ]);
  });

  it("gives a call its result", () => {
    expect(chat.get("tc1")).toEqual({
      kind: "tool",
      id: "tc1",
      name: "bash",
      summary: "Run the tests",
      input: "npm test",
      result: { text: "All tests pass.", isError: false },
    });
  });

  it.each([
    { where: "a result with a failure", data: { toolCallId: "tc1", success: false, error: { message: "Command failed" } }, expected: { text: "Command failed", isError: true } },
    { where: "a result with content and a failure", data: { toolCallId: "tc1", success: false, result: { content: "boom" } }, expected: { text: "boom", isError: true } },
  ])("reads $where", ({ data, expected }) => {
    const start = LINES[5];
    const complete = JSON.stringify({ type: "tool.execution_complete", id: "e9", data });

    expect(copilotAdapter.addLines(EMPTY_TRANSCRIBED, [start, complete], 1).chat.get("tc1")).toMatchObject({ result: expected });
  });

  it("holds a result until its call comes in an earlier page", () => {
    const later = copilotAdapter.addLines(EMPTY_TRANSCRIBED, [LINES[8]], 9);

    expect(later.orphans.get("tc1")).toEqual({ text: "All tests pass.", isError: false });
  });

  it.each([
    { where: "text that is not JSON", line: "{" },
    { where: "an event of a type it does not know", line: '{"type":"future.event","id":"x","data":{}}' },
    { where: "a call with no id", line: '{"type":"assistant.message","id":"x","data":{"toolRequests":[{"name":"bash"}]}}' },
    { where: "a prompt of a skill", line: '{"type":"user.message","id":"x","data":{"content":"Help","source":"skill-demo"}}' },
    { where: "an event of a sub-agent", line: '{"type":"user.message","id":"x","agentId":"sub","data":{"content":"Help"}}' },
    { where: "an ephemeral event", line: '{"type":"assistant.message","id":"x","ephemeral":true,"data":{"content":"Help"}}' },
  ])("skips $where", ({ line }) => {
    expect(copilotAdapter.addLines(EMPTY_TRANSCRIBED, [line], 1).chat.size).toBe(0);
  });

  it("names an event with no id by its line", () => {
    const line = '{"type":"user.message","data":{"content":"Hi"}}';

    expect(Array.from(copilotAdapter.addLines(EMPTY_TRANSCRIBED, [line], 7).chat.keys())).toEqual(["line-7"]);
  });

  it("reads the model, folder and branch from the newest events that have them", () => {
    expect(copilotAdapter.getInfo({}, LINES)).toEqual({ model: "demo-model", folder: "demo", branch: "main" });
  });
});

describe("the Copilot adapter: finding the events file", () => {
  const host: HostReader = { readFile: jest.fn(), findFiles: jest.fn() };

  it("names the file for the session id", async () => {
    expect(await copilotAdapter.locate(host, pane({ sessionId: "5d1f-demo" }))).toBe(".copilot/session-state/5d1f-demo/events.jsonl");
    expect(host.findFiles).not.toHaveBeenCalled();
  });

  it("takes the path Herdr gives", async () => {
    expect(await copilotAdapter.locate(host, pane({ sessionPath: "/work/events.jsonl" }))).toBe("/work/events.jsonl");
  });

  it.each(["../x", "a/b", ""])("finds no chat for the session id %p", async (sessionId) => {
    expect(await copilotAdapter.locate(host, pane({ sessionId }))).toBeNull();
  });

  it("cannot find a file without a session", () => {
    expect(copilotAdapter.canLocate(pane({ pid: 100 }))).toBe(false);
    expect(copilotAdapter.canLocate(pane({ sessionId: "s-1" }))).toBe(true);
  });
});
