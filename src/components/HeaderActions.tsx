import { MaterialIcons } from "@expo/vector-icons";
import { Link, useTheme } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

const ICON_SIZE = 24;
const HIT_SLOP = 12;

/** The page's header actions: Add a machine, and the gear that opens Settings. */
export function HeaderActions() {
  const { colors } = useTheme();

  return (
    <View style={styles.headerActions}>
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

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", alignItems: "center", gap: 24 },
});
