import { Stack, useLocalSearchParams, useTheme } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { StatePill, useToneColor } from "@/components/StatePill";

import { type ActionId, getActionBody, getActions } from "./actions";
import { makeRequestId, getNoteBody } from "./ask";
import { getRepo, type Row, type Section, type SectionId } from "./bearings";
import { DiscussSheet } from "./DiscussSheet";
import { ItemActions } from "./ItemActions";
import { getFirstmateName } from "./firstmateName";
import { ItemView } from "./ItemView";
import { NotReady } from "./NotReady";
import { useBearingsContext } from "./BearingsProvider";
import { useTaskRecord } from "./useTaskRecord";

type Notice = { text: string; tone: "success" | "danger" };

/**
 * One item of Bearings, as a screen of its own: all of its data, and its actions at the bottom.
 * Discuss and the actions save a note in the Firstmate's inbox.
 */
export function ItemScreen() {
  const { section: sectionId, itemId } = useLocalSearchParams<{ section: SectionId; itemId: string }>();
  const bearings = useBearingsContext();
  const section = bearings?.sections?.find((candidate) => candidate.id === sectionId);
  const row = section?.rows.find((candidate) => candidate.itemId === itemId);
  if (!bearings) return <NotReady />;

  return <ItemContent section={section} row={row} sectionId={sectionId} itemId={itemId} bearings={bearings} />;
}

type ItemContentProps = {
  section: Section | undefined;
  row: Row | undefined;
  sectionId: SectionId;
  itemId: string;
  bearings: NonNullable<ReturnType<typeof useBearingsContext>>;
};

function ItemContent({ section, row, sectionId, itemId, bearings }: ItemContentProps) {
  const { colors } = useTheme();
  const { space, sendNote } = bearings;
  const firstmateName = getFirstmateName(space.name);
  const { record, hasFailed } = useTaskRecord(bearings, sectionId, row);
  // Fixed for the visit: a relative date counts whole days.
  const [now] = useState(Date.now);
  const [isDiscussing, setIsDiscussing] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  if (!section || !row) {
    return <Text style={[styles.message, { color: colors.text }]}>This item is no longer in Bearings.</Text>;
  }

  function openDiscuss() {
    setRequestId(makeRequestId());
    setNotice(null);
    setIsDiscussing(true);
  }

  async function sendDiscuss(text: string) {
    const failure = await sendNote(requestId, getNoteBody(sectionId, itemId, text));
    if (failure) return `Could not send: ${failure}`;
    setIsDiscussing(false);
    setNotice({ text: `Note sent to ${firstmateName}.`, tone: "success" });
    return null;
  }

  async function runAction(action: ActionId) {
    setIsSending(true);
    setNotice(null);
    const failure = await sendNote(makeRequestId(), getActionBody(action, sectionId, itemId));
    setIsSending(false);
    setNotice(failure ? { text: `Could not send to ${firstmateName}: ${failure}`, tone: "danger" } : { text: `Sent to ${firstmateName}.`, tone: "success" });
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerTitle: () => <ItemTitle section={section} row={row} repo={getRepo(row, record)} />,
          headerRight: () => (row.status ? <StatePill badge={{ label: row.status.text, tone: row.status.tone }} /> : null),
        }}
      />
      <View style={styles.body}>
        <ItemView row={row} record={record} hasFailed={hasFailed} now={now} />
      </View>
      {notice ? <NoticeLine notice={notice} /> : null}
      <ItemActions
        actions={getActions(sectionId, row)}
        itemTitle={row.title}
        firstmateName={firstmateName}
        isDisabled={isSending}
        onDiscuss={openDiscuss}
        onAction={(action) => void runAction(action)}
      />
      <DiscussSheet visible={isDiscussing} firstmateName={firstmateName} onSend={sendDiscuss} onClose={() => setIsDiscussing(false)} />
    </View>
  );
}

/** The item's short title, and "<section> · <repo>" under it. */
function ItemTitle({ section, row, repo }: { section: Section; row: Row; repo: string }) {
  const { colors } = useTheme();
  const muted = useToneColor("neutral");
  const place = repo ? `${section.title} · ${repo}` : section.title;
  return (
    <View style={styles.title}>
      <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
        {row.title}
      </Text>
      <Text numberOfLines={1} style={[styles.place, { color: muted }]}>
        {place}
      </Text>
    </View>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  const color = useToneColor(notice.tone);
  return (
    <Text style={[styles.notice, { color }]} accessibilityLiveRegion="polite">
      {notice.text}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1 },
  message: { fontSize: 15, padding: 16 },
  title: { flexShrink: 1 },
  name: { fontSize: 16, fontWeight: "600" },
  place: { fontSize: 12 },
  notice: { fontSize: 13, paddingHorizontal: 16, paddingVertical: 6 },
});
