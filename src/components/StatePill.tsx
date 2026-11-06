import { useTheme } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import type { BadgeTone, PaneBadge } from "@/herdr/badges";

// The mockups' state colors on a dark background, and darker ones that read on a light one.
const TONE_COLORS: Record<"light" | "dark", Record<BadgeTone, string>> = {
  dark: { attention: "#f0b45a", active: "#8fb0ec", success: "#6cc28c", danger: "#f2867f", neutral: "#8b919c" },
  light: { attention: "#8a5300", active: "#2f5fb3", success: "#2e7d4f", danger: "#b3261e", neutral: "#5f6368" },
};

// Hex alpha of a pill's background: the tone at about 16%.
const PILL_BACKGROUND_ALPHA = "29";

/** A pill's background: the tone's color, mostly see-through. */
export function getPillBackground(color: string): string {
  return color + PILL_BACKGROUND_ALPHA;
}

/** The color of a tone in the current light or dark theme. */
export function useToneColor(tone: BadgeTone): string {
  const { dark } = useTheme();
  return TONE_COLORS[dark ? "dark" : "light"][tone];
}

/** A pane's state as a small colored pill: "Needs you", "Working", "Shell". */
export function StatePill({ badge }: { badge: PaneBadge }) {
  const color = useToneColor(badge.tone);

  return (
    <View style={[styles.pill, { backgroundColor: getPillBackground(color) }]}>
      <Text style={[styles.label, { color }]}>{badge.label}</Text>
    </View>
  );
}

/** A small dot in a tone's color. */
export function StateDot({ tone }: { tone: BadgeTone }) {
  const color = useToneColor(tone);
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  label: { fontSize: 12, fontWeight: "600" },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
