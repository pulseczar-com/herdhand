import type { AgentState, Pane, Space, Tab } from "./backend";

/** A pane with the space and tab it is in. */
export type LocatedPane = { pane: Pane; space: Space; tab: Tab };

/** The agents in one state, in Herdr's order. */
export type AgentGroup = { state: AgentState; agentPanes: LocatedPane[] };

// Most urgent first: the order of the Agents groups, and which state a space's dot shows.
const STATE_URGENCY: AgentState[] = ["blocked", "error", "working", "done", "idle", "unknown"];

/** The pane with this id and its place, or undefined when the list does not have it. */
export function findPane(spaces: Space[], paneId: string): LocatedPane | undefined {
  for (const space of spaces) {
    for (const tab of space.tabs) {
      const pane = tab.panes.find((candidate) => candidate.id === paneId);
      if (pane) return { pane, space, tab };
    }
  }
  return undefined;
}

/** Every agent Herdr reports as blocked, in Herdr's order. */
export function getBlockedPanes(spaces: Space[]): LocatedPane[] {
  return getAgentPanes(spaces).filter(({ pane }) => pane.state === "blocked");
}

/** The agents grouped by state, most urgent first, with no empty group. */
export function getAgentGroups(spaces: Space[]): AgentGroup[] {
  const agentPanes = getAgentPanes(spaces);
  const groups = STATE_URGENCY.map((state) => ({
    state,
    agentPanes: agentPanes.filter(({ pane }) => pane.state === state),
  }));
  return groups.filter((group) => group.agentPanes.length > 0);
}

/** The state of the space's most urgent agent, or null when it has none. */
export function getMostUrgentState(space: Space): AgentState | null {
  const livePanes = space.tabs.flatMap((tab) => tab.panes).filter(isLiveAgent);
  const states = livePanes.map((pane) => pane.state);
  return STATE_URGENCY.find((state) => states.includes(state)) ?? null;
}

/** Every pane with a live agent, in Herdr's order. Shells and finished panes are left out. */
function getAgentPanes(spaces: Space[]): LocatedPane[] {
  const agentPanes: LocatedPane[] = [];
  for (const space of spaces) {
    for (const tab of space.tabs) {
      for (const pane of tab.panes) {
        if (isLiveAgent(pane)) agentPanes.push({ pane, space, tab });
      }
    }
  }
  return agentPanes;
}

/** A pane whose agent Herdr reports and whose program still runs. */
function isLiveAgent(pane: Pane): boolean {
  return pane.state !== null && !pane.isFinished;
}
