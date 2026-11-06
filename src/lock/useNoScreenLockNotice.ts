import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { getLockStatus } from "./appLock";

/** True when the app lock is on but the phone has no screen lock, so the app cannot lock. */
export function useNoScreenLockNotice(): boolean {
  const [shouldShowNotice, setShouldShowNotice] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isFocused = true;
      void getLockStatus().then(({ enabled, hasScreenLock }) => {
        if (isFocused) setShouldShowNotice(enabled && !hasScreenLock);
      });
      return () => {
        isFocused = false;
      };
    }, []),
  );

  return shouldShowNotice;
}
