import type { RunResult } from "../../modules/ssh";

import { findFilesCommand, NOT_A_FILE_EXIT_CODE, readLinesCommand } from "./commands";

/** Which lines to read: from `offset` (the first line is 1), at most `limit`. */
export type LineRange = { offset?: number; limit?: number };

/** The lines read, with their line ends, and how many lines the file has. */
export type FileLines = { text: string; first: number; last: number; lines: number };

/** The host has no regular file at the path. */
export class FileReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileReadError";
  }
}

/**
 * Read-only looks at the files of the machine the phone is connected to, for any Herdr kind. A
 * relative path starts at the login folder, which is the home folder.
 */
export type HostReader = {
  /** Lines of a text file. Fails with FileReadError when the path is not a regular file. */
  readFile(path: string, range?: LineRange): Promise<FileLines>;
  /** The paths of the files whose name matches `namePattern` (a glob), `depth` levels below `folder`. */
  findFiles(folder: string, namePattern: string, depth: number): Promise<string[]>;
};

// A read with no `limit` stops at what `head` accepts as a count; the native module caps the output.
const ALL_LINES = 1_000_000_000;

/** A HostReader that runs each look as one command through `run`. */
export function makeHostReader(run: (command: string) => Promise<RunResult>): HostReader {
  return {
    readFile: async (path, { offset = 1, limit = ALL_LINES } = {}) => {
      const { output, exitCode } = await run(readLinesCommand(path, offset, limit));
      if (exitCode === NOT_A_FILE_EXIT_CODE) throw new FileReadError(`${path} is not a file`);
      if (exitCode !== 0) throw new Error(`Could not read ${path}: exit ${exitCode}`);
      return parseFileLines(output, offset);
    },
    findFiles: async (folder, namePattern, depth) => {
      const { output, exitCode } = await run(findFilesCommand(folder, namePattern, depth));
      if (exitCode !== 0) throw new Error(`Could not look in ${folder}: exit ${exitCode}`);
      return output.split("\n").filter((line) => line !== "");
    },
  };
}

/** The read from the command's output: the file's line count, a newline, then the lines. */
function parseFileLines(output: string, offset: number): FileLines {
  const countEnd = output.indexOf("\n");
  const lines = Number(output.slice(0, countEnd));
  if (countEnd < 0 || !Number.isInteger(lines)) throw new Error("The host sent an unexpected reply");
  const text = output.slice(countEnd + 1);
  const readCount = text.match(/[^\n]*\n|[^\n]+$/g)?.length ?? 0;
  return { text, first: offset, last: offset + readCount - 1, lines };
}
