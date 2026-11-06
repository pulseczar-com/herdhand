import * as LocalAuthentication from "expo-local-authentication";

import { getAppLockEnabled } from "@/settings/store";

/** How long the app may sit in the background before it locks again. */
export const RELOCK_AFTER_MS = 5 * 60 * 1000;

/** Whether the app has been in the background long enough to lock again. */
export function isRelockDue(backgroundedAt: number | null, now: number): boolean {
  if (backgroundedAt === null) return false;
  return now - backgroundedAt >= RELOCK_AFTER_MS;
}

type LockStatus = { enabled: boolean; hasScreenLock: boolean };

/** The app lock setting, and whether the phone has a screen lock (PIN, pattern, password or biometric). */
export async function getLockStatus(): Promise<LockStatus> {
  const [enabled, level] = await Promise.all([getAppLockEnabled(), LocalAuthentication.getEnrolledLevelAsync()]);
  return { enabled, hasScreenLock: level !== LocalAuthentication.SecurityLevel.NONE };
}

/** Asks for a biometric, with the screen lock PIN, pattern or password as the fallback. */
export async function authenticate(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock Herdhand" });
  return result.success;
}
