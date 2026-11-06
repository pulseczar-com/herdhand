import { Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { LockScreen } from "@/lock/LockScreen";
import { useAppLock } from "@/lock/useAppLock";
import { ForegroundContext, useIsForeground } from "@/lock/useIsForeground";
import { MachinesProvider } from "@/machines/MachineConnection";
import { DARK_THEME, LIGHT_THEME } from "@/navigationTheme";

/**
 * The app's root: a native stack in the system's light or dark theme, behind the app lock. The
 * page of machines and its tabs sit at the bottom of the stack; a pane, Settings and "Add a
 * machine" open on top. The gesture root lets lists drag.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();
  const lock = useAppLock();
  const isForeground = useIsForeground(lock.state);
  // The lock only covers the app, so screen readers must also skip what is under it.
  const appAccessibility = lock.state === "unlocked" ? "auto" : "no-hide-descendants";

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={colorScheme === "dark" ? DARK_THEME : LIGHT_THEME}>
        <StatusBar style="auto" />
        <View style={styles.root} importantForAccessibility={appAccessibility}>
          <ForegroundContext.Provider value={isForeground}>
            <MachinesProvider>
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="machine/new" options={{ title: "Add a machine" }} />
                <Stack.Screen name="machine/[id]/pane/[paneId]" options={{ title: "" }} />
                <Stack.Screen name="settings" options={{ title: "Settings" }} />
              </Stack>
            </MachinesProvider>
          </ForegroundContext.Provider>
        </View>
        {lock.state === "unlocked" ? null : <LockScreen state={lock.state} onUnlock={lock.unlock} />}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
