import { renderHook, waitFor } from "@testing-library/react-native";

import type { RunCommand } from "@/ssh/bridge";

import { resetFirstmateChecks, useIsFirstmate } from "./useIsFirstmate";

const run = (exitCode: number): jest.MockedFunction<RunCommand> => jest.fn().mockResolvedValue({ output: "", exitCode });

describe("useIsFirstmate", () => {
  beforeEach(resetFirstmateChecks);

  it.each([
    ["a folder with the snapshot script", 0, true],
    ["a folder without it", 1, false],
  ])("finds %s", async (_name, exitCode, expected) => {
    const { result } = renderHook(() => useIsFirstmate("m1", run(exitCode), "/srv/crew"));
    await waitFor(() => expect(result.current).toBe(expected));
  });

  it("checks a pane that reports no folder with no command", () => {
    const check = run(0);
    const { result } = renderHook(() => useIsFirstmate("m1", check, undefined));
    expect(result.current).toBe(false);
    expect(check).not.toHaveBeenCalled();
  });

  it("checks a folder once for the session", async () => {
    const check = run(0);
    const first = renderHook(() => useIsFirstmate("m1", check, "/srv/crew"));
    await waitFor(() => expect(first.result.current).toBe(true));
    first.unmount();

    const second = renderHook(() => useIsFirstmate("m1", check, "/srv/crew"));

    expect(second.result.current).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("checks the same folder on another machine again", async () => {
    const check = run(0);
    renderHook(() => useIsFirstmate("m1", check, "/srv/crew"));
    renderHook(() => useIsFirstmate("m2", check, "/srv/crew"));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
  });

  it("does not keep a failed check, so the next open tries again", async () => {
    const check: jest.MockedFunction<RunCommand> = jest
      .fn()
      .mockRejectedValueOnce(new Error("Connection closed"))
      .mockResolvedValue({ output: "", exitCode: 0 });
    const first = renderHook(() => useIsFirstmate("m1", check, "/srv/crew"));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    expect(first.result.current).toBe(false);
    first.unmount();

    const second = renderHook(() => useIsFirstmate("m1", check, "/srv/crew"));

    await waitFor(() => expect(second.result.current).toBe(true));
  });
});
