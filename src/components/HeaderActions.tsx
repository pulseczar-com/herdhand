import { MaterialIcons } from "@expo/vector-icons";
import { Link, useTheme } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const ICON_SIZE = 24;
const HIT_SLOP = 12;

/** The page's header actions: a page's own action first, then Add a machine and the gear that opens Settings. */
export function HeaderActions({ children }: { children?: ReactNode }) {
  const { colors } = useTheme();

  return (
    <View style={styles.headerActions}>
      {children}
      <Link href="/machine/new" asChild>
        <Pressable accessibilityRole="button" accessibilityLabel="Add a machine" hitSlop={HIT_SLOP}>
          <MaterialIcons name="add" size={ICON_SIZE} color={colors.text} />
        </Pressable>
      </Link>
      <Link href="/settings" asChild>
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={HIT_SLOP}>
          <MaterialIcons name="settings" size={ICON_SIZE} color={colors.text} />
        </Pressable>
      </Link>
    </View>
  );
}

/** Reorder shows the drag handles of the machines and spaces; Done hides them again. */
export function ReorderButton({ isReordering, onPress }: { isReordering: boolean; onPress: () => void }) {
  const { colors } = useTheme();

  if (isReordering) {
    return (
      <Pressable accessibilityRole="button" hitSlop={HIT_SLOP} onPress={onPress}>
        <Text style={[styles.done, { color: colors.primary }]}>Done</Text>
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Reorder" hitSlop={HIT_SLOP} onPress={onPress}>
      <MaterialIcons name="swap-vert" size={ICON_SIZE} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", alignItems: "center", gap: 24 },
  done: { fontSize: 16, fontWeight: "600" },
});
