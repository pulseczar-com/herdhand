import { useCallback, useState } from "react";

import type { Backend } from "@/herdr/backend";
import { type ShellBlock, startBlock, updateBlocks } from "@/shell/blocks";

import { usePaneText } from "./usePaneText";

/**
 * A shell pane as blocks: one for each line sent from the phone (`onSent`), closed when the shell
 * has the foreground again, and the pane as it was on open as `opening`. Commands typed on the host
 * get no block of their own: their text stays out of the blocks, and `isRunning` is true while one
 * runs. While a command runs, `text` is the pane's screen, for a full-screen program or a long run.
 * `pane.isShellForeground` is undefined when Herdr cannot say what holds the foreground; the
 * blocks then never close, so the caller shows the screen instead.
 */
export function useShellBlocks(backend: Backend, paneId: string) {
  const { text, dimLines, pane, error, reads } = usePaneText(backend, paneId);
  const [blocks, setBlocks] = useState<ShellBlock[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const [seen, setSeen] = useState<{ text: string | null; isShellForeground: boolean | undefined; reads: number }>({ text: null, isShellForeground: undefined, reads: 0 });
  const isShellForeground = pane?.isShellForeground;

  // State set while rendering, the way React derives state from a new read: each read can close the running block.
  if (text !== seen.text || isShellForeground !== seen.isShellForeground || reads !== seen.reads) {
    setSeen({ text, isShellForeground, reads });
    if (text !== null) {
      setBlocks(updateBlocks(blocks, text, isShellForeground, reads));
      if (opening === null) setOpening(text);
    }
  }

  // The text and the read count at the render that made the callback are those before the command.
  const onSent = useCallback((command: string) => setBlocks((current) => startBlock(current, command, text ?? "", reads)), [text, reads]);
  const isRunning = blocks.at(-1)?.output === null || isShellForeground === false;
  return { blocks, opening, isRunning, text, dimLines, pane, error, onSent };
}
