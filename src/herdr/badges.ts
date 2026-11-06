import { AGENT_STATE_LABELS, type AgentState, type Pane, type Tab } from "./backend";

/** What a pill's color means; the colors themselves live with the pill. */
export type BadgeTone = "attention" | "active" | "success" | "danger" | "neutral";

export type PaneBadge = { label: string; tone: BadgeTone };

export const STATE_TONES: Record<AgentState, BadgeTone> = {
  blocked: "attention",
  working: "active",
  done: "success",
  error: "danger",
  idle: "neutral",
  unknown: "neutral",
};

/** The space badge colors, as in the mockups. Herdr gives spaces no color of their own. */
const SPACE_COLORS = ["#bd6790", "#399a8f", "#5d84cc", "#c67e57", "#4e9c6b", "#8377cf"];

const SHELL_BADGE: PaneBadge = { label: "Shell", tone: "neutral" };
const FINISHED_BADGE: PaneBadge = { label: "Finished", tone: "neutral" };
const NO_LETTER = "#";
const HASH_MULTIPLIER = 31;

/** The pane's pill: its agent's state, or Finished, or Shell. */
export function getPaneBadge(pane: Pane): PaneBadge {
  if (pane.isFinished) return FINISHED_BADGE;
  if (!pane.state) return SHELL_BADGE;
  return { label: AGENT_STATE_LABELS[pane.state], tone: STATE_TONES[pane.state] };
}

/** "claude · Fix the build" for an agent, the title alone for a shell. */
export function describePane(pane: Pane): string {
  return joinNonEmpty([pane.agent, pane.title]);
}

/** The agent's name, or the pane's title when Herdr names no agent. */
export function getAgentName(pane: Pane): string {
  return pane.agent ?? pane.title;
}

/** Where a pane is inside its space: "agents · Fix the build". */
export function describePlace(tab: Tab, pane: Pane): string {
  return joinNonEmpty([tab.name, pane.title]);
}

function joinNonEmpty(parts: (string | null)[]): string {
  return parts.filter(Boolean).join(" · ");
}

/** The badge letter: the name's first letter or digit, or its first character, upper case. */
export function getSpaceLetter(name: string): string {
  const firstLetter = Array.from(name).find((character) => /[\p{L}\p{N}]/u.test(character));
  const letter = firstLetter ?? name.charAt(0);
  return letter.toUpperCase() || NO_LETTER;
}

/** A palette color picked from the space id, so a space keeps its color across loads. */
export function getSpaceColor(spaceId: string): string {
  // A string hash as in Java's String.hashCode, kept to an unsigned 32-bit number.
  let hash = 0;
  for (const character of spaceId) hash = (hash * HASH_MULTIPLIER + character.charCodeAt(0)) >>> 0;
  return SPACE_COLORS[hash % SPACE_COLORS.length];
}
