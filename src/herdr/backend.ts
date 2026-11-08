/** What the app asks of a machine's Herdr. The desktop app and the TUI each have a version. */
export type Backend = {
  getVersion(): Promise<string>;
  /** The spaces (TUI: workspaces), their tabs and their panes, in Herdr's order. */
  listSpaces(): Promise<Space[]>;
  /**
   * The pane's text: its screen and up to READ_LINES lines of history. The TUI's text carries SGR
   * style codes (for dim text); callers strip them with `parseStyledText`.
   */
  readPane(paneId: string): Promise<string>;
  /** Types the text into the pane and presses Enter. */
  sendLine(paneId: string, text: string): Promise<void>;
  pressKey(paneId: string, key: PaneKey): Promise<void>;
  /** One pane, read fresh. */
  getPane?(paneId: string): Promise<Pane>;
  /**
   * Calls the listener once after Herdr changes (an agent's state, a tab or pane opening or
   * closing). Returns the function that removes it. Unset when the backend has no live events.
   */
  onChange?(listener: () => void): () => void;
};

/** How many lines of history a pane read asks for. */
export const READ_LINES = 200;

/** The key row's keys, in its order, by Herdr's key names, which both kinds share. */
export const PANE_KEYS = ["esc", "ctrl+c", "tab", "up", "down", "enter", "1", "2", "3", "4", "5", "6"] as const;
export type PaneKey = (typeof PANE_KEYS)[number];

export type Space = { id: string; name: string; tabs: Tab[] };

export type Tab = { id: string; name: string; panes: Pane[] };

/**
 * A pane. `agent` is null when Herdr names no agent; `state` is null for a plain shell.
 * `isFinished` is true when the program in the pane has exited but Herdr keeps the pane.
 * `columns` is the pane's width in terminal columns as Herdr reports it, or null when it gives none.
 * An agent pane on the desktop app also has its process id, the agent's own message, such as
 * what it asks while blocked, and what a blocked agent waits for when it says. An agent pane on
 * the TUI has `sessionId`, the agent's own session id, or `sessionPath`, the path of its session
 * file, when the agent's Herdr integration is installed. A plain shell pane has
 * `isShellForeground`: true when the shell itself is in the foreground, so no command runs.
 * The other fields stay unset where the kind gives none.
 */
export type Pane = {
  id: string;
  title: string;
  agent: string | null;
  state: AgentState | null;
  isFinished: boolean;
  columns: number | null;
  pid?: number;
  sessionId?: string;
  sessionPath?: string;
  isShellForeground?: boolean;
  message?: string;
  blockedKind?: BlockedKind;
};

/** What a blocked agent waits for: an approval, an answer to its question, or a sign-in. */
const BLOCKED_KINDS = ["permission", "question", "auth"] as const;
export type BlockedKind = (typeof BLOCKED_KINDS)[number];

/** A blocked kind from Herdr, or undefined when the agent said none or one this app does not know. */
export function toBlockedKind(value: unknown): BlockedKind | undefined {
  return BLOCKED_KINDS.find((kind) => kind === value);
}

/** The desktop app reports `error`; the TUI reports `unknown`. */
const AGENT_STATES = ["idle", "working", "blocked", "done", "error", "unknown"] as const;
export type AgentState = (typeof AGENT_STATES)[number];

export const AGENT_STATE_LABELS: Record<AgentState, string> = {
  idle: "Idle",
  working: "Working",
  blocked: "Needs you",
  done: "Done",
  error: "Error",
  unknown: "Unknown",
};

/** An agent state from Herdr, or `unknown` for a value this app does not know yet. */
export function toAgentState(value: unknown): AgentState {
  return AGENT_STATES.find((state) => state === value) ?? "unknown";
}
