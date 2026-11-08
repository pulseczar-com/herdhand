import type { AgentAdapter } from "@/chat/adapter";
import { getOnlyPath, getSafeSessionId } from "@/chat/locate";
import { CLAUDE_AGENTS, getSessionPath, getTranscriptFileName, getTranscriptPath, parseSession, TRANSCRIPTS_FOLDER } from "@/claude/paths";
import { addTranscriptLines, getChatInfo } from "@/claude/transcript";

// A transcript is a file of its own in a folder for each project.
const TRANSCRIPT_DEPTH = 2;

/**
 * Claude Code. The desktop app names the agent's process, whose session file names the session.
 * The TUI names the session itself (or its file), and the transcript is the one file of that name.
 */
export const claudeAdapter: AgentAdapter = {
  agents: CLAUDE_AGENTS,
  canLocate: (pane) => pane.pid !== undefined || pane.sessionId !== undefined,
  locate: async (host, pane) => {
    if (pane.pid !== undefined) {
      const session = parseSession((await host.readFile(getSessionPath(pane.pid))).text);
      return session ? getTranscriptPath(session) : null;
    }
    const sessionId = getSafeSessionId(pane);
    if (sessionId === null) return null;
    return getOnlyPath(await host.findFiles(TRANSCRIPTS_FOLDER, getTranscriptFileName(sessionId), TRANSCRIPT_DEPTH));
  },
  addLines: addTranscriptLines,
  getInfo: getChatInfo,
};
