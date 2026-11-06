import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import type { LockState } from "./useAppLock";
import { useIsForeground } from "./useIsForeground";

function mockAppState() {
  let listener: (state: AppStateStatus) => void = () => {};
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, handler) => {
    listener = handler;
    return { remove: jest.fn() };
  });
  return (state: AppStateStatus) => act(() => listener(state));
}

describe("useIsForeground", () => {
  afterEach(() => jest.restoreAllMocks());

  it("is false in the background and true again once the app is back and unlocked", () => {
    const changeAppState = mockAppState();
    const { result, rerender } = renderHook(({ lock }: { lock: LockState }) => useIsForeground(lock), {
      initialProps: { lock: "unlocked" },
    });
    expect(result.current).toBe(true);

    changeAppState("background");
    expect(result.current).toBe(false);

    changeAppState("active");
    rerender({ lock: "locked" });
    expect(result.current).toBe(false);

    rerender({ lock: "unlocked" });
    expect(result.current).toBe(true);
  });
});
