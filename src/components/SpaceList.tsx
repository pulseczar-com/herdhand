import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "expo-router";
import { type ReactElement, useCallback, useState } from "react";
import { ActivityIndicator, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import ReorderableList, { useReorderableDrag } from "react-native-reorderable-list";
import { scheduleOnRN } from "react-native-worklets";

import { getBlockedPanes, getMostUrgentState, type LocatedPane } from "@/herdr/agentPanes";
import type { Pane, Space, Tab } from "@/herdr/backend";
import { describePane, describePlace, getAgentName, getPaneBadge, STATE_TONES } from "@/herdr/badges";
import type { HerdrKind } from "@/herdr/kinds";
import { useCollapsedSpaces } from "@/machines/useCollapsedSpaces";
import type { SpacesState } from "@/machines/useSpaces";
import type { SpaceOrderState } from "@/spaceOrder/useSpaceOrder";

import { LONG_PRESS_MS, useDragPan } from "./dragPan";
import { SpaceBadge } from "./SpaceBadge";
import { StateDot, StatePill, useToneColor } from "./StatePill";

const ROW_PADDING = 16;
const ROW_INSET = 56;
// Inside the line that groups the panes of a split tab, which sits at ROW_INSET.
const GROUPED_PANE_INSET = 16;
const CHEVRON_SIZE = 20;
const CARD_ICON_SIZE = 18;
// Hex alpha of the Needs you card's background: the attention color at about 12%.
const CARD_BACKGROUND_ALPHA = "1f";

type SpaceListProps = {
  machineId: string;
  kind: HerdrKind;
  list: SpacesState;
  spaceOrder: SpaceOrderState;
  /** Above the spaces, below the Needs you cards: the machine headers down to this machine's. */
  header: ReactElement;
  /** Below the spaces: the headers of the machines after this one. */
  footer: ReactElement;
  onOpenPane: (pane: Pane) => void;
};

/**
 * The machine's spaces, below its header and a card for each blocked agent. Pull to refresh; tap
 * a pane to open it, a space to collapse or expand it; hold a space to drag it to a new place.
 */
export function SpaceList({ machineId, kind, list, spaceOrder, header, footer, onOpenPane }: SpaceListProps) {
  const { colors } = useTheme();
  const { spaces, error, refreshing, refresh } = list;
  const { collapsedIds, toggle } = useCollapsedSpaces(machineId, kind, spaces);
  const dragPan = useDragPan();
  const [isRefreshEnabled, setIsRefreshEnabled] = useState(true);

  // On Android the pull-to-refresh spinner would follow a space dragged down from the top. A
  // refresh that is already running stays on screen.
  const isAndroid = Platform.OS === "android";
  const disableRefresh = useCallback(() => {
    "worklet";
    if (isAndroid && !refreshing) scheduleOnRN(setIsRefreshEnabled, false);
  }, [isAndroid, refreshing]);
  const enableRefresh = useCallback(() => {
    "worklet";
    scheduleOnRN(setIsRefreshEnabled, true);
  }, []);

  return (
    <ReorderableList
      style={styles.list}
      panGesture={dragPan}
      onDragStart={disableRefresh}
      onDragEnd={enableRefresh}
      data={spaceOrder.spaces}
      keyExtractor={(space) => space.id}
      onReorder={({ from, to }) => spaceOrder.moveSpace(from, to)}
      refreshControl={<RefreshControl enabled={isRefreshEnabled} refreshing={refreshing} onRefresh={() => void refresh()} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <NeedsYouCards spaces={spaces ?? []} onOpenPane={onOpenPane} />
          {header}
          {error ? <Text style={[styles.error, { color: colors.notification }]}>{error}</Text> : null}
        </View>
      }
      ListFooterComponent={footer}
      ListEmptyComponent={<EmptyList isLoaded={spaces !== null} hasError={error !== null} />}
      renderItem={({ item }) => (
        <SpaceItem space={item} isExpanded={!collapsedIds.includes(item.id)} onToggle={() => toggle(item.id)} onOpenPane={onOpenPane} />
      )}
    />
  );
}

/** A spinner until the first load ends; nothing more when it failed, as the error shows. */
function EmptyList({ isLoaded, hasError }: { isLoaded: boolean; hasError: boolean }) {
  const { colors } = useTheme();
  if (isLoaded) return <Text style={[styles.empty, { color: colors.text }]}>No spaces.</Text>;
  if (hasError) return null;
  return <ActivityIndicator style={styles.empty} />;
}

/** A card for each blocked agent, shown first so it can be answered at once. */
export function NeedsYouCards({ spaces, onOpenPane }: { spaces: Space[]; onOpenPane: (pane: Pane) => void }) {
  const blockedPanes = getBlockedPanes(spaces);
  if (blockedPanes.length === 0) return null;

  return (
    <View style={styles.cards}>
      {blockedPanes.map((blocked) => (
        <NeedsYouCard key={blocked.pane.id} blocked={blocked} onPress={() => onOpenPane(blocked.pane)} />
      ))}
    </View>
  );
}

/** A blocked agent's space, name and place, and Answer, which opens its pane. */
function NeedsYouCard({ blocked, onPress }: { blocked: LocatedPane; onPress: () => void }) {
  const { colors } = useTheme();
  const color = useToneColor("attention");
  const { pane, space, tab } = blocked;
  const title = `${space.name} · ${getAgentName(pane)} needs you`;
  const cardBackground = color + CARD_BACKGROUND_ALPHA;

  return (
    <Pressable
      style={[styles.card, { borderColor: color, backgroundColor: cardBackground }]}
      accessibilityRole="button"
      onPress={onPress}
      android_ripple={{ color: colors.border }}
    >
      <View style={[styles.cardIcon, { backgroundColor: color }]}>
        <MaterialIcons name="priority-high" size={CARD_ICON_SIZE} color={colors.background} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.detail, { color: colors.text }]}>
          {describePlace(tab, pane)}
        </Text>
      </View>
      <Text style={[styles.cardAction, { color }]}>Answer</Text>
    </Pressable>
  );
}

type SpaceItemProps = {
  space: Space;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenPane: (pane: Pane) => void;
};

/** A space's row and, when it is expanded, its tabs: one item of the list, so they move together. */
function SpaceItem({ space, isExpanded, onToggle, onOpenPane }: SpaceItemProps) {
  return (
    <View>
      <SpaceRow space={space} isExpanded={isExpanded} onPress={onToggle} />
      {isExpanded ? space.tabs.map((tab) => <TabRows key={tab.id} tab={tab} onOpenPane={onOpenPane} />) : null}
    </View>
  );
}

type SpaceRowProps = { space: Space; isExpanded: boolean; onPress: () => void };

/**
 * A space: its badge, name, the dot of its most urgent agent and its tab count. All of it shows
 * when the space is collapsed, so a blocked agent stays in sight. A tap folds it; a hold drags it.
 */
function SpaceRow({ space, isExpanded, onPress }: SpaceRowProps) {
  const { colors } = useTheme();
  const drag = useReorderableDrag();
  const urgentState = getMostUrgentState(space);
  const chevronName = isExpanded ? "expand-more" : "chevron-right";

  return (
    <Pressable
      style={[styles.spaceRow, { backgroundColor: colors.background }]}
      accessibilityRole="button"
      accessibilityState={{ expanded: isExpanded }}
      onPress={onPress}
      onLongPress={drag}
      delayLongPress={LONG_PRESS_MS}
      android_ripple={{ color: colors.border }}
    >
      <SpaceBadge space={space} />
      <Text numberOfLines={1} style={[styles.spaceName, { color: colors.text }]}>
        {space.name}
      </Text>
      {urgentState ? <StateDot tone={STATE_TONES[urgentState]} /> : null}
      <Text style={[styles.count, { color: colors.text }]}>{formatTabCount(space)}</Text>
      <MaterialIcons name={chevronName} size={CHEVRON_SIZE} color={colors.text} style={styles.dimmed} />
    </Pressable>
  );
}

/** "1 tab" or "3 tabs", and "· 4 panes" too when a tab is split, so a split tab does not look like two. */
function formatTabCount(space: Space): string {
  const count = space.tabs.length;
  const tabs = count === 1 ? "1 tab" : `${count} tabs`;
  const hasSplitTab = space.tabs.some((tab) => tab.panes.length > 1);
  if (!hasSplitTab) return tabs;

  const paneCount = space.tabs.reduce((total, tab) => total + tab.panes.length, 0);
  return `${tabs} · ${paneCount} panes`;
}

/**
 * A tab with one pane is one row, named by the tab. A tab with more panes gets a heading
 * and a row for each pane, joined by a line under the heading, so a tab and a pane never look alike.
 */
function TabRows({ tab, onOpenPane }: { tab: Tab; onOpenPane: (pane: Pane) => void }) {
  const { colors } = useTheme();
  const [firstPane] = tab.panes;

  if (tab.panes.length === 1) {
    const paneName = describePane(firstPane);
    const title = tab.name || paneName || firstPane.id;
    const detail = paneName === title ? undefined : paneName;
    return <PaneRow title={title} detail={detail} pane={firstPane} inset={ROW_INSET} onOpenPane={onOpenPane} />;
  }
  return (
    <View>
      {tab.name ? <Text style={[styles.tabHeading, { color: colors.text, paddingLeft: ROW_INSET }]}>{tab.name}</Text> : null}
      <View testID="pane-group" style={[styles.paneGroup, { borderLeftColor: colors.border }]}>
        {tab.panes.map((pane) => (
          <PaneRow key={pane.id} title={describePane(pane) || pane.id} pane={pane} inset={GROUPED_PANE_INSET} onOpenPane={onOpenPane} />
        ))}
      </View>
    </View>
  );
}

type PaneRowProps = {
  title: string;
  detail?: string;
  pane: Pane;
  inset: number;
  onOpenPane: (pane: Pane) => void;
};

/** A pane to open: its title, an optional detail line and its state pill. */
function PaneRow({ title, detail, pane, inset, onOpenPane }: PaneRowProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      style={[styles.paneRow, { paddingLeft: inset }]}
      accessibilityRole="button"
      onPress={() => onOpenPane(pane)}
      android_ripple={{ color: colors.border }}
    >
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[styles.paneTitle, { color: colors.text }]}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={1} style={[styles.detail, { color: colors.text }]}>
            {detail}
          </Text>
        ) : null}
      </View>
      <StatePill badge={getPaneBadge(pane)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  header: { paddingTop: 8, paddingBottom: 8 },
  error: { fontSize: 15, paddingHorizontal: 16, marginTop: 12 },
  empty: { padding: 16 },
  // The space below the cards is theirs, so the machine headers sit at the same height with or
  // without the open machine's list.
  cards: { gap: 12, marginBottom: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  cardAction: { fontSize: 14, fontWeight: "600" },
  rowText: { flex: 1, gap: 2 },
  detail: { fontSize: 13, opacity: 0.7 },
  spaceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    paddingHorizontal: ROW_PADDING,
    paddingTop: 8,
  },
  spaceName: { flex: 1, fontSize: 16, fontWeight: "500" },
  count: { fontSize: 13, opacity: 0.6 },
  dimmed: { opacity: 0.6 },
  tabHeading: { fontSize: 13, opacity: 0.6, paddingTop: 8 },
  paneGroup: { marginLeft: ROW_INSET, borderLeftWidth: StyleSheet.hairlineWidth },
  paneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingRight: 16,
    paddingVertical: 6,
  },
  paneTitle: { fontSize: 15 },
});
