import { useTheme } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AGENT_STATE_LABELS, type BlockedKind, type Pane } from "@/herdr/backend";
import { STATE_TONES } from "@/herdr/badges";

import { getPillBackground, useToneColor } from "./StatePill";

const BLOCKED_KIND_LABELS: Record<BlockedKind, string> = {
  permission: "Permission",
  question: "Question",
  auth: "Sign-in",
};

/** "Needs you", what the agent waits for, and its own message, while the agent is blocked. */
export function NeedsYouBanner({ pane }: { pane: Pane | null }) {
  const color = useToneColor(STATE_TONES.blocked);
  const { colors } = useTheme();
  if (pane?.state !== "blocked") return null;

  return (
    <View style={[styles.banner, { borderColor: color, backgroundColor: getPillBackground(color) }]}>
      <Text style={[styles.title, { color }]}>{getTitle(pane.blockedKind)}</Text>
      {pane.message ? <Text style={[styles.message, { color: colors.text }]}>{pane.message}</Text> : null}
    </View>
  );
}

/** The blocked state's label, and what the agent waits for when it said. */
function getTitle(blockedKind: BlockedKind | undefined): string {
  const title = AGENT_STATE_LABELS.blocked;
  if (!blockedKind) return title;
  return `${title} · ${BLOCKED_KIND_LABELS[blockedKind]}`;
}

const styles = StyleSheet.create({
  banner: { marginHorizontal: 10, marginBottom: 8, borderWidth: 1, borderRadius: 12, padding: 12, gap: 2 },
  title: { fontSize: 15, fontWeight: "700" },
  message: { fontSize: 16, lineHeight: 24 },
});
