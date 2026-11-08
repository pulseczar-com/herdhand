import { READ_LINES } from "@/herdr/backend";

import { getRunningOutput, type ShellBlock, startBlock, updateBlocks } from "./blocks";

const running = (command: string, baseline: string): ShellBlock => ({ id: 0, command, baseline, sentAtRead: 0, output: null, isCut: false });

describe("startBlock", () => {
  it("adds a running block that keeps the text and the read count from before the command", () => {
    expect(startBlock([], "ls", "$ ", 0)).toEqual([running("ls", "$ ")]);
    expect(startBlock([], "ls", "$ ", 7)[0].sentAtRead).toBe(7);
  });

  it("adds no block while a command runs, because the line goes to that command", () => {
    const blocks = [running("read name", "$ ")];
    expect(startBlock(blocks, "alice", "$ read name", 0)).toBe(blocks);
  });

  it("numbers the blocks in order", () => {
    const done: ShellBlock = { id: 0, command: "ls", baseline: "$ ", sentAtRead: 0, output: "a", isCut: false };
    expect(startBlock([done], "pwd", "$ ", 0).map((block) => block.id)).toEqual([0, 1]);
  });
});

describe("updateBlocks", () => {
  it.each([
    ["the output between the command and the new prompt", "$ ls\na\nb\n$ ", "a\nb"],
    ["no output for a command that prints none", "$ ls\n$ ", ""],
    ["the last command's line when the same command ran before", "$ ls\nold\n$ ls\nnew\n$ ", "new"],
    ["an output line that ends with the command", "$ ls\napp models\nutils ls\n$ ", "app models\nutils ls"],
  ])("closes a block with %s", (_name, text, output) => {
    const [block] = updateBlocks([running("ls", "$ ")], text, true, 1);
    expect(block).toMatchObject({ output, isCut: false });
  });

  it("finds the command line after the baseline's longer prompt", () => {
    const [block] = updateBlocks([running("ls", "user@box:~/api$ ")], "user@box:~/api$ ls\na\nuser@box:~/api$ ", true, 1);
    expect(block).toMatchObject({ output: "a", isCut: false });
  });

  it("finds the command line when the pane trims the space after the prompt", () => {
    const [block] = updateBlocks([running("ls", "$")], "$ ls\na\n$", true, 1);
    expect(block).toMatchObject({ output: "a", isCut: false });
  });

  it("ignores an output line that ends with the command but does not begin with the prompt", () => {
    const [block] = updateBlocks([running("ls", "$ ")], "old\n$ ls\napp models src ls\nutils ls\n$ ", true, 1);
    expect(block).toMatchObject({ output: "app models src ls\nutils ls", isCut: false });
  });

  it("finds the command line of a command with a space at its end", () => {
    const [block] = updateBlocks([running("git status ", "$ ")], "old\n$ git status\nclean\n$ ", true, 1);
    expect(block).toMatchObject({ output: "clean", isCut: false });
  });

  it("keeps a block running while another program holds the foreground", () => {
    const blocks = [running("sleep 5", "$ ")];
    expect(updateBlocks(blocks, "$ sleep 5\n", false, 1)).toBe(blocks);
  });

  it("keeps a block running when the shell is back but the pane has not changed", () => {
    const blocks = [running("ls", "$ ")];
    expect(updateBlocks(blocks, "$ ", true, 1)).toBe(blocks);
  });

  it("keeps a block running until a read that began after the send ends with the pane unchanged", () => {
    const blocks = [{ ...running("clear", "$ "), sentAtRead: 3 }];
    expect(updateBlocks(blocks, "$ ", true, 4)).toBe(blocks);
    expect(updateBlocks(blocks, "$ ", true, 5)[0]).toMatchObject({ output: "", isCut: false });
  });

  it("keeps a block running with the pane unchanged while another program holds the foreground", () => {
    const blocks = [{ ...running("clear", "$ "), sentAtRead: 0 }];
    expect(updateBlocks(blocks, "$ ", false, 9)).toBe(blocks);
  });

  it("closes a clear on a pane that shows only the prompt, with no cut note", () => {
    const [block] = updateBlocks([running("clear", "$ ")], "$ ", true, 2);
    expect(block).toMatchObject({ output: "", isCut: false });
  });

  it("closes a second clear, because the pane is the same as before it", () => {
    const first = updateBlocks([running("clear", "$ ")], "$ ", true, 2);
    const both = startBlock(first, "clear", "$ ", 2);
    expect(updateBlocks(both, "$ ", true, 3)).toBe(both);
    expect(updateBlocks(both, "$ ", true, 4)[1]).toMatchObject({ command: "clear", output: "", isCut: false });
  });

  it("keeps a block running while the foreground is unknown", () => {
    const blocks = [running("ls", "$ ")];
    expect(updateBlocks(blocks, "$ ls\na\n$ ", undefined, 1)).toBe(blocks);
  });

  it("closes a block whose command scrolled out of the read, and marks it cut", () => {
    const [block] = updateBlocks([running("make", "$ ")], "line 1\nline 2\n$ ", true, 1);
    expect(block).toMatchObject({ output: "line 1\nline 2", isCut: true });
  });

  it("cuts a long output to the lines Herdr's read holds", () => {
    const lines = Array.from({ length: READ_LINES + 50 }, (_unused, index) => `line ${index}`);
    const [block] = updateBlocks([running("seq", "$ ")], `$ seq\n${lines.join("\n")}\n$ `, true, 1);
    const shown = block.output?.split("\n");
    expect(shown).toHaveLength(READ_LINES);
    expect(shown?.at(-1)).toBe(`line ${READ_LINES + 49}`);
    expect(block.isCut).toBe(true);
  });

  it("leaves a closed block as it is", () => {
    const done: ShellBlock = { id: 0, command: "ls", baseline: "$ ", sentAtRead: 0, output: "a", isCut: false };
    const blocks = [done];
    expect(updateBlocks(blocks, "$ ls\nz\n$ ", true, 1)).toBe(blocks);
  });

  it("changes only the last block", () => {
    const done: ShellBlock = { id: 0, command: "ls", baseline: "$ ", sentAtRead: 0, output: "a", isCut: false };
    const [first, second] = updateBlocks([done, { ...running("pwd", "$ ls\na\n$ "), id: 1 }], "$ ls\na\n$ pwd\n/home\n$ ", true, 1);
    expect(first).toBe(done);
    expect(second.output).toBe("/home");
  });
});

describe("getRunningOutput", () => {
  it.each([
    ["every line after the command line, with the last line", "$ ls\na\nb", "a\nb"],
    ["the last command's line when the same command ran before", "$ ls\nold\n$ ls\nnew", "new"],
    ["no output while the command line is the last line", "$ ls\n", ""],
  ])("shows %s", (_name, text, output) => {
    expect(getRunningOutput(running("ls", "$ "), text)).toEqual({ output, isCut: false });
  });

  it.each([
    ["the command line is not in the pane, as with a full-screen program", "-- INSERT --", "$ ", "-- INSERT --"],
    ["output has pushed the command line out of the pane", "line 1\nline 2", "$ ", "line 1\nline 2"],
  ])("shows the whole pane, marked cut, when %s", (_name, text, baseline, output) => {
    expect(getRunningOutput(running("ls", baseline), text)).toEqual({ output, isCut: true });
  });

  it("gives null when the pane is as it was before the send, even with the command in an older line", () => {
    expect(getRunningOutput(running("ls", "$ ls\nold\n$ "), "$ ls\nold\n$ ")).toBeNull();
  });

  it.each([
    ["with the command line", (lines: string[]) => `$ seq\n${lines.join("\n")}`],
    ["without the command line", (lines: string[]) => lines.join("\n")],
  ])("cuts a long output to the last lines Herdr's read holds, %s", (_name, toText) => {
    const lines = Array.from({ length: READ_LINES + 50 }, (_unused, index) => `line ${index}`);
    const running_ = getRunningOutput(running("seq", "$ "), toText(lines));
    const shown = running_?.output.split("\n");
    expect(shown).toHaveLength(READ_LINES);
    expect(shown?.at(-1)).toBe(`line ${READ_LINES + 49}`);
    expect(running_?.isCut).toBe(true);
  });
});
