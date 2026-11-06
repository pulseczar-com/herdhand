import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { AppState, type AppStateStatus } from "react-native";

import { getAppLockEnabled } from "@/settings/store";

import { isRelockDue, RELOCK_AFTER_MS } from "./appLock";
import { useAppLock } from "./useAppLock";

jest.mock("expo-local-authentication", () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));

jest.mock("@/settings/store", () => ({ getAppLockEnabled: jest.fn() }));

const enrolledLevel = jest.mocked(LocalAuthentication.getEnrolledLevelAsync);
const authenticateAsync = jest.mocked(LocalAuthentication.authenticateAsync);
const lockEnabled = jest.mocked(getAppLockEnabled);

function mockAppState() {
  let listener: (state: AppStateStatus) => void = () => {};
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, handler) => {
    listener = handler;
    return { remove: jest.fn() };
  });
  return (state: AppStateStatus) => act(() => listener(state));
}

describe("isRelockDue", () => {
  it.each([
    { name: "never in the background", backgroundedAt: null, now: 0, expected: false },
    { name: "one moment short", backgroundedAt: 0, now: RELOCK_AFTER_MS - 1, expected: false },
    { name: "exactly at the limit", backgroundedAt: 0, now: RELOCK_AFTER_MS, expected: true },
    { name: "long after", backgroundedAt: 0, now: RELOCK_AFTER_MS * 10, expected: true },
  ])("is $expected when $name", ({ backgroundedAt, now, expected }) => {
    expect(isRelockDue(backgroundedAt, now)).toBe(expected);
  });
});

describe("useAppLock", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lockEnabled.mockResolvedValue(true);
    enrolledLevel.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG);
    authenticateAsync.mockResolvedValue({ success: true });
  });

  afterEach(() => jest.restoreAllMocks());

  it("asks to unlock on open and unlocks on success", async () => {
    const { result } = renderHook(() => useAppLock());

    await waitFor(() => expect(result.current.state).toBe("unlocked"));
    expect(authenticateAsync).toHaveBeenCalledTimes(1);
  });

  it("stays locked when the person cancels", async () => {
    authenticateAsync.mockResolvedValue({ success: false, error: "user_cancel" });

    const { result } = renderHook(() => useAppLock());

    await waitFor(() => expect(result.current.state).toBe("locked"));
  });

  it("opens with no prompt when the lock is off", async () => {
    lockEnabled.mockResolvedValue(false);

    const { result } = renderHook(() => useAppLock());

    await waitFor(() => expect(result.current.state).toBe("unlocked"));
    expect(authenticateAsync).not.toHaveBeenCalled();
  });

  it("opens with no prompt when the phone has no screen lock", async () => {
    enrolledLevel.mockResolvedValue(LocalAuthentication.SecurityLevel.NONE);

    const { result } = renderHook(() => useAppLock());

    await waitFor(() => expect(result.current.state).toBe("unlocked"));
    expect(authenticateAsync).not.toHaveBeenCalled();
  });

  it("locks again only after five minutes in the background", async () => {
    const changeAppState = mockAppState();
    const now = jest.spyOn(Date, "now").mockReturnValue(0);
    const { result } = renderHook(() => useAppLock());
    await waitFor(() => expect(result.current.state).toBe("unlocked"));

    changeAppState("background");
    now.mockReturnValue(RELOCK_AFTER_MS - 1);
    changeAppState("active");
    expect(authenticateAsync).toHaveBeenCalledTimes(1);

    changeAppState("background");
    now.mockReturnValue(RELOCK_AFTER_MS * 2);
    changeAppState("active");
    await waitFor(() => expect(authenticateAsync).toHaveBeenCalledTimes(2));
  });

  it("covers the app at once when a relock is due, before the lock check ends", async () => {
    const changeAppState = mockAppState();
    const now = jest.spyOn(Date, "now").mockReturnValue(0);
    const { result } = renderHook(() => useAppLock());
    await waitFor(() => expect(result.current.state).toBe("unlocked"));
    let finishCheck: (enabled: boolean) => void = () => {};
    lockEnabled.mockReturnValue(new Promise((resolve) => (finishCheck = resolve)));

    changeAppState("background");
    now.mockReturnValue(RELOCK_AFTER_MS);
    changeAppState("active");

    expect(result.current.state).toBe("checking");
    finishCheck(true);
    await waitFor(() => expect(result.current.state).toBe("unlocked"));
    expect(authenticateAsync).toHaveBeenCalledTimes(2);
  });
});
