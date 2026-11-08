import { READ_LINES } from "@/herdr/backend";

/**
 * One command sent from the phone and what it printed. `output` is null while the command runs.
 * `baseline` is the pane's text before the command went out, to tell that the pane has changed.
 * `isCut` is true when the output may start earlier than the lines Herdr's read still holds.
 */
export type ShellBlock = { id: number; command: string; baseline: string; output: string | null; isCut: boolean };

/**
 * The blocks with one more for a line sent to the shell. While a command runs, a line is that
 * command's input, such as an answer to a prompt, so it starts no block.
 */
export function startBlock(blocks: ShellBlock[], command: string, baseline: string): ShellBlock[] {
  if (blocks.at(-1)?.output === null) return blocks;
  return [...blocks, { id: blocks.length, command, baseline, output: null, isCut: false }];
}

/**
 * Closes the running block when the shell has the foreground again and the pane has changed. The
 * pane cannot say how a command ended, so the output is what the pane shows after the command
 * line and before the new prompt, which is its last line. Only the last block can run, so the
 * other blocks stay as they are, and the same array comes back when nothing changed.
 */
export function updateBlocks(blocks: ShellBlock[], text: string, isShellForeground: boolean | undefined): ShellBlock[] {
  const block = blocks.at(-1);
  if (!block || block.output !== null || !isShellForeground || text === block.baseline) return blocks;

  const lines = text.trimEnd().split("\n");
  const commandLine = lines.findLastIndex((line) => line.trimEnd().endsWith(block.command));
  const after = lines.slice(commandLine + 1);
  if (after.length > 0) after.pop();
  const shown = after.slice(-READ_LINES);
  const isCut = commandLine === -1 || shown.length < after.length;
  return [...blocks.slice(0, -1), { ...block, output: shown.join("\n").trimEnd(), isCut }];
}
