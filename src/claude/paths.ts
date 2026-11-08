import { parseObject } from "@/chat/transcribed";
import type { Pane } from "@/herdr/backend";

/**
 * Where Claude Code keeps a pane's transcript. The paths are relative, so they start at Herdr's own
 * folder, which is the home folder where Herdr runs as the user.
 */

// The agent name Claude Code has in Herdr: the desktop app's, then the TUI's.
export const CLAUDE_AGENTS = ["claude-code", "claude"];
const CLAUDE_FOLDER = ".claude";
const NOT_LETTER_OR_DIGIT = /[^A-Za-z0-9]/g;

/** A Claude session: its id, and the folder Claude Code runs in. */
type ClaudeSession = { sessionId: string; cwd: string };

/** A pane that runs Claude Code, as Herdr names its agent. */
export function isClaudeAgent(pane: Pane): boolean {
  return pane.agent !== null && CLAUDE_AGENTS.includes(pane.agent);
}

/** The folder of all transcripts, which holds one folder for each project. */
export const TRANSCRIPTS_FOLDER = `${CLAUDE_FOLDER}/projects`;

/** The name of the transcript file of a session. */
export function getTranscriptFileName(sessionId: string): string {
  return `${sessionId}.jsonl`;
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

/**
 * The transcript's path. Its project folder is the session's folder with each character that is
 * not a letter or digit as "-".
 */
export function getTranscriptPath(session: ClaudeSession): string {
  const projectFolder = session.cwd.replace(NOT_LETTER_OR_DIGIT, "-");
  return `${TRANSCRIPTS_FOLDER}/${projectFolder}/${getTranscriptFileName(session.sessionId)}`;
}
