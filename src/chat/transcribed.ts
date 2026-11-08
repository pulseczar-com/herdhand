import type { Chat, ChatItem, ToolItem, ToolResult } from "@/chat/chatItems";

/** A tool result is cut to this many characters. */
export const RESULT_LIMIT = 4_000;

/**
 * The chat, and the results whose call is not in it yet, by tool call id. A read can start between
 * a call and its result; the result waits for the call to arrive with an earlier page.
 */
export type Transcribed = { chat: Chat; orphans: ReadonlyMap<string, ToolResult> };

export const EMPTY_TRANSCRIBED: Transcribed = { chat: new Map(), orphans: new Map() };

/** The copies that one call adds records to. */
export type Working = { items: Map<string, ChatItem>; orphans: Map<string, ToolResult> };

/** A copy of the transcript that `add` changes, or the transcript itself when there is nothing to add. */
export function addToTranscribed(transcribed: Transcribed, lines: string[], add: (working: Working) => void): Transcribed {
  if (lines.length === 0) return transcribed;
  const working: Working = { items: new Map(transcribed.chat), orphans: new Map(transcribed.orphans) };
  add(working);
  return { chat: working.items, orphans: working.orphans };
}

/** A result goes into its call, in place. A result whose call is not in the chat waits as an orphan. */
export function setToolResult({ items, orphans }: Working, callId: string, result: ToolResult) {
  const call = items.get(callId);
  if (call?.kind === "tool") items.set(callId, { ...call, result });
  else orphans.set(callId, result);
}

/** A tool call, with the result that was waiting for it. */
export function setToolCall({ items, orphans }: Working, call: Omit<ToolItem, "kind" | "result">) {
  const waitingResult = orphans.get(call.id) ?? null;
  items.set(call.id, { kind: "tool", ...call, result: waitingResult });
  orphans.delete(call.id);
}

/** The text cut to RESULT_LIMIT, as a tool result. */
export function makeToolResult(text: string, isError: boolean): ToolResult {
  return { text: text.slice(0, RESULT_LIMIT), isError };
}

/** The line's JSON object, or null when it is not one. */
export function parseObject(line: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The last part of a path: the full path has a home folder and a user name in it. */
export function getFolderName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? "";
}

/** The value as an object, or an empty one. */
export function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** The value as a string, or "". */
export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
