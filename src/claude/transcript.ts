import type { Chat, ChatInfo, ChatItem, ToolItem, ToolResult } from "@/chat/chatItems";

/**
 * Claude Code's transcript (one JSON record a line) as chat items. The format has no docs and
 * changes with Claude Code, so every rule is tolerant: a record or block it does not know is skipped.
 */

/** A tool result is cut to this many characters. */
export const RESULT_LIMIT = 4_000;

// User text that starts with one of these tags is Claude Code's own output, not a prompt.
const HIDDEN_TAGS = [
  "bash-stdout",
  "bash-stderr",
  "local-command-stdout",
  "local-command-stderr",
  "local-command-caveat",
  "system-reminder",
  "task-notification",
  "user-prompt-submit-hook",
];

// The input fields that best say what a tool call does, best first.
const SUMMARY_FIELDS = ["description", "command", "file_path", "path", "pattern", "url", "query", "prompt"];

// Claude Code names the model of a reply it wrote itself, such as an error, this.
const SYNTHETIC_MODEL = "<synthetic>";
const IMAGE_TEXT = "[image]";
const COMPACTED_TEXT = "Conversation compacted";

// The parts of a record this app reads. Every field is optional, and unknown fields are ignored.
type TranscriptRecord = {
  type?: string;
  subtype?: string;
  uuid?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  cwd?: unknown;
  gitBranch?: unknown;
  message?: { content?: string | ContentBlock[]; model?: unknown };
};

type ContentBlock = {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | ContentBlock[];
  is_error?: boolean;
};

/**
 * The chat, and the results whose call is not in it yet, by tool call id. A read can start between
 * a call and its result; the result waits for the call to arrive with an earlier page.
 */
export type Transcribed = { chat: Chat; orphans: ReadonlyMap<string, ToolResult> };

// The copies that one call adds records to.
type Working = { items: Map<string, ChatItem>; orphans: Map<string, ToolResult> };

/** A copy of the transcript with the lines added after it. */
export function addTranscriptLines(transcribed: Transcribed, lines: string[]): Transcribed {
  if (lines.length === 0) return transcribed;
  const working: Working = { items: new Map(transcribed.chat), orphans: new Map(transcribed.orphans) };
  for (const line of lines) {
    const record = parseRecord(line);
    if (record && isShown(record)) addRecord(working, record);
  }
  return { chat: working.items, orphans: working.orphans };
}

/**
 * A copy of the transcript with the lines added before it. The transcript's own items win for an
 * id both have, as they come from newer lines.
 */
export function addEarlierLines(transcribed: Transcribed, lines: string[]): Transcribed {
  const earlier = addTranscriptLines({ chat: new Map(), orphans: transcribed.orphans }, lines);
  return { chat: new Map([...earlier.chat, ...transcribed.chat]), orphans: earlier.orphans };
}

/** The info with what the lines carry: each field from the newest line that has it. */
export function getChatInfo(info: ChatInfo, lines: string[]): ChatInfo {
  const next = { ...info };
  for (const line of lines) {
    const record = parseRecord(line);
    if (!record || record.isSidechain) continue;
    const model = record.message?.model;
    if (typeof model === "string" && model && model !== SYNTHETIC_MODEL) next.model = model;
    const folder = typeof record.cwd === "string" ? getFolderName(record.cwd) : "";
    if (folder) next.folder = folder;
    if (typeof record.gitBranch === "string" && record.gitBranch) next.branch = record.gitBranch;
  }
  return next;
}

/** The last part of a path: the full path has a home folder and a user name in it. */
function getFolderName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? "";
}

/** The line's record, or null when it is not a JSON object. */
function parseRecord(line: string): TranscriptRecord | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === "object" && parsed !== null ? (parsed as TranscriptRecord) : null;
  } catch {
    return null;
  }
}

/** Subagents' turns, Claude Code's own notes and summaries, and records with no id stay hidden. */
function isShown(record: TranscriptRecord): record is ShownRecord {
  return Boolean(record.uuid) && !record.isSidechain && !record.isMeta && !record.isCompactSummary;
}

type ShownRecord = TranscriptRecord & { uuid: string };

/** Adds a prompt, a reply, a tool call or result, or a compaction note; skips any other record. */
function addRecord(working: Working, record: ShownRecord) {
  if (record.type === "user") addUserRecord(working, record);
  if (record.type === "assistant") addAssistantRecord(working, record);
  if (record.type === "system" && record.subtype === "compact_boundary") {
    working.items.set(record.uuid, { kind: "note", id: record.uuid, text: COMPACTED_TEXT });
  }
}

// ---- User records: a prompt, or tool results ----

function addUserRecord(working: Working, record: ShownRecord) {
  const blocks = toBlocks(record.message?.content);
  for (const block of blocks) {
    if (block.type === "tool_result") addToolResult(working, block);
  }
  const text = getPromptText(blocks);
  if (text) working.items.set(record.uuid, { kind: "prompt", id: record.uuid, text });
}

/** The content's blocks; anything in it that is not an object is skipped. */
function toBlocks(content: string | ContentBlock[] | undefined): ContentBlock[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (!Array.isArray(content)) return [];
  return content.filter((block) => typeof block === "object" && block !== null);
}

/** The prompt's text and a mark for each image, or null when it is not a prompt the person typed. */
function getPromptText(blocks: ContentBlock[]): string | null {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "image") parts.push(IMAGE_TEXT);
    if (block.type === "text" && block.text) parts.push(block.text);
  }
  const text = parts.join("\n");
  if (startsWithHiddenTag(text)) return null;
  return getCommandPrompt(text) ?? text;
}

function startsWithHiddenTag(text: string): boolean {
  return HIDDEN_TAGS.some((tag) => text.startsWith(`<${tag}>`));
}

/** A slash command as "/name args", and a shell command (`!cmd`) as "! cmd". */
function getCommandPrompt(text: string): string | null {
  const shellCommand = getTagText(text, "bash-input");
  if (shellCommand !== null) return `! ${shellCommand}`;
  const command = getTagText(text, "command-name");
  if (command === null) return null;
  const args = getTagText(text, "command-args") ?? "";
  return `${command} ${args}`.trim();
}

function getTagText(text: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(text);
  return match ? match[1].trim() : null;
}

/** A result goes into its call, in place. A result whose call is not in the chat waits as an orphan. */
function addToolResult({ items, orphans }: Working, block: ContentBlock) {
  const id = String(block.tool_use_id);
  const text = getResultText(block.content);
  const result = { text: text.slice(0, RESULT_LIMIT), isError: Boolean(block.is_error) };
  const call = items.get(id);
  if (call?.kind === "tool") items.set(id, { ...call, result });
  else orphans.set(id, result);
}

function getResultText(content: string | ContentBlock[] | undefined): string {
  return toBlocks(content)
    .map((block) => block.text ?? "")
    .join("\n");
}

// ---- Assistant records: a reply or a tool call ----

function addAssistantRecord({ items, orphans }: Working, record: ShownRecord) {
  toBlocks(record.message?.content).forEach((block, index) => {
    if (block.type === "text" && block.text) {
      const replyId = `${record.uuid}/${index}`;
      items.set(replyId, { kind: "reply", id: replyId, text: block.text });
    }
    if (block.type === "tool_use" && block.id) {
      const waitingResult = orphans.get(block.id) ?? null;
      items.set(block.id, makeToolItem(block, block.id, waitingResult));
      orphans.delete(block.id);
    }
  });
}

function makeToolItem(block: ContentBlock, id: string, result: ToolResult | null): ToolItem {
  const input = block.input ?? {};
  return {
    kind: "tool",
    id,
    name: String(block.name ?? ""),
    summary: getSummary(input),
    input: getInputText(input),
    result,
  };
}

/** The first summary field the call has. */
function getSummary(input: Record<string, unknown>): string {
  const field = SUMMARY_FIELDS.find((name) => typeof input[name] === "string");
  return field ? String(input[field]) : "";
}

/** A shell command as it was typed; any other input as JSON. */
function getInputText(input: Record<string, unknown>): string {
  if (typeof input.command === "string") return input.command;
  return JSON.stringify(input, null, 2).slice(0, RESULT_LIMIT);
}
