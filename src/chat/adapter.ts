import type { ChatInfo } from "@/chat/chatItems";
import type { Transcribed } from "@/chat/transcribed";
import type { Pane } from "@/herdr/backend";
import type { HostReader } from "@/ssh/hostReader";

/**
 * What one agent needs to show its transcript as a chat. A transcript is a text file of one JSON
 * record a line. Each adapter is a small module with tolerant rules: a record it does not know is
 * skipped, as the formats have no promise of staying the same.
 */
export type AgentAdapter = {
  /** The names that Herdr gives the agent. */
  agents: readonly string[];
  /** Whether Herdr gave the pane what `locate` needs. */
  canLocate(pane: Pane): boolean;
  /**
   * The path of the pane's transcript, or null when the pane has none the app can be sure of. Fails
   * with FileReadError when a file it reads is missing.
   */
  locate(host: HostReader, pane: Pane): Promise<string | null>;
  /**
   * A copy of the transcript with the lines added. `firstLine` is the number of the first line in
   * the file, for an agent whose records have no id of their own.
   */
  addLines(transcribed: Transcribed, lines: string[], firstLine: number): Transcribed;
  /** The info with what the lines carry: each field from the newest line that has it. */
  getInfo(info: ChatInfo, lines: string[]): ChatInfo;
};

/**
 * A copy of the transcript with the lines added before it. The transcript's own items win for an
 * id both have, as they come from newer lines.
 */
export function addEarlierLines(adapter: AgentAdapter, transcribed: Transcribed, lines: string[], firstLine: number): Transcribed {
  const earlier = adapter.addLines({ chat: new Map(), orphans: transcribed.orphans }, lines, firstLine);
  return { chat: new Map([...earlier.chat, ...transcribed.chat]), orphans: earlier.orphans };
}
