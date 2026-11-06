import { createContext, useEffect, useState } from "react";
import { AppState } from "react-native";

import type { LockState } from "./useAppLock";

/** Whether the app is on screen and unlocked, given by the root layout. */
export const ForegroundContext = createContext(true);

/** True while the app is on screen and the app lock is open, so the person can see it. */
export function useIsForeground(lock: LockState): boolean {
  const [isOnScreen, setIsOnScreen] = useState(AppState.currentState !== "background");

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (appState) => setIsOnScreen(appState !== "background"));
    return () => subscription.remove();
  }, []);

  return isOnScreen && lock === "unlocked";
}
