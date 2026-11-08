import { makeToolResult, setToolResult, type Working } from "@/chat/transcribed";

export const IMAGE_TEXT = "[image]";
export const COMPACTED_TEXT = "Conversation compacted";
const LONG_LINE_TEXT = "Large item not shown (image or long output)";
const LONG_RESULT_TEXT = "Result not shown (too long)";

/**
 * What the host's file read prints in place of a line too long to send (see `readLinesCommand`).
 * It is the same for every agent. `callId` is set when the line was a tool result.
 */
export type LongLineNote = { line: number; callId?: string; failed: boolean };

/** The note a record is, or null when it is a record of the agent. */
export function parseLongLineNote(record: object): LongLineNote | null {
  const { herdhandLongLine: line, callId, failed } = record as Record<string, unknown>;
  if (typeof line !== "number") return null;
  return { line, callId: typeof callId === "string" ? callId : undefined, failed: failed === true };
}

/** A tool result in its call, or a reply that says an item is not shown. */
export function addLongLineNote(working: Working, { line, callId, failed }: LongLineNote) {
  if (callId !== undefined) {
    setToolResult(working, callId, makeToolResult(LONG_RESULT_TEXT, failed));
    return;
  }
  const id = `long-line-${line}`;
  working.items.set(id, { kind: "reply", id, text: LONG_LINE_TEXT });
}
