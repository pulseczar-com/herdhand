import type { ChatInfo } from "@/chat/chatItems";
import { IMAGE_TEXT, addLongLineNote, parseLongLineNote } from "@/chat/longLine";
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
 * Codex's rollout file (one `{timestamp, type, payload}` record a line) as chat items. Codex
 * does not promise the format, so a record or field the app does not know is skipped. Only the
 * `response_item` records are read: Codex writes them in every history mode.
 */


// User messages that start with one of these are context that Codex adds, not a prompt.
const HIDDEN_PREFIXES = [
  "# AGENTS.md instructions",
  ...[
    "user_instructions",
    "environment_context",
    "environments_instructions",
    "apps_instructions",
    "skills_instructions",
    "plugins_instructions",
    "collaboration_mode",
    "context_window",
    "user_shell_command",
    "turn_aborted",
    "subagent_notification",
  ].map((tag) => `<${tag}>`),
];

/** A copy of the transcript with the lines added after it. `firstLine` is the number of the first line. */
export function addCodexLines(transcribed: Transcribed, lines: string[], firstLine: number): Transcribed {
  return addToTranscribed(transcribed, lines, (working) => {
    lines.forEach((line, index) => {
      const record = parseObject(line);
      if (!record) return;
      const note = parseLongLineNote(record);
      if (note) addLongLineNote(working, note);
      else if (record.type === "response_item") addResponseItem(working, asObject(record.payload), `line-${firstLine + index}`);
    });
  });
}

/** The info with what the lines carry: each field from the newest line that has it. */
export function getCodexInfo(info: ChatInfo, lines: string[]): ChatInfo {
  const next = { ...info };
  for (const line of lines) {
    const record = parseObject(line);
    if (record?.type !== "session_meta" && record?.type !== "turn_context") continue;
    const payload = asObject(record.payload);
    const model = asString(payload.model);
    if (model) next.model = model;
    const folder = getFolderName(asString(payload.cwd));
    if (folder) next.folder = folder;
    const branch = asString(asObject(payload.git).branch);
    if (branch) next.branch = branch;
  }
  return next;
}

function addResponseItem(working: Working, payload: Record<string, unknown>, id: string) {
  switch (payload.type) {
    case "message":
      addMessage(working, payload, id);
      break;
    case "function_call":
      addFunctionCall(working, payload);
      break;
    case "custom_tool_call":
      addCustomToolCall(working, payload);
      break;
    case "function_call_output":
    case "custom_tool_call_output":
      // Codex does not save whether a tool failed.
      setToolResult(working, asString(payload.call_id), makeToolResult(getOutputText(payload.output), false));
      break;
  }
}

function addMessage(working: Working, payload: Record<string, unknown>, id: string) {
  const text = getMessageText(payload.content);
  if (!text) return;
  if (payload.role === "assistant") working.items.set(id, { kind: "reply", id, text });
  if (payload.role === "user" && !HIDDEN_PREFIXES.some((prefix) => text.startsWith(prefix))) {
    working.items.set(id, { kind: "prompt", id, text });
  }
}

/** The message's text and a mark for each image. */
function getMessageText(content: unknown): string {
  const parts = (Array.isArray(content) ? content : []).map(asObject).map((part) => {
    if (part.type === "input_image") return IMAGE_TEXT;
    return asString(part.text);
  });
  return parts.filter(Boolean).join("\n");
}

function addFunctionCall(working: Working, payload: Record<string, unknown>) {
  const id = asString(payload.call_id);
  if (!id) return;
  const input = parseObject(asString(payload.arguments)) ?? {};
  setToolCall(working, { id, name: asString(payload.name), summary: getToolSummary(input), input: getToolInputText(input) });
}

/** A call with free text for its input, such as a patch. The first line says what it does. */
function addCustomToolCall(working: Working, payload: Record<string, unknown>) {
  const id = asString(payload.call_id);
  if (!id) return;
  const input = asString(payload.input);
  const summary = input.split("\n").find((line) => line.trim() !== "") ?? "";
  setToolCall(working, { id, name: asString(payload.name), summary, input });
}

/** A tool's output is text or a list of content items. */
function getOutputText(output: unknown): string {
  if (typeof output === "string") return output;
  if (!Array.isArray(output)) return "";
  return output.map((item) => asString(asObject(item).text)).filter(Boolean).join("\n");
}
