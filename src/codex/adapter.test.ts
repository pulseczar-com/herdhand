/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { addEarlierLines } from "@/chat/adapter";
import { EMPTY_TRANSCRIBED } from "@/chat/transcribed";
import type { Pane } from "@/herdr/backend";
import type { HostReader } from "@/ssh/hostReader";

import { codexAdapter } from "./adapter";

// The fixture is a trimmed, demo-data rollout in the shape that Codex's source defines
// (openai/codex, codex-rs/protocol/src/models.rs and rollout/src/policy.rs).
const LINES = readFileSync(join(__dirname, "fixtures", "rollout.jsonl"), "utf8").trimEnd().split("\n");

function pane(fields: Partial<Pane> = {}): Pane {
  return { id: "p1", title: "", agent: "codex", state: "idle", isFinished: false, columns: null, ...fields };
}

describe("the Codex adapter: reading a rollout", () => {
  const { chat } = codexAdapter.addLines(EMPTY_TRANSCRIBED, LINES, 1);

  it("shows prompts, replies and tool calls in order, and nothing else", () => {
    expect(Array.from(chat.values(), (item) => item.kind === "tool" ? `tool ${item.name}` : `${item.kind}: ${item.text}`)).toEqual([
      "prompt: Run the tests",
      "tool shell_command",
      "tool apply_patch",
      "reply: The tests pass.",
      "tool request_user_input",
    ]);
  });

  it("gives a call its result, and shows a command as it was typed", () => {
    expect(chat.get("call_1")).toEqual({
      kind: "tool",
      id: "call_1",
      name: "shell_command",
      summary: "npm test",
      input: "npm test",
      result: { text: "Exit code: 0\nWall time: 1.2 seconds\nOutput:\nAll tests pass.", isError: false },
    });
  });

  it("summarizes a call with free text by its first line", () => {
    expect(chat.get("call_2")).toMatchObject({ summary: "*** Begin Patch", result: { text: "Done!" } });
  });

  it("leaves a call with no output open", () => {
    expect(chat.get("call_3")).toMatchObject({ result: null });
  });

  it("names a message by its line, so the id stays the same on the next read", () => {
    const first = codexAdapter.addLines(EMPTY_TRANSCRIBED, LINES.slice(0, 5), 1);
    const both = codexAdapter.addLines(first, LINES.slice(5), 6);

    expect(Array.from(both.chat.keys())).toEqual(Array.from(chat.keys()));
    expect(chat.has("line-5")).toBe(true);
  });

  it("holds an output until its call comes in an earlier page", () => {
    const later = codexAdapter.addLines(EMPTY_TRANSCRIBED, LINES.slice(8, 10), 9);
    const merged = addEarlierLines(codexAdapter, later, LINES.slice(7, 8), 8);

    expect(merged.chat.get("call_1")).toMatchObject({ result: { text: expect.stringContaining("All tests pass.") } });
    expect(merged.orphans.size).toBe(0);
  });

  it.each([
    { where: "an output that is a list of content items", output: [{ type: "input_text", text: "one" }, { type: "input_text", text: "two" }], expected: "one\ntwo" },
    { where: "an output that is neither text nor a list", output: { odd: true }, expected: "" },
  ])("reads $where", ({ output, expected }) => {
    const call = JSON.stringify({ type: "response_item", payload: { type: "function_call", name: "x", arguments: "{}", call_id: "c" } });
    const result = JSON.stringify({ type: "response_item", payload: { type: "function_call_output", call_id: "c", output } });

    expect(codexAdapter.addLines(EMPTY_TRANSCRIBED, [call, result], 1).chat.get("c")).toMatchObject({ result: { text: expected } });
  });

  it.each([
    { where: "text that is not JSON", line: "{" },
    { where: "a record of a type it does not know", line: '{"type":"future","payload":{}}' },
    { where: "an item of a type it does not know", line: '{"type":"response_item","payload":{"type":"future"}}' },
    { where: "a call with no id", line: '{"type":"response_item","payload":{"type":"function_call","name":"x","arguments":"{}"}}' },
    { where: "a message with no content", line: '{"type":"response_item","payload":{"type":"message","role":"user"}}' },
  ])("skips $where", ({ line }) => {
    expect(codexAdapter.addLines(EMPTY_TRANSCRIBED, [line], 1).chat.size).toBe(0);
  });

  it("marks an image in a prompt", () => {
    const line = JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Look" }, { type: "input_image", image_url: "x" }] } });

    expect(Array.from(codexAdapter.addLines(EMPTY_TRANSCRIBED, [line], 1).chat.values())).toEqual([{ kind: "prompt", id: "line-1", text: "Look\n[image]" }]);
  });

  it("reads the model, folder and branch from the newest records that have them", () => {
    expect(codexAdapter.getInfo({}, LINES)).toEqual({ model: "demo-model", folder: "demo", branch: "main" });
  });
});

describe("the Codex adapter: finding the rollout", () => {
  const host = (paths: string[]) => ({ readFile: jest.fn(), findFiles: jest.fn().mockResolvedValue(paths) }) satisfies HostReader;
  const PATH = ".codex/sessions/2026/11/07/rollout-2026-11-07T10-00-00-0192a3b4-demo.jsonl";

  it("looks for the one file that ends in the thread id", async () => {
    const machine = host([PATH]);

    expect(await codexAdapter.locate(machine, pane({ sessionId: "0192a3b4-demo" }))).toBe(PATH);
    expect(machine.findFiles).toHaveBeenCalledWith(".codex/sessions", "rollout-*-0192a3b4-demo.jsonl", 4);
  });

  it.each([
    { where: "no file has the id", paths: [], sessionId: "s-1" },
    { where: "two files have the id", paths: [PATH, `${PATH}x`], sessionId: "s-1" },
    { where: "the id has a character a file name pattern reads", paths: [PATH], sessionId: "s-*" },
  ])("finds no chat when $where", async ({ paths, sessionId }) => {
    expect(await codexAdapter.locate(host(paths), pane({ sessionId }))).toBeNull();
  });

  it.each([
    { where: "a session id", fields: { sessionId: "s-1" }, expected: true },
    { where: "only a process id, as on the desktop app", fields: { pid: 100 }, expected: false },
    { where: "no session", fields: {}, expected: false },
  ])("can find a rollout with $where: $expected", ({ fields, expected }) => {
    expect(codexAdapter.canLocate(pane(fields))).toBe(expected);
  });
});
