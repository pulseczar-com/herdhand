import type { AgentAdapter } from "@/chat/adapter";
import { getSafeSessionId } from "@/chat/locate";
import { asString } from "@/chat/transcribed";
import { addCopilotLines, getCopilotInfo } from "@/copilot/transcript";

/**
 * GitHub Copilot CLI. Herdr's Copilot integration gives the session id, which names the session's
 * folder: `~/.copilot/session-state/<session id>/events.jsonl`.
 */
export const copilotAdapter: AgentAdapter = {
  agents: ["copilot"],
  canLocate: (pane) => pane.sessionId !== undefined || pane.sessionPath !== undefined,
  locate: async (_host, pane) => {
    if (pane.sessionPath !== undefined) return pane.sessionPath;
    const sessionId = getSafeSessionId(pane);
    return sessionId === null ? null : `.copilot/session-state/${sessionId}/events.jsonl`;
  },
  addLines: addCopilotLines,
  getInfo: getCopilotInfo,
  // The `ask_user` tool takes a question and the choices as plain text.
  questionTool: {
    name: "ask_user",
    parse: ({ question, choices }) => {
      const options = (Array.isArray(choices) ? choices : []).map(asString).filter(Boolean);
      if (!asString(question) || options.length === 0) return [];
      return [{ text: asString(question), isMultiSelect: false, options: options.map((label) => ({ label })) }];
    },
  },
};
