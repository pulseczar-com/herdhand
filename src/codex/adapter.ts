import type { AgentAdapter } from "@/chat/adapter";
import { getOnlyPath, getSafeSessionId } from "@/chat/locate";
import { addCodexLines, getCodexInfo } from "@/codex/transcript";

// A rollout file is in a folder for the year, one for the month and one for the day.
const SESSIONS_FOLDER = ".codex/sessions";
const ROLLOUT_DEPTH = 4;

/**
 * Codex. Herdr's Codex integration gives the thread id, which ends the rollout file's name:
 * `rollout-<time>-<thread id>.jsonl`. Files that Codex compressed (`.jsonl.zst`) are not read.
 */
export const codexAdapter: AgentAdapter = {
  agents: ["codex"],
  canLocate: (pane) => pane.sessionId !== undefined,
  locate: async (host, pane) => {
    const sessionId = getSafeSessionId(pane);
    if (sessionId === null) return null;
    return getOnlyPath(await host.findFiles(SESSIONS_FOLDER, `rollout-*-${sessionId}.jsonl`, ROLLOUT_DEPTH));
  },
  addLines: addCodexLines,
  getInfo: getCodexInfo,
};
