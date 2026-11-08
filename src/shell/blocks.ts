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
 * shows after the command line and before the new prompt, which is its last line. Only the last
 * block can run, so the other blocks stay as they are, and the same array comes back when nothing
 * changed.
 */
export function updateBlocks(blocks: ShellBlock[], text: string, isShellForeground: boolean | undefined, reads: number): ShellBlock[] {
  const block = blocks.at(-1);
  if (!block || block.output !== null || !isShellForeground) return blocks;
  if (text === block.baseline && reads < block.sentAtRead + 2) return blocks;

  const { lines, isFound } = linesAfterCommand(block, text);
  const { output, isCut } = cutToRead(lines.slice(0, -1), isFound);
  return [...blocks.slice(0, -1), { ...block, output, isCut }];
}

/** The output of the running block so far, as `output` and `isCut` of a block. */
export type RunningOutput = Pick<ShellBlock, "isCut"> & { output: string };

/**
 * The output of the running block so far: every pane line after its command line, cut to the last
 * READ_LINES. The last line counts, as the command has not ended and there is no new prompt yet.
 * When the pane no longer shows the command line, as after a long output or with a full-screen
 * program, it is the whole pane. Null while the pane is as it was before the send.
 */
export function getRunningOutput(block: ShellBlock, text: string): RunningOutput | null {
  if (text === block.baseline) return null;
  const { lines, isFound } = linesAfterCommand(block, text);
  return cutToRead(lines, isFound);
}

/** The lines as text cut to the last READ_LINES, cut also when the command line is not in them. */
function cutToRead(lines: string[], isCommandFound: boolean): RunningOutput {
  const shown = lines.slice(-READ_LINES);
  const isCut = shown.length < lines.length || (!isCommandFound && lines.length > 0);
  return { output: shown.join("\n").trimEnd(), isCut };
}

/**
 * The pane's lines after the block's last command line, or all of them when it is not found. The
 * command line is the prompt from the baseline and the command.
 */
function linesAfterCommand(block: ShellBlock, text: string): { lines: string[]; isFound: boolean } {
  const prompt = block.baseline.trimEnd().split("\n").at(-1) ?? "";
  const command = block.command.trim();
  const lines = text.trimEnd().split("\n");
  const commandLine = lines.findLastIndex((line) => {
    const entered = line.trimEnd();
    return entered.startsWith(prompt) && entered.slice(prompt.length).trim() === command;
  });
  return { lines: lines.slice(commandLine + 1), isFound: commandLine !== -1 };
}
