/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getPendingQuestion } from "@/chat/adapter";
import { EMPTY_TRANSCRIBED } from "@/chat/transcribed";
import type { Pane } from "@/herdr/backend";
import type { HostReader } from "@/ssh/hostReader";

import { piAdapter } from "./adapter";

// The fixture is a trimmed, demo-data session in the format that Pi documents (docs/session-format.md
// and docs/message-types.md in the Pi repository). OMP writes the same entries.
const LINES = readFileSync(join(__dirname, "fixtures", "session.jsonl"), "utf8").trimEnd().split("\n");

function pane(fields: Partial<Pane> = {}): Pane {
  return { id: "p1", title: "", agent: "pi", state: "idle", isFinished: false, columns: null, ...fields };
}

describe("the Pi adapter: reading a session", () => {
  const { chat } = piAdapter.addLines(EMPTY_TRANSCRIBED, LINES, 1);

  it("shows prompts, replies, tool calls and compactions in order, and nothing else", () => {
    expect(Array.from(chat.values(), (item) => item.kind === "tool" ? `tool ${item.name}` : `${item.kind}: ${item.text}`)).toEqual([
      "prompt: Fix the login bug",
      "reply: Looking at the auth module.",
      "tool read",
      "tool bash",
      "note: Conversation compacted",
      "reply: Fixed.",
    ]);
  });

  it("gives a call its result", () => {
    expect(chat.get("call_1")).toEqual({
      kind: "tool",
      id: "call_1",
      name: "read",
      summary: "src/auth.ts",
      input: JSON.stringify({ path: "src/auth.ts" }, null, 2),
      result: { text: "export function login() {}", isError: false },
    });
  });

  it("shows a command the person ran as a finished call, failed when its exit code is not 0", () => {
    expect(chat.get("e5f6a7b8")).toMatchObject({ name: "bash", summary: "npm test", result: { text: "1 failing", isError: true } });
  });

  it("holds a result until its call comes in an earlier page", () => {
    const later = piAdapter.addLines(EMPTY_TRANSCRIBED, [LINES[3]], 4);

    expect(later.orphans.has("call_1")).toBe(true);
  });

  it.each([
    { where: "a prompt of text blocks and an image", content: [{ type: "text", text: "Look" }, { type: "image", data: "x" }], expected: "Look\n[image]" },
    { where: "a prompt of plain text", content: "Hi", expected: "Hi" },
  ])("reads $where", ({ content, expected }) => {
    const line = JSON.stringify({ type: "message", id: "m1", message: { role: "user", content } });

    expect(Array.from(piAdapter.addLines(EMPTY_TRANSCRIBED, [line], 1).chat.values())).toEqual([{ kind: "prompt", id: "m1", text: expected }]);
  });

  it.each([
    { where: "text that is not JSON", line: "{" },
    { where: "an entry of a type it does not know", line: '{"type":"future","id":"x"}' },
    { where: "OMP's title line", line: '{"type":"title","title":"Demo"}' },
    { where: "a message of a role it does not know", line: '{"type":"message","id":"x","message":{"role":"custom","content":"Hi"}}' },
    { where: "a message with no id", line: '{"type":"message","message":{"role":"user","content":"Hi"}}' },
  ])("skips $where", ({ line }) => {
    expect(piAdapter.addLines(EMPTY_TRANSCRIBED, [line], 1).chat.size).toBe(0);
  });

  it("reads the folder and the newest model", () => {
    expect(piAdapter.getInfo({}, LINES)).toEqual({ folder: "demo", model: "other-model" });
  });

  it("has no question to wait for", () => {
    expect(getPendingQuestion(piAdapter, chat)).toBeNull();
  });
});

describe("the Pi adapter: finding the session file", () => {
  const host: HostReader = { readFile: jest.fn(), findFiles: jest.fn() };

  it("takes the path Herdr gives, and looks nothing up", async () => {
    expect(await piAdapter.locate(host, pane({ sessionPath: "/work/session.jsonl" }))).toBe("/work/session.jsonl");
    expect(host.findFiles).not.toHaveBeenCalled();
  });

  it.each([
    { where: "a session path", fields: { sessionPath: "/work/session.jsonl" }, expected: true },
    { where: "a session id", fields: { sessionId: "s-1" }, expected: false },
    { where: "only a process id, as on the desktop app", fields: { pid: 100 }, expected: false },
  ])("can find a file with $where: $expected", ({ fields, expected }) => {
    expect(piAdapter.canLocate(pane(fields))).toBe(expected);
  });
});
