import { Feather } from "@expo/vector-icons";
import { useTheme } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import type { BadgeTone } from "@/herdr/badges";
import { getPillBackground, StatePill, useToneColor } from "@/components/StatePill";

import { getAgeText } from "./age";
import { getRepo, type Row, type Section, withoutEmptySections } from "./bearings";
import { LinkChip, RepoLabel } from "./Chips";
import { getFirstmateName } from "./firstmateName";
import { useBearingsContext } from "./BearingsProvider";
import { useClock } from "./useClock";

const BAR_WIDTH = 3;

/**
 * The Firstmate's bearings as a list: the away line and the error line, then each section with
 * rows as cards. A pull down refreshes. A tap on a section's title folds it; a tap on a card
 * opens the item.
 */
export function BearingsView({ onOpen }: { onOpen: (section: Section, row: Row) => void }) {
  const bearings = useBearingsContext();
  const [folded, setFolded] = useState(new Set<string>());
  if (!bearings) return null;

  const { sections, updatedAt, error, isAway, isRefreshing, refresh, space } = bearings;
  const shown = sections === null ? null : withoutEmptySections(sections);

  function toggle(sectionId: string) {
    setFolded((last) => {
      const next = new Set(last);
      if (!next.delete(sectionId)) next.add(sectionId);
      return next;
    });
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />}
    >
      {isAway ? <AwayLine name={space.name} updatedAt={updatedAt} /> : null}
      {error ? <ErrorLine text={error} updatedAt={updatedAt} /> : null}
      {shown === null && !error && !isAway ? <ActivityIndicator accessibilityLabel="Loading" style={styles.message} /> : null}
      {shown?.length === 0 ? <Message text="Nothing to show yet." /> : null}
      {shown?.map((section) => (
        <SectionBlock key={section.id} section={section} isFolded={folded.has(section.id)} onToggle={toggle} onOpen={onOpen} />
      ))}
    </ScrollView>
  );
}

type SectionBlockProps = {
  section: Section;
  isFolded: boolean;
  onToggle: (sectionId: string) => void;
  onOpen: (section: Section, row: Row) => void;
};

/** A section's title with its count, and its cards unless folded. */
function SectionBlock({ section, isFolded, onToggle, onOpen }: SectionBlockProps) {
  const color = useToneColor(section.tone);
  return (
    <View style={styles.section}>
      <Pressable
        style={styles.sectionHeader}
        accessibilityRole="button"
        accessibilityState={{ expanded: !isFolded }}
        accessibilityLabel={`${section.title}, ${section.count}`}
        onPress={() => onToggle(section.id)}
      >
        <Feather name={isFolded ? "chevron-right" : "chevron-down"} size={16} color={color} />
        <Text style={[styles.sectionTitle, { color }]}>{section.title}</Text>
        <View style={[styles.count, { backgroundColor: getPillBackground(color) }]}>
          <Text style={[styles.countText, { color }]}>{section.count}</Text>
        </View>
      </Pressable>
      {isFolded ? null : section.rows.map((row, index) => <Card key={`${row.itemId}-${index}`} tone={section.tone} row={row} onPress={() => onOpen(section, row)} />)}
    </View>
  );
}

type CardProps = { tone: BadgeTone; row: Row; onPress: () => void };

/** A card: a bar in the section's tone, the title and status pill, then the repo and the PR chip. */
function Card({ tone, row, onPress }: CardProps) {
  const { colors } = useTheme();
  const barColor = useToneColor(tone);
  const dangerColor = useToneColor("danger");
  const muted = useToneColor("neutral");
  const repo = getRepo(row, undefined);
  const hasSecondLine = Boolean(repo) || row.pr !== undefined;

  return (
    <Pressable
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={row.title}
      android_ripple={{ color: colors.border }}
      onPress={onPress}
    >
      <View style={[styles.bar, { backgroundColor: barColor }]} />
      <View style={styles.cardBody}>
        <View style={styles.titleLine}>
          <Text numberOfLines={1} style={[styles.cardTitle, { color: row.flagged ? dangerColor : colors.text }]}>
            {row.title}
          </Text>
          {row.status ? <StatePill badge={{ label: row.status.text, tone: row.status.tone }} /> : null}
        </View>
        {hasSecondLine ? (
          <View style={styles.secondLine}>
            {repo ? <RepoLabel repo={repo} /> : null}
            {row.pr && row.url ? <LinkChip link={{ url: row.url, label: row.pr.label, isPr: true }} /> : null}
          </View>
        ) : null}
      </View>
      <Feather name="chevron-right" size={18} color={muted} />
    </Pressable>
  );
}

/** "12s ago", or null before the first data. */
function useDataAge(updatedAt: number | null): string | null {
  const now = useClock();
  return updatedAt === null ? null : getAgeText(updatedAt, now);
}

/** A calm card while the Firstmate is in away mode. The data from before stays under it. */
function AwayLine({ name, updatedAt }: { name: string; updatedAt: number | null }) {
  const { colors } = useTheme();
  const muted = useToneColor("neutral");
  const age = useDataAge(updatedAt);
  return (
    <View style={[styles.away, { backgroundColor: colors.card }]}>
      <Text style={[styles.awayTitle, { color: colors.text }]}>{`${getFirstmateName(name)} is in away mode. Bearings shows again after it returns.`}</Text>
      {age ? <Text style={[styles.awayDetail, { color: muted }]}>{`Showing data from ${age}.`}</Text> : null}
    </View>
  );
}

function ErrorLine({ text, updatedAt }: { text: string; updatedAt: number | null }) {
  const color = useToneColor("danger");
  const age = useDataAge(updatedAt);
  return (
    <Text style={[styles.error, { color }]} accessibilityLiveRegion="polite">
      {age ? `${text} (showing data from ${age})` : text}
    </Text>
  );
}

function Message({ text }: { text: string }) {
  const muted = useToneColor("neutral");
  return <Text style={[styles.message, { color: muted }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  content: { paddingVertical: 8, paddingBottom: 24 },
  message: { fontSize: 14, padding: 16 },
  error: { fontSize: 13, paddingHorizontal: 16, paddingVertical: 8 },
  away: { marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: 10, gap: 4 },
  awayTitle: { fontSize: 14, fontWeight: "600" },
  awayDetail: { fontSize: 12 },
  section: { marginTop: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  count: { paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999 },
  countText: { fontSize: 12, fontWeight: "700" },
  card: { flexDirection: "row", alignItems: "center", marginHorizontal: 12, marginBottom: 8, paddingRight: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  bar: { alignSelf: "stretch", width: BAR_WIDTH },
  cardBody: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, gap: 6 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "500" },
  secondLine: { flexDirection: "row", alignItems: "center", gap: 8 },
});
