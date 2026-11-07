import type { Pane } from "@/herdr/backend";

import { getSessionPath, getTranscriptPath, isClaudePane, parseSession } from "./paths";

function pane(agent: string | null, pid?: number, sessionId?: string): Pane {
  return { id: "t1", title: "", agent, state: "idle", isFinished: false, columns: null, pid, sessionId };
}

describe("isClaudePane", () => {
  it.each([
    { where: "Claude Code with a process id", pane: pane("claude-code", 100), expected: true },
    { where: "Claude Code with no process id", pane: pane("claude-code"), expected: false },
    { where: "Claude Code on the TUI with a session id", pane: pane("claude", undefined, "s-1"), expected: true },
    { where: "Claude Code on the TUI with no session id", pane: pane("claude"), expected: false },
    { where: "another agent with a session id", pane: pane("codex", undefined, "s-1"), expected: false },
    { where: "another agent", pane: pane("codex", 100), expected: false },
    { where: "a shell", pane: pane(null, 100), expected: false },
  ])("is $expected for $where", ({ pane: given, expected }) => {
    expect(isClaudePane(given)).toBe(expected);
  });
});

describe("getSessionPath", () => {
  it("names the session file of the process", () => {
    expect(getSessionPath(4242)).toBe(".claude/sessions/4242.json");
  });
});

describe("parseSession", () => {
  it.each([
    { where: "a session file", text: '{"pid":1,"sessionId":"s-1","cwd":"/work/demo","startedAt":2}', expected: { sessionId: "s-1", cwd: "/work/demo" } },
    { where: "no session id", text: '{"cwd":"/work/demo"}', expected: null },
    { where: "no folder", text: '{"sessionId":"s-1"}', expected: null },
    { where: "a field that is not text", text: '{"sessionId":7,"cwd":"/work/demo"}', expected: null },
    { where: "text that is not JSON", text: "{", expected: null },
    { where: "JSON that is not an object", text: "null", expected: null },
  ])("reads $where", ({ text, expected }) => {
    expect(parseSession(text)).toEqual(expected);
  });
});

describe("getTranscriptPath", () => {
  it.each([
    { cwd: "/work/demo", expected: ".claude/projects/-work-demo/s-1.jsonl" },
    { cwd: "/work/my_app.v2", expected: ".claude/projects/-work-my-app-v2/s-1.jsonl" },
    { cwd: "/work/café", expected: ".claude/projects/-work-caf-/s-1.jsonl" },
  ])("puts the session for $cwd in $expected", ({ cwd, expected }) => {
    expect(getTranscriptPath({ sessionId: "s-1", cwd })).toBe(expected);
  });
});
