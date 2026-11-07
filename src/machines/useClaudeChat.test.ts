import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

import type { Pane } from "@/herdr/backend";
import { type FileLines, FileReadError, type HostReader, type LineRange } from "@/ssh/hostReader";

import { type ChatBackend, FIRST_READ_LINES, getCompleteLines, getReadOffset, REFRESH_INTERVAL_MS, useClaudeChat } from "./useClaudeChat";

const SESSION_PATH = ".claude/sessions/100.json";
const TRANSCRIPT_PATH = ".claude/projects/-work-demo/s-1.jsonl";
const OTHER_TRANSCRIPT_PATH = ".claude/projects/-work-demo/s-2.jsonl";

function session(sessionId: string): string {
  return JSON.stringify({ pid: 100, sessionId, cwd: "/work/demo" });
}

function prompt(index: number): string {
  return `${JSON.stringify({ type: "user", uuid: `u${index}`, message: { content: `Prompt ${index}` } })}\n`;
}

function promptWithInfo(index: number, fields: object): string {
  return `${JSON.stringify({ type: "user", uuid: `u${index}`, message: { content: `Prompt ${index}` }, ...fields })}\n`;
}

function makeLongTranscript(count: number): string {
  return Array.from({ length: count }, (_, index) => prompt(index + 1)).join("");
}

function claudePane(fields: Partial<Pane> = {}): Pane {
  return { id: "t1", title: "", agent: "claude-code", state: "working", isFinished: false, columns: null, pid: 100, ...fields };
}

/** A machine with files whose text the test changes, read the way Herdr's `file.read` reads. */
function makeMachine(files: Record<string, string>) {
  const readFile = jest.fn(async (path: string, range: LineRange = {}): Promise<FileLines> => {
    if (!(path in files)) throw new FileReadError("not_found");
    return readLines(files[path], range);
  });
  const getPane = jest.fn(async () => claudePane());
  const findInSubfolders = jest.fn(async (folder: string, fileName: string) =>
    Object.keys(files).filter((path) => path.startsWith(`${folder}/`) && path.split("/").length === folder.split("/").length + 2 && path.endsWith(`/${fileName}`)),
  );
  const host: HostReader = { readFile, findInSubfolders };
  const backend: ChatBackend = { getVersion: jest.fn(), listSpaces: jest.fn(), readPane: jest.fn(), sendLine: jest.fn(), pressKey: jest.fn(), getPane };
  return { backend, host, files, readFile, findInSubfolders, getPane };
}

// Lines keep their ends; a last line with no newline counts.
function readLines(text: string, { offset = 1, limit }: LineRange): FileLines {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const taken = lines.slice(offset - 1, limit === undefined ? undefined : offset - 1 + limit);
  return { text: taken.join(""), first: offset, last: offset + taken.length - 1, lines: lines.length };
}

function getPromptTexts(chat: ReturnType<typeof useClaudeChat>["chat"]): string[] {
  return Array.from(chat?.values() ?? []).map((item) => (item.kind === "prompt" ? item.text : item.kind));
}

async function openChat({ backend, host }: { backend: ChatBackend; host: HostReader }) {
  const hook = renderHook(() => useClaudeChat(backend, host, "t1"));
  await act(() => jest.advanceTimersByTimeAsync(0));
  return hook;
}

async function waitForNextPoll() {
  await act(() => jest.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS));
}

describe("getReadOffset", () => {
  it.each([
    { where: "an empty file on open", lineCount: 0, nextLine: null, expected: null },
    { where: "a short file on open", lineCount: 3, nextLine: null, expected: 1 },
    { where: "a file of exactly the first read on open", lineCount: FIRST_READ_LINES, nextLine: null, expected: 1 },
    { where: "a long file on open", lineCount: 150, nextLine: null, expected: 51 },
    { where: "no new lines", lineCount: 7, nextLine: 8, expected: null },
    { where: "new lines", lineCount: 9, nextLine: 8, expected: 8 },
    { where: "a file that got shorter", lineCount: 5, nextLine: 8, expected: null },
  ])("gives $expected for $where", ({ lineCount, nextLine, expected }) => {
    expect(getReadOffset(lineCount, nextLine)).toBe(expected);
  });
});

describe("getCompleteLines", () => {
  it.each([
    { where: "complete lines", read: { text: "a\nb\n", first: 4, last: 5, lines: 5 }, expected: { lines: ["a", "b"], nextLine: 6 } },
    { where: "a last line still being written", read: { text: "a\nb", first: 4, last: 5, lines: 5 }, expected: { lines: ["a"], nextLine: 5 } },
    { where: "only a line still being written", read: { text: "a", first: 4, last: 4, lines: 4 }, expected: { lines: [], nextLine: 4 } },
    { where: "no lines", read: { text: "", first: 4, last: 3, lines: 3 }, expected: { lines: [], nextLine: 4 } },
  ])("keeps $where", ({ read, expected }) => {
    expect(getCompleteLines(read)).toEqual(expected);
  });
});

describe("useClaudeChat", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    AppState.currentState = "active";
  });

  it("opens on the last lines of the pane's transcript", async () => {
    const lines = Array.from({ length: 150 }, (_, index) => prompt(index + 1)).join("");
    const machine = makeMachine({ [SESSION_PATH]: session("s-1"), [TRANSCRIPT_PATH]: lines });

    const { result } = await openChat(machine);

    expect(machine.readFile).toHaveBeenCalledWith(TRANSCRIPT_PATH, { offset: 51 });
    expect(result.current.chat?.size).toBe(FIRST_READ_LINES);
    expect(getPromptTexts(result.current.chat)[0]).toBe("Prompt 51");
  });

  it("reads only the new lines after that, and nothing when there are none", async () => {
    const machine = makeMachine({ [SESSION_PATH]: session("s-1"), [TRANSCRIPT_PATH]: prompt(1) });
    const { result } = await openChat(machine);

    await waitForNextPoll();
    expect(machine.readFile).not.toHaveBeenCalledWith(TRANSCRIPT_PATH, { offset: 2 });

    machine.files[TRANSCRIPT_PATH] += prompt(2);
    await waitForNextPoll();

    expect(machine.readFile).toHaveBeenLastCalledWith(TRANSCRIPT_PATH, { offset: 2 });
    expect(getPromptTexts(result.current.chat)).toEqual(["Prompt 1", "Prompt 2"]);
  });

  it("reads a line Claude is still writing again once it is complete", async () => {
    const partial = prompt(2).trimEnd();
    const machine = makeMachine({ [SESSION_PATH]: session("s-1"), [TRANSCRIPT_PATH]: prompt(1) + partial.slice(0, 10) });
    const { result } = await openChat(machine);
    expect(getPromptTexts(result.current.chat)).toEqual(["Prompt 1"]);

    machine.files[TRANSCRIPT_PATH] = prompt(1) + prompt(2);
    await waitForNextPoll();

    expect(getPromptTexts(result.current.chat)).toEqual(["Prompt 1", "Prompt 2"]);
  });

  it("starts a new chat when the pane's session changes", async () => {
    const machine = makeMachine({ [SESSION_PATH]: session("s-1"), [TRANSCRIPT_PATH]: prompt(1), [OTHER_TRANSCRIPT_PATH]: prompt(9) });
    const { result } = await openChat(machine);

    machine.files[SESSION_PATH] = session("s-2");
    await waitForNextPoll();

    expect(getPromptTexts(result.current.chat)).toEqual(["Prompt 9"]);
  });

  it.each<{ where: string; files: Record<string, string> }>([
    { where: "the session file is missing", files: { [TRANSCRIPT_PATH]: prompt(1) } },
    { where: "the session file names no session", files: { [SESSION_PATH]: "{}", [TRANSCRIPT_PATH]: prompt(1) } },
    { where: "the transcript is missing", files: { [SESSION_PATH]: session("s-1") } },
  ])("says the chat is not available when $where, until it is", async ({ files }) => {
    const machine = makeMachine({ ...files });
    const { result } = await openChat(machine);
    expect(result.current.chat?.size).toBe(0);

    Object.assign(machine.files, { [SESSION_PATH]: session("s-1"), [TRANSCRIPT_PATH]: prompt(1) });
    await waitForNextPoll();

    expect(getPromptTexts(result.current.chat)).toEqual(["Prompt 1"]);
  });

  it("says the chat is not available when Claude no longer runs in the pane", async () => {
    const machine = makeMachine({ [SESSION_PATH]: session("s-1"), [TRANSCRIPT_PATH]: prompt(1) });
    machine.getPane.mockResolvedValue(claudePane({ agent: null, pid: undefined }));

    const { result } = await openChat(machine);

    expect(result.current.chat?.size).toBe(0);
  });

  describe("on the TUI, where Herdr gives the session id and no process", () => {
    const tuiPane = (sessionId: string | null = "s-1") => claudePane({ agent: "claude", pid: undefined, sessionId: sessionId ?? undefined });
    const OTHER_PROJECT_PATH = ".claude/projects/-work-other/s-1.jsonl";

    it("reads the one transcript named for the session, without a session file", async () => {
      const machine = makeMachine({ [TRANSCRIPT_PATH]: prompt(1) });
      machine.getPane.mockResolvedValue(tuiPane());

      const { result } = await openChat(machine);

      expect(machine.findInSubfolders).toHaveBeenCalledWith(".claude/projects", "s-1.jsonl");
      expect(machine.readFile).not.toHaveBeenCalledWith(SESSION_PATH, expect.anything());
      expect(getPromptTexts(result.current.chat)).toEqual(["Prompt 1"]);
    });

    it.each<{ where: string; files: Record<string, string> }>([
      { where: "no transcript has the session's name", files: { [OTHER_TRANSCRIPT_PATH]: prompt(1) } },
      { where: "two projects have a transcript of that name", files: { [TRANSCRIPT_PATH]: prompt(1), [OTHER_PROJECT_PATH]: prompt(2) } },
    ])("shows no chat when $where", async ({ files }) => {
      const machine = makeMachine(files);
      machine.getPane.mockResolvedValue(tuiPane());

      const { result } = await openChat(machine);

      expect(result.current.chat?.size).toBe(0);
    });

    it("shows no chat when Herdr gives no session id", async () => {
      const machine = makeMachine({ [TRANSCRIPT_PATH]: prompt(1) });
      machine.getPane.mockResolvedValue(tuiPane(null));

      const { result } = await openChat(machine);

      expect(result.current.chat?.size).toBe(0);
      expect(machine.findInSubfolders).not.toHaveBeenCalled();
    });

    it("starts a new chat when the pane's session id changes", async () => {
      const machine = makeMachine({ [TRANSCRIPT_PATH]: prompt(1), [OTHER_TRANSCRIPT_PATH]: prompt(9) });
      machine.getPane.mockResolvedValue(tuiPane());
      const { result } = await openChat(machine);

      machine.getPane.mockResolvedValue(tuiPane("s-2"));
      await waitForNextPoll();

      expect(getPromptTexts(result.current.chat)).toEqual(["Prompt 9"]);
    });
  });

  it("gives the pane as Herdr has it now, for its state and message", async () => {
    const machine = makeMachine({ [SESSION_PATH]: session("s-1"), [TRANSCRIPT_PATH]: prompt(1) });
    machine.getPane.mockResolvedValue(claudePane({ state: "blocked", message: "approve Bash: npm test" }));

    const { result } = await openChat(machine);

    expect(result.current.pane).toMatchObject({ state: "blocked", message: "approve Bash: npm test" });
  });

  it("keeps the chat and shows the error when the connection fails, until a poll works", async () => {
    const machine = makeMachine({ [SESSION_PATH]: session("s-1"), [TRANSCRIPT_PATH]: prompt(1) });
    const { result } = await openChat(machine);

    machine.getPane.mockRejectedValueOnce(new Error("Connection closed"));
    await waitForNextPoll();

    expect(getPromptTexts(result.current.chat)).toEqual(["Prompt 1"]);
    expect(result.current.error).toBe("Could not read the chat: Connection closed");

    await waitForNextPoll();

    expect(result.current.error).toBeNull();
  });

  it("reads nothing while the app is in the background, and stops when the screen closes", async () => {
    const machine = makeMachine({ [SESSION_PATH]: session("s-1"), [TRANSCRIPT_PATH]: prompt(1) });
    const { unmount } = await openChat(machine);

    AppState.currentState = "background";
    await waitForNextPoll();
    expect(machine.getPane).toHaveBeenCalledTimes(1);

    AppState.currentState = "active";
    unmount();
    await jest.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 3);
    expect(machine.getPane).toHaveBeenCalledTimes(1);
  });

  describe("loading earlier lines", () => {
    function openLong(count: number) {
      const machine = makeMachine({ [SESSION_PATH]: session("s-1"), [TRANSCRIPT_PATH]: makeLongTranscript(count) });
      return { machine, opened: openChat(machine) };
    }

    async function loadEarlier(hook: Awaited<ReturnType<typeof openChat>>) {
      await act(async () => {
        hook.result.current.loadEarlier();
        await jest.advanceTimersByTimeAsync(0);
      });
    }

    it("prepends the 100 lines before the oldest, in order, with no duplicates, back to line 1", async () => {
      const { machine, opened } = openLong(250);
      const hook = await opened;
      expect(hook.result.current.hasEarlier).toBe(true);

      await loadEarlier(hook);
      expect(machine.readFile).toHaveBeenLastCalledWith(TRANSCRIPT_PATH, { offset: 51, limit: 100 });
      expect(getPromptTexts(hook.result.current.chat).slice(0, 2)).toEqual(["Prompt 51", "Prompt 52"]);
      expect(hook.result.current.hasEarlier).toBe(true);

      await loadEarlier(hook);
      expect(machine.readFile).toHaveBeenLastCalledWith(TRANSCRIPT_PATH, { offset: 1, limit: 50 });
      const texts = getPromptTexts(hook.result.current.chat);
      expect(texts).toEqual(Array.from({ length: 250 }, (_, index) => `Prompt ${index + 1}`));
      expect(hook.result.current.hasEarlier).toBe(false);
    });

    it("reads nothing once line 1 is shown", async () => {
      const { machine, opened } = openLong(20);
      const hook = await opened;
      expect(hook.result.current.hasEarlier).toBe(false);
      const readCount = machine.readFile.mock.calls.length;

      await loadEarlier(hook);

      expect(machine.readFile).toHaveBeenCalledTimes(readCount);
    });

    it("reads one page for repeated calls at once", async () => {
      const { machine, opened } = openLong(250);
      const hook = await opened;

      await act(async () => {
        hook.result.current.loadEarlier();
        hook.result.current.loadEarlier();
        await jest.advanceTimersByTimeAsync(0);
      });

      const pageReads = machine.readFile.mock.calls.filter(([, range]) => range?.limit === 100);
      expect(pageReads).toHaveLength(1);
    });

    it("still reads new lines after loading earlier ones", async () => {
      const { machine, opened } = openLong(250);
      const hook = await opened;
      await loadEarlier(hook);

      machine.files[TRANSCRIPT_PATH] += prompt(251);
      await waitForNextPoll();

      expect(machine.readFile).toHaveBeenLastCalledWith(TRANSCRIPT_PATH, { offset: 251 });
      const texts = getPromptTexts(hook.result.current.chat);
      expect(texts).toHaveLength(201);
      expect(texts[0]).toBe("Prompt 51");
      expect(texts.at(-1)).toBe("Prompt 251");
    });

    it("gives a result at the top of a page to its call in the page before it", async () => {
      const call = JSON.stringify({ type: "assistant", uuid: "a1", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }] } });
      const result = JSON.stringify({ type: "user", uuid: "r1", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] } });
      // Line 99 holds the call and line 100 its result, so the first read of the last 100 lines starts on the result.
      const text = makeLongTranscript(98) + `${call}\n${result}\n` + makeLongTranscript(99);
      const machine = makeMachine({ [SESSION_PATH]: session("s-1"), [TRANSCRIPT_PATH]: text });
      const hook = await openChat(machine);
      expect(hook.result.current.hasEarlier).toBe(true);

      await loadEarlier(hook);

      const tool = Array.from(hook.result.current.chat?.values() ?? []).find((item) => item.kind === "tool");
      expect(tool).toMatchObject({ id: "t1", result: { text: "ok", isError: false } });
    });

    it("keeps a compacted conversation going back past its boundary", async () => {
      const boundary = `${JSON.stringify({ type: "system", subtype: "compact_boundary", uuid: "c1" })}\n`;
      const text = prompt(901) + boundary + makeLongTranscript(99);
      const machine = makeMachine({ [SESSION_PATH]: session("s-1"), [TRANSCRIPT_PATH]: text });
      const hook = await openChat(machine);
      expect(hook.result.current.hasEarlier).toBe(true);

      await loadEarlier(hook);

      expect(getPromptTexts(hook.result.current.chat)[0]).toBe("Prompt 901");
      expect(hook.result.current.hasEarlier).toBe(false);
    });

    it("forgets the earlier lines when the pane's session changes", async () => {
      const { machine, opened } = openLong(250);
      const hook = await opened;
      await loadEarlier(hook);
      machine.files[OTHER_TRANSCRIPT_PATH] = prompt(9);

      machine.files[SESSION_PATH] = session("s-2");
      await waitForNextPoll();

      expect(getPromptTexts(hook.result.current.chat)).toEqual(["Prompt 9"]);
      expect(hook.result.current.hasEarlier).toBe(false);
    });
  });

  describe("info", () => {
    it("gives the model, folder and branch from the newest records", async () => {
      const lines =
        promptWithInfo(1, { cwd: "/work/old", gitBranch: "old" }) +
        promptWithInfo(2, { cwd: "/work/demo", gitBranch: "main", message: { model: "claude-opus-5-5", content: "Prompt 2" } });
      const machine = makeMachine({ [SESSION_PATH]: session("s-1"), [TRANSCRIPT_PATH]: lines });

      const { result } = await openChat(machine);

      expect(result.current.info).toEqual({ model: "claude-opus-5-5", folder: "demo", branch: "main" });
    });

    it("leaves out what no record has", async () => {
      const machine = makeMachine({ [SESSION_PATH]: session("s-1"), [TRANSCRIPT_PATH]: prompt(1) });

      const { result } = await openChat(machine);

      expect(result.current.info).toEqual({});
    });

    it("keeps the newest values when an earlier page has other ones", async () => {
      const early = promptWithInfo(1, { cwd: "/work/old", gitBranch: "old", message: { model: "claude-sonnet-5-5", content: "Prompt 1" } });
      const rest = Array.from({ length: 100 }, (_, index) => promptWithInfo(index + 2, index === 99 ? { gitBranch: "main" } : {})).join("");
      const machine = makeMachine({ [SESSION_PATH]: session("s-1"), [TRANSCRIPT_PATH]: early + rest });
      const hook = await openChat(machine);
      await act(async () => {
        hook.result.current.loadEarlier();
        await jest.advanceTimersByTimeAsync(0);
      });

      expect(hook.result.current.info).toEqual({ model: "claude-sonnet-5-5", folder: "old", branch: "main" });
    });
  });
});
