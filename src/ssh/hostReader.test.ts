/// <reference types="node" />
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { addTranscriptLines } from "@/claude/transcript";

import { FileReadError, makeHostReader } from "./hostReader";

// The commands run on a real shell in a fake login folder, as sshd runs them for the phone.
describe("the host reader", () => {
  let home: string;
  const run = async (command: string) => {
    const { stdout, status } = spawnSync("/bin/sh", ["-c", command], { cwd: home, encoding: "utf8" });
    return { output: stdout, exitCode: status ?? -1 };
  };
  const host = makeHostReader(run);

  function write(path: string, text: string) {
    mkdirSync(join(home, path, ".."), { recursive: true });
    writeFileSync(join(home, path), text);
  }

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "herdhand-"));
  });

  afterEach(() => rmSync(home, { recursive: true, force: true }));

  describe("readFile", () => {
    it.each([
      { where: "the whole file", text: "a\nb\nc\n", range: {}, expected: { text: "a\nb\nc\n", first: 1, last: 3, lines: 3 } },
      { where: "lines from an offset", text: "a\nb\nc\n", range: { offset: 2 }, expected: { text: "b\nc\n", first: 2, last: 3, lines: 3 } },
      { where: "a limited page", text: "a\nb\nc\n", range: { offset: 2, limit: 1 }, expected: { text: "b\n", first: 2, last: 2, lines: 3 } },
      { where: "no lines, for the count alone", text: "a\nb\n", range: { limit: 0 }, expected: { text: "", first: 1, last: 0, lines: 2 } },
      { where: "an offset past the end", text: "a\n", range: { offset: 5 }, expected: { text: "", first: 5, last: 4, lines: 1 } },
      { where: "a last line with no newline", text: "a\nb", range: { offset: 2 }, expected: { text: "b", first: 2, last: 2, lines: 2 } },
      { where: "an empty file", text: "", range: {}, expected: { text: "", first: 1, last: 0, lines: 0 } },
      { where: "text that is not ASCII", text: "café ✓\n", range: {}, expected: { text: "café ✓\n", first: 1, last: 1, lines: 1 } },
    ])("reads $where", async ({ text, range, expected }) => {
      write("notes.txt", text);

      expect(await host.readFile("notes.txt", range)).toEqual(expected);
    });

    it.each([
      "with space.txt",
      "it's here.txt",
      "$(touch pwned).txt",
      "`touch pwned`.txt",
      "a;touch pwned.txt",
      "star*.txt",
      "-dash.txt",
    ])("reads a path that is hostile to a shell: %s", async (name) => {
      write(name, "ok\n");

      expect((await host.readFile(`./${name}`)).text).toBe("ok\n");
      expect(await host.readFile(`./${name}`, { limit: 0 })).toMatchObject({ lines: 1 });
      expect(existsSync(join(home, "pwned"))).toBe(false);
    });

    describe("a line too long to send", () => {
      const LONG = "x".repeat(300_000);
      const note = (line: number) =>
        `{"type":"assistant","uuid":"long-line-${line}","message":{"content":[{"type":"text","text":"Large item not shown (image or long output)"}]}}`;

      it.each([
        { where: "in the middle", text: `a\n${LONG}\nc\n`, range: {}, expected: `a\n${note(2)}\nc\n`, last: 3, lines: 3 },
        { where: "as a page that starts on it", text: `a\n${LONG}\nc\n`, range: { offset: 2, limit: 1 }, expected: `${note(2)}\n`, last: 2, lines: 3 },
        { where: "as the last line with no newline", text: `a\n${LONG}`, range: { offset: 2 }, expected: note(2), last: 2, lines: 2 },
        { where: "as the last line of a page that stops before the end", text: `a\n${LONG}\nc`, range: { limit: 2 }, expected: `a\n${note(2)}\n`, last: 2, lines: 3 },
        { where: "next to a line just short enough", text: `${"y".repeat(256_000)}\n${LONG}\n`, range: {}, expected: `${"y".repeat(256_000)}\n${note(2)}\n`, last: 2, lines: 2 },
      ])("replaces it with a note, $where", async ({ text, range, expected, last, lines }) => {
        write("notes.txt", text);

        const read = await host.readFile("notes.txt", range);

        expect(read.text).toBe(expected);
        expect(read).toMatchObject({ last, lines });
      });

      it("makes a note the chat shows as a reply", async () => {
        write("notes.txt", `${LONG}\n`);

        const { text } = await host.readFile("notes.txt");
        const { chat } = addTranscriptLines({ chat: new Map(), orphans: new Map() }, [text.trimEnd()]);

        expect([...chat.values()]).toEqual([{ kind: "reply", id: "long-line-1/0", text: "Large item not shown (image or long output)" }]);
      });
    });

    it("never runs a path as a glob", async () => {
      write("star1.txt", "x\n");

      await expect(host.readFile("star*.txt")).rejects.toBeInstanceOf(FileReadError);
    });

    it("fails with FileReadError for a missing file and for a folder", async () => {
      mkdirSync(join(home, "folder"));

      await expect(host.readFile("gone.txt")).rejects.toBeInstanceOf(FileReadError);
      await expect(host.readFile("folder")).rejects.toBeInstanceOf(FileReadError);
    });

    it("fails with a plain error when the command fails some other way", async () => {
      const failing = makeHostReader(async () => ({ output: "", exitCode: 127 }));

      const failure = failing.readFile("a.txt");

      await expect(failure).rejects.toThrow("exit 127");
      await expect(failure).rejects.not.toBeInstanceOf(FileReadError);
    });

    it("fails when the reply has no line count", async () => {
      const odd = makeHostReader(async () => ({ output: "no newline", exitCode: 0 }));

      await expect(odd.readFile("a.txt")).rejects.toThrow("unexpected reply");
    });
  });

  describe("findInSubfolders", () => {
    it.each([
      { where: "one match", files: ["p/one/s-1.jsonl", "p/two/other.jsonl"], expected: ["p/one/s-1.jsonl"] },
      { where: "two matches", files: ["p/one/s-1.jsonl", "p/two/s-1.jsonl"], expected: ["p/one/s-1.jsonl", "p/two/s-1.jsonl"] },
      { where: "no match", files: ["p/one/other.jsonl"], expected: [] },
      { where: "a match one folder too deep", files: ["p/one/deeper/s-1.jsonl"], expected: [] },
    ])("finds $where", async ({ files, expected }) => {
      for (const file of files) write(file, "x\n");

      expect(await host.findInSubfolders("p", "s-1.jsonl")).toEqual(expected);
    });

    it("finds nothing in a folder that does not exist", async () => {
      expect(await host.findInSubfolders("missing", "s-1.jsonl")).toEqual([]);
    });

    it("takes a name that is hostile to a shell as plain text", async () => {
      write("p/one/it's.jsonl", "x\n");

      expect(await host.findInSubfolders("p", "it's.jsonl")).toEqual(["p/one/it's.jsonl"]);
      expect(await host.findInSubfolders("p", "*")).toEqual([]);
      expect(await host.findInSubfolders("p", "$(touch pwned)")).toEqual([]);
      expect(existsSync(join(home, "pwned"))).toBe(false);
    });
  });
});
