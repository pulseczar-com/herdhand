import { READ_LINES } from "@/herdr/backend";

import { type ShellBlock, startBlock, updateBlocks } from "./blocks";

const running = (command: string, baseline: string): ShellBlock => ({ id: 0, command, baseline, output: null, isCut: false });

describe("startBlock", () => {
  it("adds a running block that keeps the text from before the command", () => {
    expect(startBlock([], "ls", "$ ")).toEqual([running("ls", "$ ")]);
  });

  it("adds no block while a command runs, because the line goes to that command", () => {
    const blocks = [running("read name", "$ ")];
    expect(startBlock(blocks, "alice", "$ read name")).toBe(blocks);
  });

  it("numbers the blocks in order", () => {
    const done: ShellBlock = { id: 0, command: "ls", baseline: "$ ", output: "a", isCut: false };
    expect(startBlock([done], "pwd", "$ ").map((block) => block.id)).toEqual([0, 1]);
  });
});

describe("updateBlocks", () => {
  it.each([
    ["the output between the command and the new prompt", "$ ls\na\nb\n$ ", "a\nb"],
    ["no output for a command that prints none", "$ ls\n$ ", ""],
    ["the last command's line when the same command ran before", "$ ls\nold\n$ ls\nnew\n$ ", "new"],
    ["a command line with a longer prompt before it", "user@box:~/api$ ls\na\nuser@box:~/api$ ", "a"],
  ])("closes a block with %s", (_name, text, output) => {
    const [block] = updateBlocks([running("ls", "$ ")], text, true);
    expect(block).toMatchObject({ output, isCut: false });
  });

  it("keeps a block running while another program holds the foreground", () => {
    const blocks = [running("sleep 5", "$ ")];
    expect(updateBlocks(blocks, "$ sleep 5\n", false)).toBe(blocks);
  });

  it("keeps a block running when the shell is back but the pane has not changed", () => {
    const blocks = [running("ls", "$ ")];
    expect(updateBlocks(blocks, "$ ", true)).toBe(blocks);
  });

  it("keeps a block running while the foreground is unknown", () => {
    const blocks = [running("ls", "$ ")];
    expect(updateBlocks(blocks, "$ ls\na\n$ ", undefined)).toBe(blocks);
  });

  it("closes a block whose command scrolled out of the read, and marks it cut", () => {
    const [block] = updateBlocks([running("make", "$ ")], "line 1\nline 2\n$ ", true);
    expect(block).toMatchObject({ output: "line 1\nline 2", isCut: true });
  });

  it("cuts a long output to the lines Herdr's read holds", () => {
    const lines = Array.from({ length: READ_LINES + 50 }, (_unused, index) => `line ${index}`);
    const [block] = updateBlocks([running("seq", "$ ")], `$ seq\n${lines.join("\n")}\n$ `, true);
    const shown = block.output?.split("\n");
    expect(shown).toHaveLength(READ_LINES);
    expect(shown?.at(-1)).toBe(`line ${READ_LINES + 49}`);
    expect(block.isCut).toBe(true);
  });

  it("leaves a closed block as it is", () => {
    const done: ShellBlock = { id: 0, command: "ls", baseline: "$ ", output: "a", isCut: false };
    const blocks = [done];
    expect(updateBlocks(blocks, "$ ls\nz\n$ ", true)).toBe(blocks);
  });

  it("changes only the last block", () => {
    const done: ShellBlock = { id: 0, command: "ls", baseline: "$ ", output: "a", isCut: false };
    const [first, second] = updateBlocks([done, { ...running("pwd", "$ ls\na\n$ "), id: 1 }], "$ ls\na\n$ pwd\n/home\n$ ", true);
    expect(first).toBe(done);
    expect(second.output).toBe("/home");
  });
});
