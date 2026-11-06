import AsyncStorage from "@react-native-async-storage/async-storage";

const APP_LOCK_KEY = "settings.appLock";

/** Whether the app asks for a fingerprint, face or screen lock on open. On by default. */
export async function getAppLockEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(APP_LOCK_KEY)) !== "off";
}

export function saveAppLockEnabled(enabled: boolean): Promise<void> {
  return AsyncStorage.setItem(APP_LOCK_KEY, enabled ? "on" : "off");
}

const NOTIFICATION_ASKED_KEY = "settings.notificationPermissionAsked";

/** Whether the app has asked for the notification permission. It asks once, whatever the answer. */
export async function getNotificationPermissionAsked(): Promise<boolean> {
  return (await AsyncStorage.getItem(NOTIFICATION_ASKED_KEY)) === "yes";
}

export function saveNotificationPermissionAsked(): Promise<void> {
  return AsyncStorage.setItem(NOTIFICATION_ASKED_KEY, "yes");
}
