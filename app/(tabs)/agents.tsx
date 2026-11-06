import { useTheme } from "expo-router";
import { useContext } from "react";
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from "react-native";

import { SpaceBadge } from "@/components/SpaceBadge";
import { useToneColor } from "@/components/StatePill";
import { type AgentGroup, getAgentGroups, type LocatedPane } from "@/herdr/agentPanes";
import { AGENT_STATE_LABELS } from "@/herdr/backend";
import { describePlace, getAgentName, STATE_TONES } from "@/herdr/badges";
import { MachineConnectionContext } from "@/machines/MachineConnection";
import { openPane } from "@/machines/openPane";
import type { ConnectionStatus } from "@/machines/useMachineConnection";

/** The Agents tab: every agent on the open machine, grouped by state, Needs you first. */
export default function AgentsScreen() {
  const connection = useContext(MachineConnectionContext);
  if (!connection) return <NotConnected />;
  const { id, status, list } = connection;
  const sections = getAgentGroups(list.spaces ?? []).map((group) => ({ group, data: group.agentPanes }));

  return (
    <SectionList
      sections={sections}
      keyExtractor={({ pane }) => pane.id}
      refreshing={list.refreshing}
      onRefresh={() => void list.refresh()}
      ListEmptyComponent={<EmptyAgents phase={status.phase} isLoaded={list.spaces !== null} error={list.error} />}
      renderSectionHeader={({ section }) => <GroupHeader group={section.group} />}
      renderItem={({ item }) => <AgentRow agentPane={item} onPress={() => openPane(id, item.pane)} />}
      stickySectionHeadersEnabled={false}
    />
  );
}

type EmptyAgentsProps = { phase: ConnectionStatus["phase"]; isLoaded: boolean; error: string | null };

/** A spinner while the connection or the first load is on its way; the empty text only after a load. */
function EmptyAgents({ phase, isLoaded, error }: EmptyAgentsProps) {
  const { colors } = useTheme();
  if (error) return <Text style={[styles.empty, { color: colors.text }]}>{error}</Text>;
  if (isLoaded) return <Text style={[styles.empty, { color: colors.text }]}>No agents are running.</Text>;
  if (phase === "connecting" || phase === "connected") return <ActivityIndicator style={styles.empty} />;
  return <NotConnected />;
}

function NotConnected() {
  const { colors } = useTheme();
  return <Text style={[styles.empty, { color: colors.text }]}>Not connected.</Text>;
}

/** A state's name in its color, and how many agents are in it. */
function GroupHeader({ group }: { group: AgentGroup }) {
  const { colors } = useTheme();
  const color = useToneColor(STATE_TONES[group.state]);

  return (
    <View style={styles.groupHeader}>
      <Text style={[styles.groupTitle, { color }]}>{AGENT_STATE_LABELS[group.state]}</Text>
      <Text style={[styles.groupCount, { color: colors.text }]}>{group.agentPanes.length}</Text>
    </View>
  );
}

/** "api · claude", and where it is below: "agents · Fix the build". */
function AgentRow({ agentPane, onPress }: { agentPane: LocatedPane; onPress: () => void }) {
  const { colors } = useTheme();
  const { pane, space, tab } = agentPane;
  const title = `${space.name} · ${getAgentName(pane)}`;

  return (
    <Pressable style={styles.row} accessibilityRole="button" onPress={onPress} android_ripple={{ color: colors.border }}>
      <SpaceBadge space={space} />
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        <Text numberOfLines={2} style={[styles.rowDetail, { color: colors.text }]}>
          {describePlace(tab, pane)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  empty: { padding: 16, fontSize: 15, opacity: 0.8 },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  groupTitle: { fontSize: 13, fontWeight: "600" },
  groupCount: { fontSize: 13, opacity: 0.6 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 48 },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontWeight: "500" },
  rowDetail: { fontSize: 13, opacity: 0.7 },
});
