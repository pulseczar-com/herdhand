import { Stack, useLocalSearchParams, useTheme } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useContext, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { ChatView } from "@/components/ChatView";
import { NeedsYouBanner } from "@/components/NeedsYouBanner";
import { getColumnCount, PaneBlocks } from "@/components/PaneBlocks";
import { PaneComposer } from "@/components/PaneComposer";
import { SpaceBadge } from "@/components/SpaceBadge";
import { getPillBackground, StatePill, useToneColor } from "@/components/StatePill";
import { useKeepAtEnd } from "@/components/useKeepAtEnd";
import { hideClaudeInput } from "@/claude/inputLine";
import { isClaudeAgent, isClaudePane } from "@/claude/paths";
import { findPane, type LocatedPane } from "@/herdr/agentPanes";
import type { Backend, Pane } from "@/herdr/backend";
import { describePlace, getPaneBadge } from "@/herdr/badges";
import { type MachineConnection, MachineConnectionContext, useMachines } from "@/machines/MachineConnection";
import { canReadChat, type ChatBackend, useClaudeChat } from "@/machines/useClaudeChat";
import type { ConnectionStatus } from "@/machines/useMachineConnection";
import { usePaneText } from "@/machines/usePaneText";
import { type Block, reformatPane } from "@/pane/reformat";

const CONTENT_PADDING = 16;

type PaneView = "chat" | "screen";

/**
 * One pane, with the key row and composer to type into it. A Claude pane on the desktop app opens
 * on its chat, with a switch to the screen. The screen is the pane's text, reformatted for the
 * phone and kept fresh.
 */
export default function PaneRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const connection = useContext(MachineConnectionContext);
  const { machines, isLoaded, openMachine } = useMachines();
  const isSaved = machines.some((machine) => machine.id === id);
  const isOpen = connection?.id === id;

  // A link can name a machine that is not open: open it, so the pane is looked up on its own machine.
  useEffect(() => {
    if (isSaved && !isOpen) openMachine(id);
  }, [id, isSaved, isOpen, openMachine]);

  // Until the saved machines load, as on a start from a link to the pane.
  if (!isLoaded) return <ActivityIndicator style={styles.loading} />;
  if (!isSaved) return <NotSaved />;
  if (!connection || !isOpen) return <ActivityIndicator style={styles.loading} />;
  return <PaneScreen connection={connection} />;
}

function NotSaved() {
  const { colors } = useTheme();
  return <Text style={[styles.message, { color: colors.text }]}>This machine is no longer on this phone.</Text>;
}

function PaneScreen({ connection }: { connection: MachineConnection }) {
  const { paneId, title } = useLocalSearchParams<{ paneId: string; title?: string }>();
  const { status, list } = connection;
  const located = findPane(list.spaces ?? [], paneId);
  const [view, setView] = useState<PaneView>("chat");
  // The chat and the screen read the pane fresh on each poll; the list does not refresh by itself.
  const [freshPane, setFreshPane] = useState<Pane | null>(null);
  // Android apps are edge-to-edge, so the window does not resize for the keyboard; the view pads
  // itself by the keyboard's height, below the header.
  const headerHeight = useHeaderHeight();
  const chatBackend = getChatBackend(status, located);
  const isChat = chatBackend !== null && view === "chat";
  const shownPane = freshPane ?? located?.pane;
  const isClaude = located !== undefined && isClaudeAgent(located.pane);
  // Input goes to the agent when Herdr names one on the pane, else to the shell.
  const composerPlaceholder = shownPane?.agent ? "Message the agent" : "Run a command";

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <Stack.Screen options={getHeaderOptions(located, title ?? "", shownPane)} />
      {status.phase === "connected" ? (
        <>
          {chatBackend ? <ViewSwitch view={view} onChange={setView} /> : null}
          {isChat ? (
            <ClaudeChat backend={chatBackend} paneId={paneId} onPaneChange={setFreshPane} />
          ) : (
            <PaneText
              backend={status.backend}
              paneId={paneId}
              paneColumns={located?.pane.columns ?? null}
              isClaude={isClaude}
              onPaneChange={setFreshPane}
            />
          )}
          <PaneComposer backend={status.backend} paneId={paneId} placeholder={composerPlaceholder} />
        </>
      ) : (
        <NotConnected phase={status.phase} />
      )}
    </KeyboardAvoidingView>
  );
}

/** The backend, when the pane is a Claude pane and the backend can read its files: the desktop app's. */
function getChatBackend(status: ConnectionStatus, located: LocatedPane | undefined): ChatBackend | null {
  if (status.phase !== "connected" || !located || !isClaudePane(located.pane)) return null;
  return canReadChat(status.backend) ? status.backend : null;
}

/** The title, and the state pill of the pane on show at the trailing edge. */
function getHeaderOptions(located: LocatedPane | undefined, title: string, shownPane: Pane | undefined) {
  const headerRight = () => (
    <View style={styles.headerRight}>
      {shownPane ? <StatePill badge={getPaneBadge(shownPane)} /> : null}
    </View>
  );
  // The space and the place once the list has the pane; until then the pane's title.
  if (!located) return { title, headerRight };
  return { headerTitle: () => <PaneTitle located={located} />, headerRight };
}

/** The space's badge and name, and where the pane is in it. */
function PaneTitle({ located }: { located: LocatedPane }) {
  const { colors } = useTheme();
  const { pane, space, tab } = located;

  return (
    <View style={styles.title}>
      <SpaceBadge space={space} />
      <View style={styles.titleText}>
        <Text numberOfLines={1} style={[styles.spaceName, { color: colors.text }]}>
          {space.name}
        </Text>
        <Text numberOfLines={1} style={[styles.place, { color: colors.text }]}>
          {describePlace(tab, pane)}
        </Text>
      </View>
    </View>
  );
}

/** The Chat | Screen switch under the header. */
function ViewSwitch({ view, onChange }: { view: PaneView; onChange: (view: PaneView) => void }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.viewSwitch, { borderColor: colors.border }]} accessibilityRole="tablist">
      <ViewTab label="Chat" isSelected={view === "chat"} onPress={() => onChange("chat")} />
      <ViewTab label="Screen" isSelected={view === "screen"} onPress={() => onChange("screen")} />
    </View>
  );
}

function ViewTab({ label, isSelected, onPress }: { label: string; isSelected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const activeColor = useToneColor("active");
  const background = isSelected ? getPillBackground(activeColor) : "transparent";
  const textColor = isSelected ? activeColor : colors.text;

  return (
    <Pressable
      style={[styles.viewTab, { backgroundColor: background }]}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
    >
      <Text style={[styles.viewTabLabel, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

type ClaudeChatProps = { backend: ChatBackend; paneId: string; onPaneChange: (pane: Pane | null) => void };

/**
 * The pane's Claude chat, and the banner while Claude is blocked. Each fresh read of the pane goes
 * up to the header's state pill.
 */
function ClaudeChat({ backend, paneId, onPaneChange }: ClaudeChatProps) {
  const { chat, info, hasEarlier, loadEarlier, pane, error } = useClaudeChat(backend, paneId);
  useEffect(() => onPaneChange(pane), [pane, onPaneChange]);

  return (
    <>
      <ChatView chat={chat} info={info} hasEarlier={hasEarlier} onLoadEarlier={loadEarlier} error={error} />
      <NeedsYouBanner pane={pane} />
    </>
  );
}

type PaneTextProps = {
  backend: Backend;
  paneId: string;
  paneColumns: number | null;
  isClaude: boolean;
  onPaneChange: (pane: Pane | null) => void;
};

/**
 * The pane's text, reformatted to the phone's width, opening at its end, and the banner while its
 * agent is blocked. Each fresh read of the pane goes up to the header's state pill.
 */
function PaneText({ backend, paneId, paneColumns, isClaude, onPaneChange }: PaneTextProps) {
  const { colors } = useTheme();
  const { text, dimLines, pane, error } = usePaneText(backend, paneId);
  useEffect(() => onPaneChange(pane), [pane, onPaneChange]);
  const columnCount = useColumnCount();
  const { scrollRef, trackEnd, keepAtEnd } = useKeepAtEnd();
  const isLoading = text === null && !error;
  const blocks = text === null ? null : getScreenBlocks(text, isClaude, columnCount, paneColumns);

  return (
    <>
      {error ? <Text style={[styles.message, { color: colors.notification }]}>{error}</Text> : null}
      {isLoading ? <ActivityIndicator style={styles.message} /> : null}
      {/* Android runs scrollToEnd with the content height it has at that moment, which can be
          before the new text is mounted. With no scroll view until the text exists, and the
          command sent a frame after each size change, it always sees the new text. */}
      {blocks === null ? null : (
        <ScrollView
          ref={scrollRef}
          testID="pane-text"
          contentContainerStyle={styles.content}
          onScrollEndDrag={trackEnd}
          onMomentumScrollEnd={trackEnd}
          onContentSizeChange={keepAtEnd}
          onLayout={keepAtEnd}
        >
          <PaneBlocks blocks={blocks} dimLines={dimLines} />
        </ScrollView>
      )}
      <NeedsYouBanner pane={pane} />
    </>
  );
}

/**
 * How many columns of pane text fit across the screen. The system font size scales the text, so
 * fewer fit when it is large.
 */
function useColumnCount(): number {
  const { width, fontScale } = useWindowDimensions();
  const textWidth = (width - 2 * CONTENT_PADDING) / fontScale;
  return getColumnCount(textWidth);
}

/** The pane's text as blocks to show, without Claude's input box on a Claude pane. */
function getScreenBlocks(text: string, isClaude: boolean, columnCount: number, paneColumns: number | null): Block[] {
  // Claude's input box shows no text, as the composer is the input.
  const screenText = isClaude ? hideClaudeInput(text) : text;
  return reformatPane(screenText, columnCount, paneColumns);
}

/** A reconnect on return to the app, or a closed connection to go back from. */
function NotConnected({ phase }: { phase: Exclude<ConnectionStatus["phase"], "connected"> }) {
  const { colors } = useTheme();
  const textStyle = [styles.message, { color: colors.text }];
  if (phase !== "connecting") return <Text style={textStyle}>The connection closed.</Text>;

  return (
    <>
      <ActivityIndicator style={styles.message} />
      <Text style={textStyle}>Reconnecting…</Text>
    </>
  );
}

const styles = StyleSheet.create({
  loading: { padding: 16 },
  screen: { flex: 1 },
  message: { fontSize: 15, padding: 16 },
  // Short text sits at the bottom, as on a terminal.
  content: { flexGrow: 1, justifyContent: "flex-end", padding: CONTENT_PADDING },
  title: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  titleText: { flexShrink: 1 },
  spaceName: { fontSize: 16, fontWeight: "600" },
  place: { fontSize: 12, opacity: 0.7 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  viewSwitch: { flexDirection: "row", marginHorizontal: 16, marginVertical: 8, borderWidth: 1, borderRadius: 999, overflow: "hidden" },
  viewTab: { flex: 1, alignItems: "center", paddingVertical: 8 },
  viewTabLabel: { fontSize: 15, fontWeight: "600" },
});
