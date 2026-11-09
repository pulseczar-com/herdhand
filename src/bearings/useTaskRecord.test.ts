import { renderHook, waitFor } from "@testing-library/react-native";

import type { RunCommand } from "@/ssh/bridge";

import type { Row } from "./bearings";
import { RETRY_MS, type CachedRecord } from "./records";
import { useTaskRecord } from "./useTaskRecord";

const SHOW = 'task:\n  id: t-1\n  title: "Add widget cache"\n  kind: ship\n';
const row = (doing: string): Row => ({ itemId: "t-1", title: "Add", detail: "", facts: [["Doing", doing]] });

function makeRun(...replies: ({ output: string; exitCode: number } | Error)[]): jest.MockedFunction<RunCommand> {
  const run: jest.MockedFunction<RunCommand> = jest.fn();
  for (const reply of replies) {
    if (reply instanceof Error) run.mockRejectedValueOnce(reply);
    else run.mockResolvedValueOnce(reply);
  }
  return run;
}

describe("useTaskRecord", () => {
  it("fetches the record of the item once and parses it", async () => {
    const run = makeRun({ output: SHOW, exitCode: 0 });
    const cache = new Map<string, CachedRecord>();
    const { result } = renderHook(() => useTaskRecord(cache, run, "/srv/crew", "in-flight", row("a")));
    expect(result.current.record).toBeUndefined();

    await waitFor(() => expect(result.current.record).toEqual({ id: "t-1", title: "Add widget cache", kind: "ship" }));

    expect(run).toHaveBeenCalledWith(expect.stringContaining("fm-tasks-axi.sh"));
  });

  it("uses the cache for an unchanged row, and fetches again when the row changed", async () => {
    const run = makeRun({ output: SHOW, exitCode: 0 }, { output: SHOW, exitCode: 0 });
    const cache = new Map<string, CachedRecord>();
    const first = renderHook(() => useTaskRecord(cache, run, "/srv/crew", "in-flight", row("a")));
    await waitFor(() => expect(first.result.current.record).toBeDefined());
    first.unmount();

    const same = renderHook(() => useTaskRecord(cache, run, "/srv/crew", "in-flight", row("a")));
    expect(same.result.current.record).toBeDefined();
    expect(run).toHaveBeenCalledTimes(1);
    same.unmount();

    renderHook(() => useTaskRecord(cache, run, "/srv/crew", "in-flight", row("b")));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });

  it("runs no command for a secondmate or a missing row", () => {
    const run = makeRun();
    const cache = new Map<string, CachedRecord>();
    const secondmate = renderHook(() => useTaskRecord(cache, run, "/srv/crew", "secondmates", row("a")));
    const missing = renderHook(() => useTaskRecord(cache, run, "/srv/crew", "in-flight", undefined));
    expect(run).not.toHaveBeenCalled();
    expect([secondmate.result.current.record, missing.result.current.record]).toEqual([undefined, undefined]);
  });

  it.each([
    ["an exit code", { output: "", exitCode: 1 }],
    ["a thrown error", new Error("Connection closed")],
  ])("shows the failure of %s, and waits before it tries again", async (_name, reply) => {
    const run = makeRun(reply);
    const cache = new Map<string, CachedRecord>();
    const { result } = renderHook(() => useTaskRecord(cache, run, "/srv/crew", "in-flight", row("a")));

    await waitFor(() => expect(result.current.hasFailed).toBe(true));

    expect(result.current.record).toBeUndefined();
    expect(cache.get("t-1")?.failedAt).toBeDefined();
    expect(RETRY_MS).toBeGreaterThan(0);
  });
});
