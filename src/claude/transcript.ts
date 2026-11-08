import type { AskedQuestion, ChatInfo } from "@/chat/chatItems";
import { COMPACTED_TEXT, IMAGE_TEXT, addLongLineNote, parseLongLineNote } from "@/chat/longLine";
import { getToolInputText, getToolSummary } from "@/chat/toolInput";
import {
  addToTranscribed,
  getFolderName,
  makeToolResult,
  parseObject,
  setToolCall,
  setToolResult,
  type Transcribed,
  type Working,
} from "@/chat/transcribed";

/**
 * Claude Code's transcript (one JSON record a line) as chat items. The format has no docs and
 * changes with Claude Code, so every rule is tolerant: a record or block it does not know is skipped.
 */

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

// Claude Code names the model of a reply it wrote itself, such as an error, this.
const SYNTHETIC_MODEL = "<synthetic>";
const ASK_TOOL = "AskUserQuestion";

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

/** A copy of the transcript with the lines added after it. */
export function addTranscriptLines(transcribed: Transcribed, lines: string[]): Transcribed {
  return addToTranscribed(transcribed, lines, (working) => {
    for (const line of lines) {
      const record = parseRecord(line);
      const note = record && parseLongLineNote(record);
      if (note) addLongLineNote(working, note);
      else if (record && isShown(record)) addRecord(working, record);
    }
  });
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

/** The line's record, or null when it is not a JSON object. */
function parseRecord(line: string): TranscriptRecord | null {
  return parseObject(line) as TranscriptRecord | null;
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

function addToolResult(working: Working, block: ContentBlock) {
  if (!block.tool_use_id) return;
  setToolResult(working, block.tool_use_id, makeToolResult(getResultText(block.content), Boolean(block.is_error)));
}

function getResultText(content: string | ContentBlock[] | undefined): string {
  return toBlocks(content)
    .map((block) => block.text ?? "")
    .join("\n");
}

// ---- Assistant records: a reply or a tool call ----

function addAssistantRecord(working: Working, record: ShownRecord) {
  toBlocks(record.message?.content).forEach((block, index) => {
    if (block.type === "text" && block.text) {
      const replyId = `${record.uuid}/${index}`;
      working.items.set(replyId, { kind: "reply", id: replyId, text: block.text });
    }
    if (block.type === "tool_use" && block.id) {
      const input = block.input ?? {};
      const name = String(block.name ?? "");
      const questions = name === ASK_TOOL ? getQuestions(input) : [];
      setToolCall(working, {
        id: block.id,
        name,
        summary: getToolSummary(input),
        input: getToolInputText(input),
        ...(questions.length > 0 && { questions }),
      });
    }
  });
}

/** The questions of an AskUserQuestion call. A question with no text, and an option with no label, are skipped. */
function getQuestions(input: Record<string, unknown>): AskedQuestion[] {
  if (!Array.isArray(input.questions)) return [];
  return input.questions.flatMap((asked: unknown) => {
    const { question, multiSelect, options } = (typeof asked === "object" && asked !== null ? asked : {}) as Record<string, unknown>;
    if (typeof question !== "string" || !question) return [];
    const labels = Array.isArray(options) ? options.map(getOptionLabel).filter((label): label is string => label !== null) : [];
    return [{ question, multiSelect: multiSelect === true, options: labels }];
  });
}

function getOptionLabel(option: unknown): string | null {
  const label = typeof option === "object" && option !== null ? (option as Record<string, unknown>).label : null;
  return typeof label === "string" && label ? label : null;
}
