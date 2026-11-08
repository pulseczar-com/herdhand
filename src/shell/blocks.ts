import { READ_LINES } from "@/herdr/backend";

/**
 * One command sent from the phone and what it printed. `output` is null while the command runs.
 * `baseline` is the pane's text before the command went out, to tell that the pane has changed.
 * `sentAtRead` is the count of finished reads at the send. `isCut` is true when the output may
 * start earlier than the lines Herdr's read still holds.
 */
export type ShellBlock = { id: number; command: string; baseline: string; sentAtRead: number; output: string | null; isCut: boolean };

/**
 * The blocks with one more for a line sent to the shell. While a command runs, a line is that
 * command's input, such as an answer to a prompt, so it starts no block.
 */
export function startBlock(blocks: ShellBlock[], command: string, baseline: string, reads: number): ShellBlock[] {
  if (blocks.at(-1)?.output === null) return blocks;
  return [...blocks, { id: blocks.length, command, baseline, sentAtRead: reads, output: null, isCut: false }];
}

/**
 * Closes the running block when the shell has the foreground again and the pane has changed, or
 * when a read that began after the send has ended with the pane unchanged: a command such as
 * `clear` leaves the pane as it was. The read that ends next may have begun before the send, so
 * the second one counts. The pane cannot say how a command ended, so the output is what the pane
 * shows after the command line and before the new prompt, which is its last line. The command
 * line is the prompt from the baseline and the command. Only the last block can run, so the other
 * blocks stay as they are, and the same array comes back when nothing changed.
 */
export function updateBlocks(blocks: ShellBlock[], text: string, isShellForeground: boolean | undefined, reads: number): ShellBlock[] {
  const block = blocks.at(-1);
  if (!block || block.output !== null || !isShellForeground) return blocks;
  if (text === block.baseline && reads < block.sentAtRead + 2) return blocks;

  const prompt = block.baseline.trimEnd().split("\n").at(-1) ?? "";
  const command = block.command.trim();
  const lines = text.trimEnd().split("\n");
  const commandLine = lines.findLastIndex((line) => {
    const entered = line.trimEnd();
    return entered.startsWith(prompt) && entered.slice(prompt.length).trim() === command;
  });
  const after = lines.slice(commandLine + 1);
  if (after.length > 0) after.pop();
  const shown = after.slice(-READ_LINES);
  const isCut = shown.length < after.length || (commandLine === -1 && after.length > 0);
  return [...blocks.slice(0, -1), { ...block, output: shown.join("\n").trimEnd(), isCut }];
}
