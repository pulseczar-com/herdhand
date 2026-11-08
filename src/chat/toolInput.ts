import { RESULT_LIMIT } from "@/chat/transcribed";

// The input fields that best say what a tool call does, best first.
const SUMMARY_FIELDS = ["description", "command", "file_path", "path", "pattern", "url", "query", "prompt"];

/** A command as one line. A command given as a list of words, such as ["bash", "-lc", "ls"], is joined. */
function getCommandText(command: unknown): string | null {
  if (typeof command === "string") return command;
  if (Array.isArray(command) && command.every((word) => typeof word === "string")) return command.join(" ");
  return null;
}

/** The first summary field the call has. */
export function getToolSummary(input: Record<string, unknown>): string {
  for (const field of SUMMARY_FIELDS) {
    const text = field === "command" ? getCommandText(input[field]) : input[field];
    if (typeof text === "string") return text;
  }
  return "";
}

/** A shell command as it was typed; any other input as JSON. */
export function getToolInputText(input: Record<string, unknown>): string {
  return getCommandText(input.command) ?? JSON.stringify(input, null, 2).slice(0, RESULT_LIMIT);
}
