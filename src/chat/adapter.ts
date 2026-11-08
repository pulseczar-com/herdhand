import type { Chat, ChatInfo } from "@/chat/chatItems";
import { parseObject, type Transcribed } from "@/chat/transcribed";
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
  /** The agent's tool that asks the person a question, if it has one. */
  questionTool?: QuestionTool;
};

export type QuestionTool = {
  name: string;
  /** The questions in the tool call's input, or an empty list when the input has none. */
  parse(input: Record<string, unknown>): Question[];
};

/** A question the agent waits for an answer to. */
export type Question = { text: string; header?: string; isMultiSelect: boolean; options: QuestionOption[] };

export type QuestionOption = { label: string; description?: string };

/** The question tool call that has no result yet. */
export type PendingQuestion = { callId: string; questions: Question[] };

/**
 * A copy of the transcript with the lines added before it. The transcript's own items win for an
 * id both have, as they come from newer lines.
 */
export function addEarlierLines(adapter: AgentAdapter, transcribed: Transcribed, lines: string[], firstLine: number): Transcribed {
  const earlier = adapter.addLines({ chat: new Map(), orphans: transcribed.orphans }, lines, firstLine);
  return { chat: new Map([...earlier.chat, ...transcribed.chat]), orphans: earlier.orphans };
}

/** The last question tool call in the chat that has no result, or null when the agent waits for none. */
export function getPendingQuestion(adapter: AgentAdapter, chat: Chat): PendingQuestion | null {
  const { questionTool } = adapter;
  if (!questionTool) return null;
  for (const item of Array.from(chat.values()).reverse()) {
    if (item.kind !== "tool" || item.name !== questionTool.name || item.result !== null) continue;
    const questions = questionTool.parse(parseObject(item.input) ?? {});
    if (questions.length > 0) return { callId: item.id, questions };
  }
  return null;
}
