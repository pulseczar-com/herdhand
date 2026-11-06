import type { Pane } from "@/herdr/backend";

/**
 * Where Claude Code keeps a pane's transcript. The paths are relative, so they start at Herdr's own
 * folder, which is the home folder where Herdr runs as the user.
 */

// The agent name Claude Code reports to Herdr.
const CLAUDE_AGENT = "claude-code";
const CLAUDE_FOLDER = ".claude";
const NOT_LETTER_OR_DIGIT = /[^A-Za-z0-9]/g;

/** A Claude session: its id, and the folder Claude Code runs in. */
type ClaudeSession = { sessionId: string; cwd: string };

/** A pane that runs Claude Code, as Herdr names its agent. */
export function isClaudeAgent(pane: Pane): boolean {
  return pane.agent === CLAUDE_AGENT;
}

/** A Claude Code pane whose process the app can find the session of. */
export function isClaudePane(pane: Pane): pane is Pane & { pid: number } {
  return isClaudeAgent(pane) && pane.pid !== undefined;
}

/** The file where Claude Code names the session that a process runs. */
export function getSessionPath(pid: number): string {
  return `${CLAUDE_FOLDER}/sessions/${pid}.json`;
}

/** The session id and folder from a session file, or null when either is missing. */
export function parseSession(text: string): ClaudeSession | null {
  const session = parseObject(text);
  if (typeof session?.sessionId !== "string" || typeof session.cwd !== "string") return null;
  return { sessionId: session.sessionId, cwd: session.cwd };
}

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" ? (parsed as Record<string, unknown> | null) : null;
  } catch {
    return null;
  }
}

/**
 * The transcript's path. Its project folder is the session's folder with each character that is
 * not a letter or digit as "-".
 */
export function getTranscriptPath(session: ClaudeSession): string {
  const projectFolder = session.cwd.replace(NOT_LETTER_OR_DIGIT, "-");
  return `${CLAUDE_FOLDER}/projects/${projectFolder}/${session.sessionId}.jsonl`;
}
