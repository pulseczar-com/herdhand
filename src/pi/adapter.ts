import type { AgentAdapter } from "@/chat/adapter";
import { addPiLines, getPiInfo } from "@/pi/transcript";

/**
 * Pi and OMP. Herdr's integration for both gives the path of the session file, so the app looks
 * nothing up. Pi writes the file only after the first reply, so a new session has no chat yet.
 * Pi has no tool that asks a question.
 */
export const piAdapter: AgentAdapter = {
  agents: ["pi", "omp"],
  canLocate: (pane) => pane.sessionPath !== undefined,
  locate: async (_host, pane) => pane.sessionPath ?? null,
  addLines: addPiLines,
  getInfo: getPiInfo,
};
