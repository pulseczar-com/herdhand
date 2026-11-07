import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

import type { Backend, Pane } from "@/herdr/backend";

import { REFRESH_INTERVAL_MS, usePaneText } from "./usePaneText";

function makeBackend(...replies: (string | Error)[]): Backend {
  const readPane = jest.fn();
  for (const reply of replies) {
    if (reply instanceof Error) readPane.mockRejectedValueOnce(reply);
    else readPane.mockResolvedValueOnce(reply);
  }
  return { getVersion: jest.fn(), listSpaces: jest.fn(), readPane, sendLine: jest.fn(), pressKey: jest.fn() };
}

/** Runs the timers to the next read and lets its reply land. */
async function waitForNextRead() {
  await act(() => jest.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS));
}

describe("usePaneText", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    AppState.currentState = "active";
  });

  it("reads the pane on open", async () => {
    const backend = makeBackend("$ ls");
    const { result } = renderHook(() => usePaneText(backend, "t6"));
    expect(result.current.text).toBeNull();

    await act(() => jest.advanceTimersByTimeAsync(0));

    expect(result.current.text).toBe("$ ls");
    expect(backend.readPane).toHaveBeenCalledWith("t6");
  });

  it("reads it again after the interval", async () => {
    const backend = makeBackend("$ ls", "$ ls\nREADME.md");
    const { result } = renderHook(() => usePaneText(backend, "t6"));
    await act(() => jest.advanceTimersByTimeAsync(0));

    await waitForNextRead();

    expect(result.current.text).toBe("$ ls\nREADME.md");
  });

  it("keeps the last text and shows the error when a read fails, until a read works", async () => {
    const backend = makeBackend("$ ls", new Error("Connection closed"), "$ date");
    const { result } = renderHook(() => usePaneText(backend, "t6"));
    await act(() => jest.advanceTimersByTimeAsync(0));

    await waitForNextRead();

    expect(result.current.text).toBe("$ ls");
    expect(result.current.error).toBe("Could not read the pane: Connection closed");

    await waitForNextRead();

    expect(result.current.text).toBe("$ date");
    expect(result.current.error).toBeNull();
  });

  it("stops reading when the screen closes", async () => {
    const backend = makeBackend("$ ls", "$ ls");
    const { unmount } = renderHook(() => usePaneText(backend, "t6"));
    await act(() => jest.advanceTimersByTimeAsync(0));

    unmount();
    await jest.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 3);

    expect(backend.readPane).toHaveBeenCalledTimes(1);
  });

  it("reads nothing while the app is in the background, and reads again on return", async () => {
    const backend = makeBackend("$ ls", "$ date");
    const { result } = renderHook(() => usePaneText(backend, "t6"));
    await act(() => jest.advanceTimersByTimeAsync(0));

    AppState.currentState = "background";
    await waitForNextRead();
    await waitForNextRead();

    expect(backend.readPane).toHaveBeenCalledTimes(1);

    AppState.currentState = "active";
    await waitForNextRead();

    expect(result.current.text).toBe("$ date");
  });

  it("reads the pane's state with its text, where Herdr can read one pane", async () => {
    const blocked: Pane = { id: "t6", title: "", agent: "codex", state: "blocked", isFinished: false, columns: null, blockedKind: "question" };
    const backend = { ...makeBackend("$ codex"), getPane: jest.fn().mockResolvedValue(blocked) };
    const { result } = renderHook(() => usePaneText(backend, "t6"));

    await act(() => jest.advanceTimersByTimeAsync(0));

    expect(result.current.pane).toBe(blocked);
    expect(backend.getPane).toHaveBeenCalledWith("t6");
  });

  it("has no pane where Herdr cannot read one pane, as on the TUI", async () => {
    const backend = makeBackend("$ ls");
    const { result } = renderHook(() => usePaneText(backend, "t6"));

    await act(() => jest.advanceTimersByTimeAsync(0));

    expect(result.current.text).toBe("$ ls");
    expect(result.current.pane).toBeNull();
  });
});
