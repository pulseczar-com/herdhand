import type { AgentState, Pane } from "./backend";
import { describePane, describePlace, getAgentName, getPaneBadge, getSpaceColor, getSpaceLetter } from "./badges";

function pane(state: AgentState | null, isFinished = false): Pane {
  return { id: "p1", title: "zsh", agent: state ? "claude" : null, state, isFinished, columns: null };
}

describe("getPaneBadge", () => {
  it.each([
    { where: "a plain shell", pane: pane(null), expected: { label: "Shell", tone: "neutral" } },
    { where: "a finished terminal", pane: pane("done", true), expected: { label: "Finished", tone: "neutral" } },
    { where: "a blocked agent", pane: pane("blocked"), expected: { label: "Needs you", tone: "attention" } },
    { where: "a working agent", pane: pane("working"), expected: { label: "Working", tone: "active" } },
    { where: "a done agent", pane: pane("done"), expected: { label: "Done", tone: "success" } },
    { where: "an agent in error", pane: pane("error"), expected: { label: "Error", tone: "danger" } },
    { where: "an idle agent", pane: pane("idle"), expected: { label: "Idle", tone: "neutral" } },
    { where: "an unknown state", pane: pane("unknown"), expected: { label: "Unknown", tone: "neutral" } },
  ])("shows $where as $expected.label", ({ pane: given, expected }) => {
    expect(getPaneBadge(given)).toEqual(expected);
  });
});

describe("getSpaceLetter", () => {
  it.each([
    { name: "api", expected: "A" },
    { name: "~/web-app", expected: "W" },
    { name: "2026 notes", expected: "2" },
    { name: "~", expected: "~" },
    { name: "", expected: "#" },
  ])("gives $expected for '$name'", ({ name, expected }) => {
    expect(getSpaceLetter(name)).toBe(expected);
  });
});

describe("getSpaceColor", () => {
  // Expected colors come from Java's String.hashCode (kept to unsigned 32 bits) modulo the six palette colors.
  it.each([
    { id: "w1", expected: "#bd6790" },
    { id: "w4", expected: "#c67e57" },
    { id: "api", expected: "#5d84cc" },
    { id: "spce70310846", expected: "#5d84cc" },
  ])("gives the space id $id the color $expected", ({ id, expected }) => {
    expect(getSpaceColor(id)).toBe(expected);
  });

  it("spreads ids over the palette", () => {
    const colors = new Set(["w1", "w2", "w3", "w4", "w5", "w6", "w7", "w8"].map(getSpaceColor));
    expect(colors.size).toBeGreaterThan(2);
  });
});

describe("describePane", () => {
  it.each([
    { where: "an agent with a title", pane: { ...pane("working"), title: "Fix the build" }, expected: "claude · Fix the build" },
    { where: "a shell", pane: pane(null), expected: "zsh" },
    { where: "an agent with no title", pane: { ...pane("done"), title: "" }, expected: "claude" },
  ])("names $where '$expected'", ({ pane: given, expected }) => {
    expect(describePane(given)).toBe(expected);
  });
});

describe("describePlace", () => {
  it.each([
    { where: "a named tab", tabName: "agents", title: "Fix the build", expected: "agents · Fix the build" },
    { where: "an unnamed tab", tabName: "", title: "zsh", expected: "zsh" },
    { where: "a pane with no title", tabName: "agents", title: "", expected: "agents" },
  ])("names $where '$expected'", ({ tabName, title, expected }) => {
    const tab = { id: "t1", name: tabName, panes: [] };
    expect(describePlace(tab, { ...pane(null), title })).toBe(expected);
  });
});

describe("getAgentName", () => {
  it.each([
    { where: "a named agent", pane: pane("working"), expected: "claude" },
    { where: "an agent Herdr does not name", pane: { ...pane("working"), agent: null }, expected: "zsh" },
  ])("names $where '$expected'", ({ pane: given, expected }) => {
    expect(getAgentName(given)).toBe(expected);
  });
});
