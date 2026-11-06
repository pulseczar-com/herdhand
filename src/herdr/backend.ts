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
  /** One pane, read fresh. Desktop app only. */
  getPane?(paneId: string): Promise<Pane>;
  /**
   * Lines of a text file on the machine; a relative path starts at Herdr's own folder. Fails with
   * FileReadError when Herdr cannot read the file. Desktop app only.
   */
  readFile?(path: string, lines?: LineRange): Promise<FileLines>;
};

/** Which lines to read: from `offset` (the first line is 1), at most `limit`. */
export type LineRange = { offset?: number; limit?: number };

/** The lines read, with their line ends, and how many lines the file has. */
export type FileLines = { text: string; first: number; last: number; lines: number };

/** Herdr answered that it cannot read the file: missing, not text, or a line too long. */
export class FileReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileReadError";
  }
}

/** How many lines of history a pane read asks for. */
export const READ_LINES = 200;

/** The key row's keys, in its order, by Herdr's key names, which both kinds share. */
export const PANE_KEYS = ["esc", "ctrl+c", "up", "down", "enter", "1", "2", "3"] as const;
export type PaneKey = (typeof PANE_KEYS)[number];

export type Space = { id: string; name: string; tabs: Tab[] };

export type Tab = { id: string; name: string; panes: Pane[] };

/**
 * A pane. `agent` is null when Herdr names no agent; `state` is null for a plain shell.
 * `isFinished` is true when the program in the pane has exited but Herdr keeps the pane.
 * `columns` is the pane's width in terminal columns as Herdr reports it, or null when it gives none.
 * An agent pane on the desktop app also has its process id and the agent's own message, such as
 * what it asks while blocked; the TUI gives neither.
 */
export type Pane = {
  id: string;
  title: string;
  agent: string | null;
  state: AgentState | null;
  isFinished: boolean;
  columns: number | null;
  pid?: number;
  message?: string;
};

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
