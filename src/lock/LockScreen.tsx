import { useTheme } from "expo-router";
import { Button, StyleSheet, Text, View } from "react-native";

import type { LockState } from "./useAppLock";

/** Covers the app while it is locked, or while the lock setting is still being read. */
export function LockScreen({ state, onUnlock }: { state: LockState; onUnlock: () => void }) {
  const { colors } = useTheme();

  return (
    <View style={[StyleSheet.absoluteFill, styles.screen, { backgroundColor: colors.background }]}>
      {state === "locked" ? (
        <>
          <Text style={[styles.title, { color: colors.text }]}>Herdhand is locked</Text>
          <Button title="Unlock" onPress={onUnlock} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: "center", justifyContent: "center", gap: 16 },
  title: { fontSize: 18 },
});
