import type { AgentAdapter } from "@/chat/adapter";
import { getSafeSessionId } from "@/chat/locate";
import { addCopilotLines, getCopilotInfo } from "@/copilot/transcript";

/**
 * GitHub Copilot CLI. Herdr's Copilot integration gives the session id, which names the session's
 * folder: `~/.copilot/session-state/<session id>/events.jsonl`.
 */
export const copilotAdapter: AgentAdapter = {
  agents: ["copilot"],
  canLocate: (pane) => pane.sessionId !== undefined,
  locate: async (_host, pane) => {
    const sessionId = getSafeSessionId(pane);
    return sessionId === null ? null : `.copilot/session-state/${sessionId}/events.jsonl`;
  },
  addLines: addCopilotLines,
  getInfo: getCopilotInfo,
};
