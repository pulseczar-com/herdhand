import snapshot from "./fixtures/tui-snapshot.json";
import { makeTuiBackend, makeTuiClient, snapshotToSpaces } from "./tui";

// The fixture is a `session.snapshot` reply recorded from `herdr remote-api-bridge`, with names
// replaced by placeholders.
describe("snapshotToSpaces (TUI)", () => {
  const spaces = snapshotToSpaces(snapshot);

  it("keeps Herdr's order and names of workspaces and tabs", () => {
    expect(spaces.map((space) => space.name)).toEqual(["api", "servers"]);
    expect(spaces[0].tabs.map((tab) => tab.name)).toEqual(["agents", "1"]);
  });

  it.each([
    { where: "a working agent", tab: 0, pane: 0, expected: { id: "w4:p1", agent: "claude", state: "working", title: "Run the tests", isFinished: false, columns: null } },
    { where: "a blocked agent in the same tab", tab: 0, pane: 1, expected: { id: "w4:p2", agent: "codex", state: "blocked", title: "codex", isFinished: false, columns: null } },
    { where: "a done agent", tab: 1, pane: 0, expected: { id: "w4:pH", agent: "claude", state: "done", title: "Update the readme", isFinished: false, columns: null, sessionId: "00000000-0000-0000-0000-000000000000" } },
  ])("reads $where", ({ tab, pane, expected }) => {
    expect(spaces[0].tabs[tab].panes[pane]).toEqual(expected);
  });

  it("shows a pane with no agent as a plain shell", () => {
    expect(spaces[1].tabs[0].panes).toEqual([{ id: "w7:p1", agent: null, state: null, title: "test-user@test-box: ~", isFinished: false, columns: null }]);
  });

  it.each([
    { where: "a label", label: "build", expected: "build" },
    { where: "a null label", label: null, expected: "zsh" },
    { where: "an empty label", label: "", expected: "zsh" },
  ])("shows the pane title for $where", ({ label, expected }) => {
    const reply = {
      snapshot: {
        workspaces: [{ workspace_id: "w1", label: "api" }],
        tabs: [{ tab_id: "w1:t1", workspace_id: "w1", label: "main" }],
        panes: [{ pane_id: "w1:p1", tab_id: "w1:t1", label, terminal_title_stripped: "zsh" }],
      },
    };
    expect(snapshotToSpaces(reply)[0].tabs[0].panes[0].title).toBe(expected);
  });

  it.each([
    { name: "the width of its layout rect", rect: { width: 120 }, expected: 120 },
    { name: "a width of zero", rect: { width: 0 }, expected: null },
    { name: "no pane in the layouts", rect: undefined, expected: null },
  ])("reads $name as the pane's columns", ({ rect, expected }) => {
    const reply = {
      snapshot: {
        workspaces: [{ workspace_id: "w1", label: "api" }],
        tabs: [{ tab_id: "w1:t1", workspace_id: "w1", label: "main" }],
        panes: [{ pane_id: "w1:p1", tab_id: "w1:t1" }, { pane_id: "w1:p2", tab_id: "w1:t1" }],
        layouts: [{ tab_id: "w1:t1", panes: [{ pane_id: "w1:p1", rect }, { pane_id: "w1:p3", rect: { width: 80 } }] }],
      },
    };
    expect(snapshotToSpaces(reply)[0].tabs[0].panes[0].columns).toBe(expected);
    expect(snapshotToSpaces(reply)[0].tabs[0].panes[1].columns).toBeNull();
  });

  it.each([
    { where: "a session id", session: { kind: "id", value: "s-1" }, expected: "s-1" },
    { where: "a session that is a path", session: { kind: "path", value: "/work/s.jsonl" }, expected: undefined },
    { where: "a session of a kind it does not know", session: { kind: "url", value: "x" }, expected: undefined },
    { where: "a session with no value", session: { kind: "id" }, expected: undefined },
    { where: "no session", session: undefined, expected: undefined },
  ])("reads $where as the pane's session id", ({ session, expected }) => {
    const reply = {
      snapshot: {
        workspaces: [{ workspace_id: "w1", label: "api" }],
        tabs: [{ tab_id: "w1:t1", workspace_id: "w1", label: "main" }],
        panes: [{ pane_id: "w1:p1", tab_id: "w1:t1", agent: "claude", agent_session: session }],
      },
    };
    expect(snapshotToSpaces(reply)[0].tabs[0].panes[0].sessionId).toBe(expected);
  });

  it.each([
    { where: "a session path", session: { kind: "path", value: "/work/s.jsonl" }, expected: "/work/s.jsonl" },
    { where: "a session id", session: { kind: "id", value: "s-1" }, expected: undefined },
    { where: "a session path with no value", session: { kind: "path" }, expected: undefined },
  ])("reads $where as the pane's session path", ({ session, expected }) => {
    const reply = {
      snapshot: {
        workspaces: [{ workspace_id: "w1", label: "api" }],
        tabs: [{ tab_id: "w1:t1", workspace_id: "w1", label: "main" }],
        panes: [{ pane_id: "w1:p1", tab_id: "w1:t1", agent: "pi", agent_session: session }],
      },
    };
    expect(snapshotToSpaces(reply)[0].tabs[0].panes[0].sessionPath).toBe(expected);
  });

  it("does not fail on an empty reply", () => {
    expect(snapshotToSpaces({})).toEqual([]);
  });
});

describe("getPane (TUI)", () => {
  function makeBackendAnswering(reply: unknown) {
    const sent: { method: string }[] = [];
    const client = makeTuiClient((line) => {
      const request = JSON.parse(line);
      sent.push(request);
      client.receive({ id: request.id, result: reply });
    });
    return { backend: makeTuiBackend(client), sent };
  }

  it("finds one pane, with its session, in a fresh snapshot", async () => {
    const { backend, sent } = makeBackendAnswering(snapshot);

    const pane = await backend.getPane?.("w4:pH");

    expect(sent.map((request) => request.method)).toEqual(["session.snapshot"]);
    expect(pane).toMatchObject({ id: "w4:pH", agent: "claude", sessionId: "00000000-0000-0000-0000-000000000000" });
  });

  it("fails for a pane the snapshot does not have", async () => {
    const { backend } = makeBackendAnswering(snapshot);

    await expect(backend.getPane?.("w9:p9")).rejects.toThrow("No pane w9:p9");
  });
});
