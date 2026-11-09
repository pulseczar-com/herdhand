import { renderHook, waitFor } from "@testing-library/react-native";

import type { RunCommand } from "@/ssh/bridge";
import { getTestFirstmateCommand } from "@/ssh/commands";

import { resetFirstmateChecks, useIsFirstmate } from "./useIsFirstmate";

const run = (exitCode: number): jest.MockedFunction<RunCommand> => jest.fn().mockResolvedValue({ output: "", exitCode });

const firstmate = { cwd: "/srv/crew", pid: 1476 };

describe("useIsFirstmate", () => {
  beforeEach(resetFirstmateChecks);

  it.each([
    ["a folder with the snapshot script", 0, true],
    ["a folder without it", 1, false],
  ])("finds %s", async (_name, exitCode, expected) => {
    const { result } = renderHook(() => useIsFirstmate("m1", run(exitCode), firstmate));
    await waitFor(() => expect(result.current).toBe(expected));
  });

  it("checks a pane that reports no folder with no command", () => {
    const check = run(0);
    const { result } = renderHook(() => useIsFirstmate("m1", check, {}));
    expect(result.current).toBe(false);
    expect(check).not.toHaveBeenCalled();
  });

  it("checks a folder once for the session", async () => {
    const check = run(0);
    const first = renderHook(() => useIsFirstmate("m1", check, firstmate));
    await waitFor(() => expect(first.result.current).toBe(true));
    first.unmount();

    const second = renderHook(() => useIsFirstmate("m1", check, firstmate));

    expect(second.result.current).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("asks with the pane's pid and session id", async () => {
    const check = run(0);
    renderHook(() => useIsFirstmate("m1", check, { cwd: "/srv/crew", pid: 1476, sessionId: "abc" }));
    await waitFor(() => expect(check).toHaveBeenCalledWith(getTestFirstmateCommand("/srv/crew", 1476, "abc")));
  });

  it("checks another pane of the same folder again, so a shell in the folder does not pass for the Firstmate", async () => {
    const check: jest.MockedFunction<RunCommand> = jest.fn(async (command) => ({ output: "", exitCode: command === getTestFirstmateCommand("/srv/crew", 1476, undefined) ? 0 : 1 }));
    const real = renderHook(() => useIsFirstmate("m1", check, firstmate));
    const other = renderHook(() => useIsFirstmate("m1", check, { cwd: "/srv/crew", pid: 99 }));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(real.result.current).toBe(true));
    expect(other.result.current).toBe(false);
  });

  it("checks the same folder on another machine again", async () => {
    const check = run(0);
    renderHook(() => useIsFirstmate("m1", check, firstmate));
    renderHook(() => useIsFirstmate("m2", check, firstmate));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
  });

  it("checks a pane again on its next open after it failed, so a lock that came later shows the button", async () => {
    const check: jest.MockedFunction<RunCommand> = jest
      .fn()
      .mockResolvedValueOnce({ output: "", exitCode: 1 })
      .mockResolvedValue({ output: "", exitCode: 0 });
    const first = renderHook(() => useIsFirstmate("m1", check, firstmate));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    expect(first.result.current).toBe(false);
    first.unmount();

    const second = renderHook(() => useIsFirstmate("m1", check, firstmate));

    await waitFor(() => expect(second.result.current).toBe(true));
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed check, so the next open tries again", async () => {
    const check: jest.MockedFunction<RunCommand> = jest
      .fn()
      .mockRejectedValueOnce(new Error("Connection closed"))
      .mockResolvedValue({ output: "", exitCode: 0 });
    const first = renderHook(() => useIsFirstmate("m1", check, firstmate));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    expect(first.result.current).toBe(false);
    first.unmount();

    const second = renderHook(() => useIsFirstmate("m1", check, firstmate));

    await waitFor(() => expect(second.result.current).toBe(true));
  });
});
