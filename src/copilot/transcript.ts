import type { ChatInfo } from "@/chat/chatItems";
import { COMPACTED_TEXT, addLongLineNote, parseLongLineNote } from "@/chat/longLine";
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
 * GitHub Copilot CLI's `events.jsonl` (one `{type, id, parentId, timestamp, data}` event a line)
 * as chat items. The CLI does not promise the format, so an event or field the app does not know
 * is skipped. Events of a sub-agent and events marked ephemeral are not shown.
 */


/** A copy of the transcript with the lines added after it. `firstLine` is the number of the first line. */
export function addCopilotLines(transcribed: Transcribed, lines: string[], firstLine: number): Transcribed {
  return addToTranscribed(transcribed, lines, (working) => {
    lines.forEach((line, index) => {
      const event = parseObject(line);
      if (!event) return;
      const note = parseLongLineNote(event);
      if (note) addLongLineNote(working, note);
      else if (isShown(event)) addEvent(working, event, asString(event.id) || `line-${firstLine + index}`);
    });
  });
}

/** The info with what the lines carry: each field from the newest line that has it. */
export function getCopilotInfo(info: ChatInfo, lines: string[]): ChatInfo {
  const next = { ...info };
  for (const line of lines) {
    const event = parseObject(line);
    if (!event || event.agentId !== undefined) continue;
    const data = asObject(event.data);
    const context = asObject(data.context);
    const model = asString(event.type === "session.model_change" ? data.newModel : data.model);
    if (model) next.model = model;
    const folder = getFolderName(asString(context.cwd));
    if (folder) next.folder = folder;
    const branch = asString(context.branch);
    if (branch) next.branch = branch;
  }
  return next;
}

function isShown(event: Record<string, unknown>): boolean {
  return event.agentId === undefined && event.ephemeral !== true;
}

function addEvent(working: Working, event: Record<string, unknown>, id: string) {
  const data = asObject(event.data);
  switch (event.type) {
    case "user.message":
      addUserMessage(working, data, id);
      break;
    case "assistant.message":
      addAssistantMessage(working, data, id);
      break;
    case "tool.execution_complete":
      addToolResult(working, data);
      break;
    case "session.compaction_complete":
      working.items.set(id, { kind: "note", id, text: COMPACTED_TEXT });
      break;
  }
}

// Copilot sends the text of a skill it runs as a user message of its own.
function addUserMessage(working: Working, data: Record<string, unknown>, id: string) {
  const text = asString(data.content).trim();
  const isSkill = asString(data.source).startsWith("skill-") || text.startsWith("<skill-context");
  if (text && !isSkill) working.items.set(id, { kind: "prompt", id, text });
}

function addAssistantMessage(working: Working, data: Record<string, unknown>, id: string) {
  const text = asString(data.content).trim();
  if (text) working.items.set(id, { kind: "reply", id, text });
  const requests = Array.isArray(data.toolRequests) ? data.toolRequests : [];
  for (const request of requests.map(asObject)) {
    const callId = asString(request.toolCallId);
    if (!callId) continue;
    const input = asObject(request.arguments);
    setToolCall(working, { id: callId, name: asString(request.name), summary: getToolSummary(input), input: getToolInputText(input) });
  }
}

/** The result's text, or the error's message when the tool failed with no text. */
function addToolResult(working: Working, data: Record<string, unknown>) {
  const callId = asString(data.toolCallId);
  if (!callId) return;
  const text = asString(asObject(data.result).content) || asString(asObject(data.error).message);
  setToolResult(working, callId, makeToolResult(text, data.success === false));
}
