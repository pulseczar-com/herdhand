import { act, renderHook } from "@testing-library/react-native";

import type { Backend, Pane } from "@/herdr/backend";

import { REFRESH_INTERVAL_MS } from "./usePaneText";
import { useShellBlocks } from "./useShellBlocks";

const shell = (isShellForeground: boolean): Pane => ({ id: "t6", title: "", agent: null, state: null, isFinished: false, columns: null, isShellForeground });

/** A backend whose pane has this text and foreground until the test sets another. */
function makeBackend() {
  const state = { text: "$ ", pane: shell(true) };
  const backend: Backend = {
    getVersion: jest.fn(),
    listSpaces: jest.fn(),
    readPane: jest.fn(async () => state.text),
    sendLine: jest.fn(),
    pressKey: jest.fn(),
    getPane: jest.fn(async () => state.pane),
  };
  return { backend, state };
}

async function waitForNextRead() {
  await act(() => jest.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS));
}

describe("useShellBlocks", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("keeps the pane as it was on open as the first, plain block", async () => {
    const { backend, state } = makeBackend();
    state.text = "old output\n$ ";
    const { result } = renderHook(() => useShellBlocks(backend, "t6"));
    await act(() => jest.advanceTimersByTimeAsync(0));

    state.text = "something else\n$ ";
    await waitForNextRead();

    expect(result.current.opening).toBe("old output\n$ ");
  });

  it("keeps the pane as it was when the shell first holds the foreground, so a program running on open shows only once", async () => {
    const { backend, state } = makeBackend();
    state.text = "top - 10:00:00 up 1 day\n  PID USER";
    state.pane = shell(false);
    const { result } = renderHook(() => useShellBlocks(backend, "t6"));
    await act(() => jest.advanceTimersByTimeAsync(0));

    expect(result.current.opening).toBeNull();
    expect(result.current.isRunning).toBe(true);

    state.text = "$ top\n$ ";
    state.pane = shell(true);
    await waitForNextRead();

    expect(result.current.opening).toBe("$ top\n$ ");
  });

  it("turns a line sent from the phone into a block that closes with its output", async () => {
    const { backend, state } = makeBackend();
    const { result } = renderHook(() => useShellBlocks(backend, "t6"));
    await act(() => jest.advanceTimersByTimeAsync(0));

    act(() => result.current.onSent("ls"));
    expect(result.current.blocks).toEqual([expect.objectContaining({ command: "ls", output: null })]);
    expect(result.current.isRunning).toBe(true);

    state.text = "$ ls\na\nb\n$ ";
    await waitForNextRead();

    expect(result.current.blocks).toEqual([expect.objectContaining({ command: "ls", output: "a\nb" })]);
    expect(result.current.isRunning).toBe(false);
  });

  it("closes a clear sent twice, though the pane text never changes", async () => {
    const { backend } = makeBackend();
    const { result } = renderHook(() => useShellBlocks(backend, "t6"));
    await act(() => jest.advanceTimersByTimeAsync(0));

    act(() => result.current.onSent("clear"));
    await waitForNextRead();
    expect(result.current.blocks[0].output).toBeNull();
    await waitForNextRead();
    expect(result.current.blocks[0]).toMatchObject({ output: "", isCut: false });

    act(() => result.current.onSent("clear"));
    await waitForNextRead();
    await waitForNextRead();
    expect(result.current.blocks).toEqual([expect.objectContaining({ output: "" }), expect.objectContaining({ command: "clear", output: "", isCut: false })]);
    expect(result.current.isRunning).toBe(false);
  });

  it("counts the reads from when a slow send resolves, not from when Send was pressed", async () => {
    const { backend } = makeBackend();
    const { result } = renderHook(() => useShellBlocks(backend, "t6"));
    await act(() => jest.advanceTimersByTimeAsync(0));

    const pressedSend = result.current.onSent;
    await waitForNextRead();
    await waitForNextRead();
    act(() => pressedSend("clear"));

    await waitForNextRead();
    expect(result.current.blocks[0].output).toBeNull();
    await waitForNextRead();
    expect(result.current.blocks[0]).toMatchObject({ output: "", isCut: false });
  });

  it("starts no block for a line sent while a program started on the host holds the foreground", async () => {
    const { backend, state } = makeBackend();
    const { result } = renderHook(() => useShellBlocks(backend, "t6"));
    await act(() => jest.advanceTimersByTimeAsync(0));

    state.text = "~\n-- INSERT --";
    state.pane = shell(false);
    await waitForNextRead();
    act(() => result.current.onSent(":wq"));

    expect(result.current.blocks).toEqual([]);
  });

  it("keeps the block running, with the pane's screen, while another program holds the foreground", async () => {
    const { backend, state } = makeBackend();
    const { result } = renderHook(() => useShellBlocks(backend, "t6"));
    await act(() => jest.advanceTimersByTimeAsync(0));
    act(() => result.current.onSent("vim notes.txt"));

    state.text = "~\n~\n-- INSERT --";
    state.pane = shell(false);
    await waitForNextRead();

    expect(result.current.blocks[0].output).toBeNull();
    expect(result.current.isRunning).toBe(true);
    expect(result.current.text).toBe("~\n~\n-- INSERT --");
  });

  it("counts a program started on the host as running, with no block for it", async () => {
    const { backend, state } = makeBackend();
    const { result } = renderHook(() => useShellBlocks(backend, "t6"));
    await act(() => jest.advanceTimersByTimeAsync(0));

    state.pane = shell(false);
    await waitForNextRead();

    expect(result.current.blocks).toEqual([]);
    expect(result.current.isRunning).toBe(true);
  });
});
