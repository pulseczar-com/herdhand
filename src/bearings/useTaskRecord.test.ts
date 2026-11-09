import { renderHook, waitFor } from "@testing-library/react-native";

import type { RunCommand } from "@/ssh/bridge";

import type { Row } from "./bearings";
import type { CachedRecord } from "./records";
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
    const { result } = renderHook(() => useTaskRecord({ recordCache: cache, run, folder: "/srv/crew" }, "in-flight", row("a")));
    expect(result.current.record).toBeUndefined();

    await waitFor(() => expect(result.current.record).toEqual({ id: "t-1", title: "Add widget cache", kind: "ship" }));

    expect(run).toHaveBeenCalledWith(expect.stringContaining("fm-tasks-axi.sh"));
  });

  it("uses the cache for an unchanged row, and fetches again when the row changed", async () => {
    const run = makeRun({ output: SHOW, exitCode: 0 }, { output: SHOW, exitCode: 0 });
    const cache = new Map<string, CachedRecord>();
    const first = renderHook(() => useTaskRecord({ recordCache: cache, run, folder: "/srv/crew" }, "in-flight", row("a")));
    await waitFor(() => expect(first.result.current.record).toBeDefined());
    first.unmount();

    const same = renderHook(() => useTaskRecord({ recordCache: cache, run, folder: "/srv/crew" }, "in-flight", row("a")));
    expect(same.result.current.record).toBeDefined();
    expect(run).toHaveBeenCalledTimes(1);
    same.unmount();

    renderHook(() => useTaskRecord({ recordCache: cache, run, folder: "/srv/crew" }, "in-flight", row("b")));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });

  it("runs no command for a secondmate or a missing row", () => {
    const run = makeRun();
    const cache = new Map<string, CachedRecord>();
    const secondmate = renderHook(() => useTaskRecord({ recordCache: cache, run, folder: "/srv/crew" }, "secondmates", row("a")));
    const missing = renderHook(() => useTaskRecord({ recordCache: cache, run, folder: "/srv/crew" }, "in-flight", undefined));
    expect(run).not.toHaveBeenCalled();
    expect([secondmate.result.current.record, missing.result.current.record]).toEqual([undefined, undefined]);
  });

  it.each([
    ["an exit code", { output: "", exitCode: 1 }],
    ["a thrown error", new Error("Connection closed")],
  ])("shows the failure of %s, and does not fetch again when the item opens again", async (_name, reply) => {
    const run = makeRun(reply);
    const cache = new Map<string, CachedRecord>();
    const { result, unmount } = renderHook(() => useTaskRecord({ recordCache: cache, run, folder: "/srv/crew" }, "in-flight", row("a")));

    await waitFor(() => expect(result.current.hasFailed).toBe(true));

    expect(result.current.record).toBeUndefined();
    expect(cache.get("in-flight\nt-1")?.failedAt).toBeDefined();
    unmount();

    const reopened = renderHook(() => useTaskRecord({ recordCache: cache, run, folder: "/srv/crew" }, "in-flight", row("a")));

    expect(reopened.result.current.hasFailed).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an exit code", { output: "", exitCode: 1 }],
    ["a thrown error", new Error("Connection closed")],
  ])("keeps the record it had when a fetch for a changed row fails with %s", async (_name, reply) => {
    const run = makeRun({ output: SHOW, exitCode: 0 }, reply);
    const cache = new Map<string, CachedRecord>();
    const { result, rerender } = renderHook(({ doing }) => useTaskRecord({ recordCache: cache, run, folder: "/srv/crew" }, "in-flight", row(doing)), {
      initialProps: { doing: "a" },
    });
    await waitFor(() => expect(result.current.record).toBeDefined());

    rerender({ doing: "b" });
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(cache.get("in-flight\nt-1")?.failedAt).toBeDefined());

    expect(result.current.record).toEqual({ id: "t-1", title: "Add widget cache", kind: "ship" });
    expect(result.current.hasFailed).toBe(false);
  });

  it("keeps a record for each section of an item that is in two sections", async () => {
    const run = makeRun({ output: SHOW, exitCode: 0 }, { output: SHOW, exitCode: 0 });
    const cache = new Map<string, CachedRecord>();
    const source = { recordCache: cache, run, folder: "/srv/crew" };
    const inFlight = renderHook(() => useTaskRecord(source, "in-flight", row("a")));
    await waitFor(() => expect(inFlight.result.current.record).toBeDefined());
    inFlight.unmount();
    const prs = renderHook(() => useTaskRecord(source, "prs", row("a")));
    await waitFor(() => expect(prs.result.current.record).toBeDefined());
    prs.unmount();

    renderHook(() => useTaskRecord(source, "in-flight", row("a")));

    expect(run).toHaveBeenCalledTimes(2);
  });
});
