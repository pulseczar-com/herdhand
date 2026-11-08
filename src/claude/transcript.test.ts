import type { Chat, ChatItem } from "@/chat/chatItems";

import { addEarlierLines } from "@/chat/adapter";
import { EMPTY_TRANSCRIBED, RESULT_LIMIT } from "@/chat/transcribed";

import { claudeAdapter } from "./adapter";
import { addTranscriptLines, getChatInfo } from "./transcript";


function user(content: unknown, fields: object = {}): string {
  return JSON.stringify({ type: "user", uuid: "u1", message: { role: "user", content }, ...fields });
}

function assistant(block: object, fields: object = {}): string {
  return JSON.stringify({ type: "assistant", uuid: "a1", message: { role: "assistant", content: [block] }, ...fields });
}

function toolUse(input: object, name = "Bash"): string {
  return assistant({ type: "tool_use", id: "tool1", name, input });
}

function toolResult(content: unknown, fields: object = {}): string {
  return user([{ type: "tool_result", tool_use_id: "tool1", content, ...fields }], { uuid: "u2" });
}

function getItems(chat: Chat): ChatItem[] {
  return Array.from(chat.values());
}

const EMPTY = EMPTY_TRANSCRIBED;

function read(lines: string[]): ChatItem[] {
  return getItems(addTranscriptLines(EMPTY, lines).chat);
}

describe("addTranscriptLines: prompts", () => {
  it.each([
    { where: "plain text", content: "Fix the build", expected: "Fix the build" },
    { where: "text blocks", content: [{ type: "text", text: "Fix the build" }], expected: "Fix the build" },
    { where: "an image alone", content: [{ type: "image", source: {} }], expected: "[image]" },
    {
      where: "text and an image",
      content: [{ type: "text", text: "What is this?" }, { type: "image", source: {} }],
      expected: "What is this?\n[image]",
    },
    {
      where: "a slash command",
      content: "<command-message>review</command-message>\n<command-name>/review</command-name>\n<command-args>src/app.ts</command-args>",
      expected: "/review src/app.ts",
    },
    {
      where: "a slash command with no arguments",
      content: "<command-name>/compact</command-name>\n<command-args></command-args>",
      expected: "/compact",
    },
    { where: "a shell command", content: "<bash-input>ls -la</bash-input>", expected: "! ls -la" },
    { where: "an interrupt", content: "[Request interrupted by user]", expected: "[Request interrupted by user]" },
  ])("shows $where as a prompt", ({ content, expected }) => {
    expect(read([user(content)])).toEqual([{ kind: "prompt", id: "u1", text: expected }]);
  });

  it.each([
    "bash-stdout",
    "bash-stderr",
    "local-command-stdout",
    "local-command-stderr",
    "local-command-caveat",
    "system-reminder",
    "task-notification",
    "user-prompt-submit-hook",
  ])("hides text that starts with <%s>", (tag) => {
    expect(read([user(`<${tag}>output</${tag}>`)])).toEqual([]);
  });
});

describe("addTranscriptLines: replies and notes", () => {
  it("shows assistant text as a reply", () => {
    expect(read([assistant({ type: "text", text: "Done. **All** tests pass." })])).toEqual([
      { kind: "reply", id: "a1/0", text: "Done. **All** tests pass." },
    ]);
  });

  it("shows a compaction as a note", () => {
    const line = JSON.stringify({ type: "system", subtype: "compact_boundary", uuid: "s1" });
    expect(read([line])).toEqual([{ kind: "note", id: "s1", text: "Conversation compacted" }]);
  });

  it("keeps the items in file order", () => {
    const items = read([user("Hi"), assistant({ type: "text", text: "Hello" })]);
    expect(items.map((item) => item.kind)).toEqual(["prompt", "reply"]);
  });

  it("adds to the chat it is given", () => {
    const first = addTranscriptLines(EMPTY, [user("Hi")]);
    const second = addTranscriptLines(first, [assistant({ type: "text", text: "Hello" })]);
    expect(getItems(second.chat).map((item) => item.id)).toEqual(["u1", "a1/0"]);
    expect(first.chat.size).toBe(1);
  });
});

describe("addTranscriptLines: what it hides", () => {
  it.each([
    { where: "a subagent's turn", line: user("Hi", { isSidechain: true }) },
    { where: "Claude Code's own note", line: user("Hi", { isMeta: true }) },
    { where: "a compaction summary", line: user("Summary", { isCompactSummary: true }) },
    { where: "a record with no id", line: JSON.stringify({ type: "user", message: { content: "Hi" } }) },
    { where: "thinking", line: assistant({ type: "thinking", thinking: "", signature: "x" }) },
    { where: "an unknown block", line: assistant({ type: "server_tool_use", id: "x" }) },
    { where: "an unknown record", line: JSON.stringify({ type: "file-history-snapshot", uuid: "f1" }) },
    { where: "another system record", line: JSON.stringify({ type: "system", subtype: "api_error", uuid: "s1" }) },
    { where: "a line that is not JSON", line: "{not json" },
    { where: "JSON that is not an object", line: "42" },
    { where: "a record with no message", line: JSON.stringify({ type: "user", uuid: "u1" }) },
    { where: "empty text", line: user("") },
    { where: "a prompt block that is not an object", line: user([null, 42]) },
    {
      where: "a reply block that is not an object",
      line: JSON.stringify({ type: "assistant", uuid: "a1", message: { content: [null] } }),
    },
    { where: "a tool result block that is not an object", line: toolResult([null]) },
  ])("hides $where", ({ line }) => {
    expect(read([line])).toEqual([]);
  });
});

describe("addTranscriptLines: tool calls", () => {
  it.each([
    { field: "description", input: { description: "Run the tests", command: "npm test" }, expected: "Run the tests" },
    { field: "command", input: { command: "npm test" }, expected: "npm test" },
    { field: "file_path", input: { file_path: "/work/demo/src/app.ts" }, expected: "/work/demo/src/app.ts" },
    { field: "path", input: { path: "/elsewhere/notes.md" }, expected: "/elsewhere/notes.md" },
    { field: "pattern", input: { pattern: "TODO" }, expected: "TODO" },
    { field: "url", input: { url: "https://example.com" }, expected: "https://example.com" },
    { field: "query", input: { query: "expo router" }, expected: "expo router" },
    { field: "prompt", input: { prompt: "Find the bug" }, expected: "Find the bug" },
    { field: "none of them", input: { todos: [] }, expected: "" },
  ])("summarizes a call by $field", ({ input, expected }) => {
    const [item] = read([toolUse(input)]);
    expect(item).toMatchObject({ kind: "tool", id: "tool1", name: "Bash", summary: expected, result: null });
  });

  it.each([
    { where: "a command", input: { command: "npm test", description: "Run" }, expected: "npm test" },
    { where: "other input", input: { file_path: "a.ts" }, expected: '{\n  "file_path": "a.ts"\n}' },
  ])("shows $where as the input", ({ input, expected }) => {
    const [item] = read([toolUse(input)]);
    expect(item).toMatchObject({ input: expected });
  });

  it.each([
    { where: "text", content: "5", fields: {}, expected: { text: "5", isError: false } },
    { where: "text blocks", content: [{ type: "text", text: "5" }], fields: {}, expected: { text: "5", isError: false } },
    { where: "an error", content: "File not found", fields: { is_error: true }, expected: { text: "File not found", isError: true } },
    { where: "no content", content: undefined, fields: {}, expected: { text: "", isError: false } },
  ])("puts a result with $where into its call", ({ content, fields, expected }) => {
    const items = read([toolUse({ command: "echo 5" }), toolResult(content, fields)]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "tool", result: expected });
  });

  it("cuts a long result", () => {
    const [item] = read([toolUse({ command: "cat big" }), toolResult("x".repeat(RESULT_LIMIT + 1))]);
    expect(item.kind === "tool" && item.result?.text.length).toBe(RESULT_LIMIT);
  });

  it("shows no item for a result whose call is not in the chat", () => {
    expect(read([toolResult("5")])).toEqual([]);
  });

  it("gives a result that waits to the call in an earlier page", () => {
    const held = addTranscriptLines(EMPTY, [toolResult("5", { is_error: true })]);

    const merged = addEarlierLines(claudeAdapter, held, [toolUse({ command: "echo 5" })], 1);

    expect(getItems(merged.chat)).toMatchObject([{ kind: "tool", id: "tool1", result: { text: "5", isError: true } }]);
    expect(merged.orphans.size).toBe(0);
  });

  it("keeps a result that waits until its call arrives", () => {
    const held = addTranscriptLines(EMPTY, [toolResult("5")]);

    const merged = addEarlierLines(claudeAdapter, held, [user("Hi")], 1);

    expect(merged.orphans.has("tool1")).toBe(true);
  });

  it("keeps the call's place when its result comes later", () => {
    const items = read([toolUse({ command: "ls" }), assistant({ type: "text", text: "Waiting" }, { uuid: "a2" }), toolResult("ok")]);
    expect(items.map((item) => item.id)).toEqual(["tool1", "a2/0"]);
  });
});

describe("getChatInfo", () => {
  const record = (fields: object) => JSON.stringify({ type: "assistant", uuid: "a1", ...fields });

  it.each([
    {
      where: "the newest record that carries each field",
      lines: [
        record({ cwd: "/work/old", gitBranch: "old", message: { model: "claude-sonnet-5-5" } }),
        record({ cwd: "/work/demo", gitBranch: "main", message: { model: "claude-opus-5-5" } }),
        record({}),
      ],
      expected: { model: "claude-opus-5-5", folder: "demo", branch: "main" },
    },
    {
      where: "the main session, not a subagent",
      lines: [
        record({ cwd: "/work/demo", gitBranch: "main", message: { model: "claude-opus-5-5" } }),
        record({ isSidechain: true, cwd: "/work/other", gitBranch: "side", message: { model: "claude-haiku-5-5" } }),
      ],
      expected: { model: "claude-opus-5-5", folder: "demo", branch: "main" },
    },
    { where: "a path with a trailing slash", lines: [record({ cwd: "/work/demo/" })], expected: { folder: "demo" } },
    { where: "a record with no branch", lines: [record({ cwd: "/work/demo", gitBranch: "" })], expected: { folder: "demo" } },
    { where: "a synthetic model", lines: [record({ message: { model: "<synthetic>" } })], expected: {} },
    { where: "a field of the wrong type", lines: [record({ cwd: 4, gitBranch: {}, message: { model: [] } })], expected: {} },
    { where: "lines that are not records", lines: ["not json", "[]", "3"], expected: {} },
    { where: "no lines", lines: [], expected: {} },
  ])("reads $where", ({ lines, expected }) => {
    expect(getChatInfo({}, lines)).toEqual(expected);
  });

  it("keeps what the earlier info has when the lines do not carry it", () => {
    const info = getChatInfo({ model: "claude-opus-5-5", folder: "demo" }, [record({ gitBranch: "main" })]);
    expect(info).toEqual({ model: "claude-opus-5-5", folder: "demo", branch: "main" });
  });
});

describe("addTranscriptLines: questions", () => {
  const input = {
    questions: [
      { question: "Which branch?", header: "Branch", multiSelect: false, options: [{ label: "main", description: "Default" }, { label: "dev" }] },
    ],
  };

  it("reads the questions of an AskUserQuestion call", () => {
    const [item] = read([toolUse(input, "AskUserQuestion")]);

    expect(item).toMatchObject({ kind: "tool", questions: [{ question: "Which branch?", multiSelect: false, options: ["main", "dev"] }] });
  });

  it.each([
    { where: "another tool", name: "Bash", input },
    { where: "no questions", name: "AskUserQuestion", input: {} },
    { where: "questions that are not a list", name: "AskUserQuestion", input: { questions: "x" } },
  ])("sets no questions for $where", ({ name, input: toolInput }) => {
    const [item] = read([toolUse(toolInput, name)]);

    expect(item).not.toHaveProperty("questions");
  });

  it("skips an option with no label and a question with no text", () => {
    const [item] = read([toolUse({ questions: [{ question: "Pick", options: [{ label: "a" }, {}, "b"] }, { options: [] }] }, "AskUserQuestion")]);

    expect(item).toMatchObject({ questions: [{ question: "Pick", multiSelect: false, options: ["a"] }] });
  });
});
