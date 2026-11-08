import type { HerdrClient } from "@/rpc/client";

import { makeDesktopBackend, toSpaces } from "./desktop";
import doc from "./fixtures/desktop-doc.json";
import terminals from "./fixtures/desktop-terminals.json";

// The fixtures are `doc.get {name: "herdr-app"}` and `terminal.list` replies recorded from
// `hc connect`, with names replaced by placeholders.
describe("toSpaces (desktop app)", () => {
  const spaces = toSpaces(doc, terminals);

  it("keeps Herdr's order and names of spaces and tabs", () => {
    expect(spaces.map((space) => space.name)).toEqual(["api", "servers"]);
    expect(spaces[0].tabs.map((tab) => tab.name)).toEqual(["agents", "2"]);
  });

  it.each([
    { where: "the first pane of a row", tab: 0, pane: 0, expected: { id: "t11", agent: "claude-code", state: "done", title: "Update the readme", isFinished: false, columns: null, pid: 100, message: "Edited the readme" } },
    { where: "a pane in a nested split", tab: 0, pane: 1, expected: { id: "t12", agent: "claude-code", state: "working", title: "Run the tests", isFinished: false, columns: null } },
    { where: "the next pane in that split", tab: 0, pane: 2, expected: { id: "t13", agent: "codex", state: "blocked", title: "codex", isFinished: false, columns: null } },
    { where: "an idle agent", tab: 1, pane: 0, expected: { id: "t2j", agent: "claude-code", state: "idle", title: "", isFinished: false, columns: null } },
  ])("reads $where", ({ tab, pane, expected }) => {
    expect(spaces[0].tabs[tab].panes[pane]).toEqual(expected);
  });

  it("shows a plain shell with no agent, and a finished terminal in its place", () => {
    expect(spaces[1].tabs[0].panes).toEqual([
      { id: "t10", agent: null, state: null, title: "test-user@test-box: ~", isFinished: false, columns: null, isShellForeground: false },
      { id: "t14", agent: null, state: null, title: "make build", isFinished: true, columns: null },
    ]);
  });

  it.each([
    { name: "its width", cols: 200, expected: 200 },
    { name: "no width", cols: undefined, expected: null },
    { name: "a width of zero", cols: 0, expected: null },
  ])("reads $name as the pane's columns", ({ cols, expected }) => {
    const reply = { terminals: [{ address: "t11", title: "", cols }] };
    expect(toSpaces(doc, reply)[0].tabs[0].panes[0].columns).toBe(expected);
  });

  it("skips a pane whose terminal the reply does not contain", () => {
    expect(spaces[1].tabs[0].panes.map((pane) => pane.id)).not.toContain("t99");
  });

  it.each([
    { name: "an empty reply", doc: {}, terminals: {} },
    { name: "a space with no tabs", doc: { value: { spaces: [{ id: "s", name: "x" }] } }, terminals: {} },
  ])("does not fail on $name", ({ doc: oddDoc, terminals: oddTerminals }) => {
    expect(() => toSpaces(oddDoc, oddTerminals)).not.toThrow();
  });

  it("names an unknown agent state unknown", () => {
    const reply = { terminals: [{ address: "t11", status: { app: "claude-code", state: "thinking" }, title: "" }] };
    expect(toSpaces(doc, reply)[0].tabs[0].panes[0].state).toBe("unknown");
  });

  it("asks for finished terminals too, so no pane of the layout is left out", async () => {
    const request = jest.fn((method: string) => Promise.resolve(method === "doc.get" ? doc : terminals));
    const client = { request, receive: jest.fn(), rejectAll: jest.fn() } as HerdrClient;

    const listed = await makeDesktopBackend(client).listSpaces();

    expect(request).toHaveBeenCalledWith("terminal.list", { all: true });
    expect(listed[1].tabs[0].panes.map((pane) => pane.id)).toEqual(["t10", "t14"]);
  });
});
