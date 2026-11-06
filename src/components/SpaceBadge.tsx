import { StyleSheet, Text, View } from "react-native";

import type { Space } from "@/herdr/backend";
import { getSpaceColor, getSpaceLetter } from "@/herdr/badges";

const BADGE_SIZE = 28;
const BADGE_TEXT_COLOR = "#ffffff";

/** The space's letter on its color, as on the desktop sidebar. */
export function SpaceBadge({ space }: { space: Space }) {
  return (
    <View style={[styles.badge, { backgroundColor: getSpaceColor(space.id) }]}>
      <Text style={styles.letter}>{getSpaceLetter(space.name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { width: BADGE_SIZE, height: BADGE_SIZE, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  letter: { color: BADGE_TEXT_COLOR, fontSize: 14, fontWeight: "600" },
});
