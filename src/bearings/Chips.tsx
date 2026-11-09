import { Feather } from "@expo/vector-icons";
import { useTheme } from "expo-router";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { getPillBackground, useToneColor } from "@/components/StatePill";
import { getAccentColor } from "@/navigationTheme";

import type { Badge, Link } from "./fields";
import { splitUrls } from "./urls";

const CHIP_ICON_SIZE = 12;

/** A chip for a URL, like the PR chip: a pull request has the pull request icon, any other link a link icon. Opens the browser. */
export function LinkChip({ link }: { link: Link }) {
  const theme = useTheme();
  const { colors } = theme;
  return (
    <Pressable
      style={[styles.chip, { backgroundColor: getPillBackground(getAccentColor(theme)) }]}
      accessibilityRole="link"
      accessibilityLabel={link.label}
      onPress={() => void Linking.openURL(link.url)}
    >
      <Feather name={link.isPr ? "git-pull-request" : "link"} size={CHIP_ICON_SIZE} color={colors.primary} />
      <Text numberOfLines={1} style={[styles.chipLabel, { color: colors.primary }]}>
        {link.label}
      </Text>
    </Pressable>
  );
}

/** The muted repo name with the branch icon. */
export function RepoLabel({ repo }: { repo: string }) {
  const color = useToneColor("neutral");
  return (
    <View style={styles.repo}>
      <Feather name="git-branch" size={CHIP_ICON_SIZE} color={color} />
      <Text numberOfLines={1} style={[styles.repoName, { color }]}>
        {repo}
      </Text>
    </View>
  );
}

/** A small rounded badge: the key as a dim prefix, then the value. */
export function BadgeChip({ badge }: { badge: Badge }) {
  const { colors } = useTheme();
  const muted = useToneColor("neutral");
  return (
    <View style={[styles.badge, { backgroundColor: colors.border }]} accessibilityHint={badge.tip || undefined}>
      {badge.prefix ? <Text style={[styles.badgeText, { color: muted }]}>{badge.prefix}</Text> : null}
      <Text style={[styles.badgeText, { color: colors.text }]}>{badge.text}</Text>
    </View>
  );
}

/** A text where each web address is a link that opens in the browser. */
export function LinkedText({ value }: { value: string }) {
  const { colors } = useTheme();
  const segments = splitUrls(value);
  return (
    <Text style={[styles.value, { color: colors.text }]} selectable>
      {segments.map((segment, index) =>
        segment.url ? (
          <Text key={index} style={{ color: colors.primary }} onPress={() => void Linking.openURL(segment.url as string)}>
            {segment.text}
          </Text>
        ) : (
          segment.text
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: 200, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  chipLabel: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  repo: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  repoName: { fontSize: 12, flexShrink: 1 },
  badge: { flexDirection: "row", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 12 },
  value: { fontSize: 14, lineHeight: 20 },
});
