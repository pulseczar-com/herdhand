import { useTheme } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { SpaceBadge } from "@/components/SpaceBadge";
import { useToneColor } from "@/components/StatePill";

import { getAgeText } from "./age";
import { useBearingsContext } from "./BearingsProvider";
import { useClock } from "./useClock";

/** The header of Bearings: the space's badge, "<space> · Bearings", and how old the data is. */
export function BearingsTitle() {
  const { colors } = useTheme();
  const muted = useToneColor("neutral");
  const bearings = useBearingsContext();
  const now = useClock();
  if (!bearings) return null;

  const { space, updatedAt, isAway } = bearings;
  const age =
    updatedAt !== null ? `Updated ${getAgeText(updatedAt, now)} · pull to refresh` : isAway ? "Away · pull to refresh" : "Loading…";

  return (
    <View style={styles.title}>
      <SpaceBadge space={space} />
      <View style={styles.text}>
        <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
          {`${space.name} · Bearings`}
        </Text>
        <Text numberOfLines={1} style={[styles.age, { color: muted }]}>
          {age}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  text: { flexShrink: 1 },
  name: { fontSize: 16, fontWeight: "600" },
  age: { fontSize: 12 },
});
