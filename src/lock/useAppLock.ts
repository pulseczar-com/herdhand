import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { authenticate, getLockStatus, isRelockDue } from "./appLock";

export type LockState = "checking" | "locked" | "unlocked";

/**
 * Locks the app on open and after RELOCK_AFTER_MS in the background, while the app lock is on
 * and the phone has a screen lock. Asks to unlock at once each time it locks.
 */
export function useAppLock(): { state: LockState; unlock: () => Promise<void> } {
  const [state, setState] = useState<LockState>("checking");
  const backgroundedAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    if (await authenticate()) setState("unlocked");
  }, []);

  const lockIfNeeded = useCallback(
    () =>
      getLockStatus().then(async ({ enabled, hasScreenLock }) => {
        if (!enabled || !hasScreenLock) {
          setState("unlocked");
          return;
        }
        setState("locked");
        await unlock();
      }),
    [unlock],
  );

  useEffect(() => {
    void lockIfNeeded();
  }, [lockIfNeeded]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (appState) => {
      if (appState === "background") {
        backgroundedAt.current = Date.now();
        return;
      }
      if (appState !== "active") return;
      const isDue = isRelockDue(backgroundedAt.current, Date.now());
      backgroundedAt.current = null;
      if (!isDue) return;
      setState("checking");
      void lockIfNeeded();
    });
    return () => subscription.remove();
  }, [lockIfNeeded]);

  return { state, unlock };
}
