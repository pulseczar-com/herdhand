import type { Pane } from "@/herdr/backend";

import { getAdapter } from "./adapters";

function pane(agent: string | null, fields: Partial<Pane> = {}): Pane {
  return { id: "p1", title: "", agent, state: "idle", isFinished: false, columns: null, ...fields };
}

describe("getAdapter", () => {
  it.each([
    { where: "Claude Code on the desktop app, with a process id", given: pane("claude-code", { pid: 100 }), expected: "claude-code" },
    { where: "Claude Code on the TUI, with a session id", given: pane("claude", { sessionId: "s-1" }), expected: "claude-code" },
    { where: "Claude Code with a session path", given: pane("claude", { sessionPath: "/work/s.jsonl" }), expected: "claude-code" },
    { where: "Codex with a session id", given: pane("codex", { sessionId: "s-1" }), expected: "codex" },
    { where: "Copilot with a session id", given: pane("copilot", { sessionId: "s-1" }), expected: "copilot" },
    { where: "Pi with a session path", given: pane("pi", { sessionPath: "/work/s.jsonl" }), expected: "pi" },
    { where: "OMP with a session path", given: pane("omp", { sessionPath: "/work/s.jsonl" }), expected: "pi" },
    { where: "Claude Code with nothing to find its transcript by", given: pane("claude-code"), expected: null },
    { where: "Codex with only a process id", given: pane("codex", { pid: 100 }), expected: null },
    { where: "Pi with a session id, which names no file", given: pane("pi", { sessionId: "s-1" }), expected: null },
    { where: "an agent with no adapter", given: pane("gemini", { sessionId: "s-1" }), expected: null },
    { where: "a shell", given: pane(null, { pid: 100, sessionId: "s-1" }), expected: null },
  ])("gives the right adapter for $where", ({ given, expected }) => {
    const adapter = getAdapter(given);

    expect(adapter === null ? null : adapter.agents[0]).toBe(expected);
  });
});
