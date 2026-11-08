import type { ChatInfo } from "@/chat/chatItems";
import { COMPACTED_TEXT, IMAGE_TEXT, addLongLineNote, parseLongLineNote } from "@/chat/longLine";
import { getToolInputText, getToolSummary } from "@/chat/toolInput";
import {
  addToTranscribed,
  asObject,
  asString,
  getFolderName,
  makeToolResult,
  parseObject,
  setToolCall,
  setToolResult,
  type Transcribed,
  type Working,
} from "@/chat/transcribed";

/**
 * The session file of Pi and of OMP (one entry a line, in a tree of `id` and `parentId`) as chat
 * items. Both write the format that Pi documents as `docs/session-format.md`; OMP adds a title
 * line, which is skipped like any entry the app does not know. The chat shows every message in
 * the order of the file, so a branch the person left (with `/tree`) shows as well.
 */


/** A copy of the transcript with the lines added after it. */
export function addPiLines(transcribed: Transcribed, lines: string[]): Transcribed {
  return addToTranscribed(transcribed, lines, (working) => {
    for (const line of lines) {
      const entry = parseObject(line);
      if (!entry) continue;
      const note = parseLongLineNote(entry);
      if (note) addLongLineNote(working, note);
      else addEntry(working, entry);
    }
  });
}

/** The info with what the lines carry: each field from the newest line that has it. */
export function getPiInfo(info: ChatInfo, lines: string[]): ChatInfo {
  const next = { ...info };
  for (const line of lines) {
    const entry = parseObject(line);
    if (!entry) continue;
    if (entry.type === "session") {
      const folder = getFolderName(asString(entry.cwd));
      if (folder) next.folder = folder;
    }
    const model = entry.type === "model_change" ? asString(entry.modelId) : asString(asObject(entry.message).model);
    if (model) next.model = model;
  }
  return next;
}

function addEntry(working: Working, entry: Record<string, unknown>) {
  const id = asString(entry.id);
  if (!id) return;
  if (entry.type === "compaction") working.items.set(id, { kind: "note", id, text: COMPACTED_TEXT });
  if (entry.type !== "message") return;
  const message = asObject(entry.message);
  switch (message.role) {
    case "user": {
      const text = getContentText(message.content);
      if (text) working.items.set(id, { kind: "prompt", id, text });
      break;
    }
    case "assistant":
      addAssistantMessage(working, message, id);
      break;
    case "toolResult":
      setToolResult(working, asString(message.toolCallId), makeToolResult(getContentText(message.content), message.isError === true));
      break;
    case "bashExecution":
      addShellCommand(working, message, id);
      break;
  }
}

/** The text of a message's content, which is text or a list of blocks, and a mark for each image. */
function getContentText(content: unknown): string {
  if (typeof content === "string") return content;
  const parts = (Array.isArray(content) ? content : []).map(asObject).map((block) => {
    if (block.type === "image") return IMAGE_TEXT;
    return block.type === "text" ? asString(block.text) : "";
  });
  return parts.filter(Boolean).join("\n");
}

function addAssistantMessage(working: Working, message: Record<string, unknown>, id: string) {
  const blocks = Array.isArray(message.content) ? message.content.map(asObject) : [];
  blocks.forEach((block, index) => {
    if (block.type === "text" && asString(block.text)) {
      const replyId = `${id}/${index}`;
      working.items.set(replyId, { kind: "reply", id: replyId, text: asString(block.text) });
    }
    if (block.type === "toolCall" && asString(block.id)) {
      const input = asObject(block.arguments);
      setToolCall(working, { id: asString(block.id), name: asString(block.name), summary: getToolSummary(input), input: getToolInputText(input) });
    }
  });
}

/** A command the person ran with `!`, which is no tool call of the model, as a finished call. */
function addShellCommand(working: Working, message: Record<string, unknown>, id: string) {
  const command = asString(message.command);
  if (!command) return;
  const failed = typeof message.exitCode === "number" && message.exitCode !== 0;
  setToolCall(working, { id, name: "bash", summary: command, input: command });
  setToolResult(working, id, makeToolResult(asString(message.output), failed));
}
