/**
 * Claude Code's input box on a pane's screen: one prompt line between two divider rows. Claude
 * shows a suggested next message there in dim text, and the desktop read is plain text, so the
 * suggestion would look typed. The phone's composer is the input, so the box shows no text.
 */

const DIVIDER = /^─{8,}$/;
const PROMPT = "❯";

/**
 * The text with the last input box's line shown as the bare prompt. The text stays as it is
 * when the box does not match exactly.
 */
export function hideClaudeInput(text: string): string {
  const lines = text.split("\n");
  const bottom = lines.findLastIndex(isDivider);
  const isOneLineBox = bottom >= 2 && isDivider(lines[bottom - 2]) && lines[bottom - 1].startsWith(PROMPT);
  if (!isOneLineBox) return text;

  lines[bottom - 1] = PROMPT;
  return lines.join("\n");
}

function isDivider(line: string): boolean {
  return DIVIDER.test(line.trimEnd());
}
