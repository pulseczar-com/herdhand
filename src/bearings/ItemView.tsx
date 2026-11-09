import { useTheme } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useToneColor } from "@/components/StatePill";

import { getItem, getRepo, type Row, type TaskRecord } from "./bearings";
import { BadgeChip, LinkChip, LinkedText, RepoLabel } from "./Chips";
import { getLabel, getTypedFields } from "./fields";

type ItemViewProps = {
  row: Row;
  record: TaskRecord | undefined;
  /** The task record could not be fetched, so only the snapshot's fields show. */
  hasFailed: boolean;
  /** The time now in milliseconds, for the relative dates. */
  now: number;
};

/**
 * Everything Bearings knows about an item: its full title, the repo and PR chip, a wrapping row
 * of badges, the long texts under small labels, and the other links as chips.
 */
export function ItemView({ row, record, hasFailed, now }: ItemViewProps) {
  const { colors } = useTheme();
  const muted = useToneColor("neutral");
  const item = getItem(row, record);
  const { badges, texts, links } = getTypedFields(item.fields, now);
  const repo = getRepo(row, record);
  // The row's PR chip, else a PR link of the record.
  const prLink = row.pr && row.url ? { url: row.url, label: row.pr.label, isPr: true } : links.find((link) => link.isPr);
  const otherLinks = links.filter((link) => link !== prLink && link.url !== row.url);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]} selectable>
        {item.title}
      </Text>
      {repo || prLink ? (
        <View style={styles.wrapRow}>
          {repo ? <RepoLabel repo={repo} /> : null}
          {prLink ? <LinkChip link={prLink} /> : null}
        </View>
      ) : null}
      {badges.length > 0 ? (
        <View style={styles.wrapRow}>
          {badges.map((badge, index) => (
            <BadgeChip key={index} badge={badge} />
          ))}
        </View>
      ) : null}
      {row.detail ? <Text style={[styles.detail, { color: muted }]}>{row.detail}</Text> : null}
      {texts.map((text, index) => (
        <View key={index} style={styles.textField}>
          <Text style={[styles.label, { color: muted }]}>{getLabel(text.label).toUpperCase()}</Text>
          <View style={[styles.textBlock, { backgroundColor: colors.card }]}>
            <LinkedText value={text.value} />
          </View>
        </View>
      ))}
      {hasFailed ? <Text style={[styles.detail, { color: muted }]}>Task details unavailable.</Text> : null}
      {otherLinks.length > 0 ? (
        <View style={styles.wrapRow}>
          {otherLinks.map((link) => (
            <LinkChip key={link.url} link={link} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: "700", lineHeight: 24 },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  detail: { fontSize: 13 },
  textField: { gap: 4 },
  label: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
  textBlock: { padding: 12, borderRadius: 10 },
});
