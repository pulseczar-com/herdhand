import type { AgentAdapter } from "@/chat/adapter";
import { claudeAdapter } from "@/claude/adapter";
import { codexAdapter } from "@/codex/adapter";
import { copilotAdapter } from "@/copilot/adapter";
import type { Pane } from "@/herdr/backend";
import { piAdapter } from "@/pi/adapter";

const ADAPTERS: readonly AgentAdapter[] = [claudeAdapter, codexAdapter, copilotAdapter, piAdapter];

/** The adapter for the pane's agent, when Herdr gave the pane what the adapter needs to find its transcript. */
export function getAdapter(pane: Pane): AgentAdapter | null {
  const adapter = ADAPTERS.find((candidate) => pane.agent !== null && candidate.agents.includes(pane.agent));
  return adapter?.canLocate(pane) ? adapter : null;
}
