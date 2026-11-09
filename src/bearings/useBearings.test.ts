import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

import type { RunCommand } from "@/ssh/bridge";
import { AWAY_MARKER } from "@/ssh/commands";

import fixture from "./fixtures/bearings.json";
import { REFRESH_INTERVAL_MS, useBearings } from "./useBearings";

const SNAPSHOT = JSON.stringify(fixture);
const ok = (output: string) => ({ output, exitCode: 0 });

function makeRun(...replies: (ReturnType<typeof ok> | Error)[]): jest.MockedFunction<RunCommand> {
  const run: jest.MockedFunction<RunCommand> = jest.fn();
  for (const reply of replies) {
    if (reply instanceof Error) run.mockRejectedValueOnce(reply);
    else run.mockResolvedValueOnce(reply);
  }
  return run;
}

const waitForNextRead = () => act(() => jest.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS));

describe("useBearings", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    AppState.currentState = "active";
  });

  it("runs the snapshot on open and shows its sections", async () => {
    const run = makeRun(ok(SNAPSHOT));
    const { result } = renderHook(() => useBearings(run, "/srv/crew"));
    expect(result.current.sections).toBeNull();

    await act(() => jest.advanceTimersByTimeAsync(0));

    expect(result.current.sections?.map((section) => section.id)).toEqual(["decisions", "in-flight", "prs", "secondmates", "queued", "landed"]);
    expect(result.current.updatedAt).not.toBeNull();
    expect(run).toHaveBeenCalledWith(expect.stringContaining("fm-bearings-snapshot.sh"));
  });

  it("runs it again every 30 seconds", async () => {
    const run = makeRun(ok(SNAPSHOT), ok(SNAPSHOT));
    renderHook(() => useBearings(run, "/srv/crew"));
    await act(() => jest.advanceTimersByTimeAsync(0));

    await waitForNextRead();

    expect(run).toHaveBeenCalledTimes(2);
    expect(REFRESH_INTERVAL_MS).toBe(30_000);
  });

  it("starts no run while the app is in the background, and none after the screen closes", async () => {
    const run = makeRun(ok(SNAPSHOT), ok(SNAPSHOT));
    const { unmount } = renderHook(() => useBearings(run, "/srv/crew"));
    await act(() => jest.advanceTimersByTimeAsync(0));
    AppState.currentState = "background";
    await waitForNextRead();
    expect(run).toHaveBeenCalledTimes(1);

    AppState.currentState = "active";
    unmount();
    await waitForNextRead();

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("keeps the last sections and shows one error line when a refresh fails", async () => {
    const run = makeRun(ok(SNAPSHOT), { output: "", exitCode: 2 }, new Error("Connection closed"), ok(SNAPSHOT));
    const { result } = renderHook(() => useBearings(run, "/srv/crew"));
    await act(() => jest.advanceTimersByTimeAsync(0));
    const updatedAt = result.current.updatedAt;

    await waitForNextRead();
    expect(result.current.error).toBe("Could not refresh (exit 2)");
    expect(result.current.sections).toHaveLength(6);
    expect(result.current.updatedAt).toBe(updatedAt);

    await waitForNextRead();
    expect(result.current.error).toBe("Could not refresh: Connection closed");

    await waitForNextRead();
    expect(result.current.error).toBeNull();
  });

  it("shows an error for text that is not JSON and for an unknown schema", async () => {
    const run = makeRun(ok("not json"), ok(JSON.stringify({ schema: "fm-bearings.v2" })));
    const { result } = renderHook(() => useBearings(run, "/srv/crew"));
    await act(() => jest.advanceTimersByTimeAsync(0));
    expect(result.current.error).toMatch(/^Could not read the bearings: /);
    expect(result.current.sections).toBeNull();

    await waitForNextRead();
    expect(result.current.error).toBe("Unsupported bearings version (got fm-bearings.v2)");
  });

  it("shows the away line, keeps the data, and clears it when the home returns", async () => {
    const run = makeRun(ok(SNAPSHOT), ok(`${AWAY_MARKER}\n`), ok(SNAPSHOT));
    const { result } = renderHook(() => useBearings(run, "/srv/crew"));
    await act(() => jest.advanceTimersByTimeAsync(0));

    await waitForNextRead();
    expect(result.current).toMatchObject({ isAway: true, error: null });
    expect(result.current.sections).toHaveLength(6);

    await waitForNextRead();
    expect(result.current.isAway).toBe(false);
  });

  it("runs once at a time: a refresh during a run waits for that run", async () => {
    let finish: (reply: ReturnType<typeof ok>) => void = () => {};
    const run: jest.MockedFunction<RunCommand> = jest.fn().mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useBearings(run, "/srv/crew"));
    await act(() => jest.advanceTimersByTimeAsync(0));

    await act(async () => {
      void result.current.refresh();
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(result.current.isRefreshing).toBe(true);

    await act(async () => finish(ok(SNAPSHOT)));
    expect(result.current.isRefreshing).toBe(false);
  });

  it("runs at once on a refresh and starts the 30 seconds again", async () => {
    const run = makeRun(ok(SNAPSHOT), ok(SNAPSHOT), ok(SNAPSHOT));
    const { result } = renderHook(() => useBearings(run, "/srv/crew"));
    await act(() => jest.advanceTimersByTimeAsync(0));
    await act(() => jest.advanceTimersByTimeAsync(20_000));

    await act(() => result.current.refresh());
    expect(run).toHaveBeenCalledTimes(2);

    await act(() => jest.advanceTimersByTimeAsync(20_000));
    expect(run).toHaveBeenCalledTimes(2);
    await act(() => jest.advanceTimersByTimeAsync(10_000));
    expect(run).toHaveBeenCalledTimes(3);
  });
});
