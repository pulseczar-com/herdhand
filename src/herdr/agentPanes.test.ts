import { findPane, getAgentGroups, getBlockedPanes, getMostUrgentState } from "./agentPanes";
import type { AgentState, Pane, Space } from "./backend";

function pane(id: string, state: AgentState | null, isFinished = false): Pane {
  return { id, title: `title ${id}`, agent: state ? "claude" : null, state, isFinished, columns: null };
}

const spaces: Space[] = [
  {
    id: "s1",
    name: "api",
    tabs: [
      { id: "t1", name: "agents", panes: [pane("p1", "working"), pane("p2", "blocked")] },
      { id: "t2", name: "shells", panes: [pane("p3", null), pane("p4", null, true)] },
    ],
  },
  {
    id: "s2",
    name: "web",
    tabs: [{ id: "t3", name: "main", panes: [pane("p5", "done"), pane("p6", "blocked"), pane("p7", "idle"), pane("p8", "error")] }],
  },
];
const [api, web] = spaces;
const [agentsTab, shellsTab] = api.tabs;
const [mainTab] = web.tabs;

describe("findPane", () => {
  it.each([
    { name: "a pane in the second space", paneId: "p6", expected: { pane: pane("p6", "blocked"), space: web, tab: mainTab } },
    { name: "a shell", paneId: "p3", expected: { pane: pane("p3", null), space: api, tab: shellsTab } },
    { name: "an id the list does not have", paneId: "gone", expected: undefined },
  ])("finds $name", ({ paneId, expected }) => {
    expect(findPane(spaces, paneId)).toEqual(expected);
  });
});

describe("getBlockedPanes", () => {
  it.each([
    { name: "no spaces", spaces: [], expected: [] },
    { name: "no blocked pane", spaces: [{ ...api, tabs: [shellsTab] }], expected: [] },
    {
      name: "blocked panes in several spaces",
      spaces,
      expected: [
        { pane: pane("p2", "blocked"), space: api, tab: agentsTab },
        { pane: pane("p6", "blocked"), space: web, tab: mainTab },
      ],
    },
  ])("finds the blocked panes in Herdr's order for $name", ({ spaces: given, expected }) => {
    expect(getBlockedPanes(given)).toEqual(expected);
  });
});

describe("getAgentGroups", () => {
  it.each([
    { name: "no spaces", spaces: [], expected: [] },
    { name: "only shells", spaces: [{ ...api, tabs: [shellsTab] }], expected: [] },
    {
      name: "agents in several states",
      spaces,
      expected: [
        { state: "blocked", agentPanes: [{ pane: pane("p2", "blocked"), space: api, tab: agentsTab }, { pane: pane("p6", "blocked"), space: web, tab: mainTab }] },
        { state: "error", agentPanes: [{ pane: pane("p8", "error"), space: web, tab: mainTab }] },
        { state: "working", agentPanes: [{ pane: pane("p1", "working"), space: api, tab: agentsTab }] },
        { state: "done", agentPanes: [{ pane: pane("p5", "done"), space: web, tab: mainTab }] },
        { state: "idle", agentPanes: [{ pane: pane("p7", "idle"), space: web, tab: mainTab }] },
      ],
    },
  ])("groups the agents by state, most urgent first, for $name", ({ spaces: given, expected }) => {
    expect(getAgentGroups(given)).toEqual(expected);
  });
});

function space(...panes: Pane[]): Space {
  return { id: "s1", name: "api", tabs: [{ id: "t1", name: "main", panes }] };
}

describe("getMostUrgentState", () => {
  it.each([
    { where: "only shells", space: space(pane("p1", null)), expected: null },
    { where: "a finished agent", space: space(pane("p1", "done", true)), expected: null },
    { where: "blocked and working", space: space(pane("p1", "working"), pane("p2", "blocked")), expected: "blocked" },
    { where: "error and working", space: space(pane("p1", "working"), pane("p2", "error")), expected: "error" },
    { where: "blocked and error", space: space(pane("p1", "error"), pane("p2", "blocked")), expected: "blocked" },
    { where: "working and done", space: space(pane("p1", "done"), pane("p2", "working")), expected: "working" },
    { where: "idle only", space: space(pane("p1", "idle")), expected: "idle" },
  ])("gives $expected for $where", ({ space: given, expected }) => {
    expect(getMostUrgentState(given)).toBe(expected);
  });
});
