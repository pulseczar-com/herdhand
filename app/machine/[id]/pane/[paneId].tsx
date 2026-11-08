import { Stack, useLocalSearchParams, useTheme } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useContext, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { AnswerCard } from "@/components/AnswerCard";
import { ChatView } from "@/components/ChatView";
import { NeedsYouBanner } from "@/components/NeedsYouBanner";
import { getColumnCount, PaneBlocks } from "@/components/PaneBlocks";
import { PaneComposer } from "@/components/PaneComposer";
import { ScreenCard } from "@/components/ScreenCard";
import { SpaceBadge } from "@/components/SpaceBadge";
import { StatePill } from "@/components/StatePill";
import { useKeepAtEnd } from "@/components/useKeepAtEnd";
import { hideClaudeInput } from "@/claude/inputLine";
import { isClaudeAgent, isClaudePane } from "@/claude/paths";
import { getPendingQuestion } from "@/claude/question";
import { findPane, type LocatedPane } from "@/herdr/agentPanes";
import type { Backend, Pane } from "@/herdr/backend";
import { describePlace, getPaneBadge } from "@/herdr/badges";
import { type MachineConnection, MachineConnectionContext, useMachines } from "@/machines/MachineConnection";
import { canReadChat, type ChatBackend, useClaudeChat } from "@/machines/useClaudeChat";
import type { ConnectionStatus } from "@/machines/useMachineConnection";
import { usePaneText } from "@/machines/usePaneText";
import { type Block, reformatPane } from "@/pane/reformat";

const CONTENT_PADDING = 16;

/**
 * One pane, with the key row and composer to type into it. A Claude pane on the desktop app opens
 * on its chat; any other pane, and a Claude pane with no chat, opens on its screen with a line that
 * says why. The screen is the pane's text, reformatted for the phone and kept fresh.
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
  // The chat and the screen read the pane fresh on each poll; the list does not refresh by itself.
  const [freshPane, setFreshPane] = useState<Pane | null>(null);
  // Android apps are edge-to-edge, so the window does not resize for the keyboard; the view pads
  // itself by the keyboard's height, below the header.
  const headerHeight = useHeaderHeight();
  const chatBackend = getChatBackend(status, located);
  const shownPane = freshPane ?? located?.pane;
  const paneColumns = located?.pane.columns ?? null;
  const isClaude = located !== undefined && isClaudeAgent(located.pane);
  // Input goes to the agent when Herdr names one on the pane, else to the shell.
  const composerPlaceholder = shownPane?.agent ? "Message the agent" : "Run a command";

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <Stack.Screen options={getHeaderOptions(located, title ?? "", shownPane)} />
      {status.phase === "connected" ? (
        <>
          {chatBackend ? (
            <ClaudeChat backend={chatBackend} paneId={paneId} paneColumns={paneColumns} onPaneChange={setFreshPane} />
          ) : (
            <PaneText
              backend={status.backend}
              paneId={paneId}
              paneColumns={paneColumns}
              isClaude={isClaude}
              note={getNoChatNote(shownPane?.agent)}
              onPaneChange={setFreshPane}
            />
          )}
          <NeedsYouBanner pane={freshPane} />
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

type ClaudeChatProps = {
  backend: ChatBackend;
  paneId: string;
  paneColumns: number | null;
  onPaneChange: (pane: Pane | null) => void;
};

/**
 * The pane's Claude chat. Each fresh read of the pane goes up to the header and the banner. A
 * blocked agent ends the chat with the buttons of its question, or with its screen when the
 * transcript has no question the app can answer. With no chat to show, the pane shows its screen.
 */
function ClaudeChat({ backend, paneId, paneColumns, onPaneChange }: ClaudeChatProps) {
  const { chat, info, hasEarlier, loadEarlier, pane, screen, error } = useClaudeChat(backend, paneId);
  useEffect(() => onPaneChange(pane), [pane, onPaneChange]);
  const question = useMemo(() => (chat === null ? null : getPendingQuestion(chat)), [chat]);
  // The question whose options the screen stopped showing: the screen takes its place.
  const [doneQuestionId, setDoneQuestionId] = useState<string | null>(null);
  const answerQuestion = question !== null && question.id !== doneQuestionId ? question : null;

  if (chat?.size === 0) {
    return <PaneText backend={backend} paneId={paneId} paneColumns={paneColumns} isClaude note={NO_CHAT_FILE_NOTE} />;
  }
  return (
    <>
      <ChatView chat={chat} info={info} hasEarlier={hasEarlier} onLoadEarlier={loadEarlier} error={error} />
      {answerQuestion ? (
        <AnswerCard key={answerQuestion.id} backend={backend} paneId={paneId} question={answerQuestion} onDone={() => setDoneQuestionId(answerQuestion.id)} />
      ) : null}
      {!answerQuestion && screen !== null ? <ScreenCard text={screen} /> : null}
    </>
  );
}

const NO_CHAT_FILE_NOTE = "No chat found for this agent yet: showing the screen.";

/** The line over a screen shown in place of a chat: it says which pane has none. */
function getNoChatNote(agent: string | null | undefined): string {
  return `No chat for ${agent ?? "a shell"} here: showing the screen.`;
}

type PaneTextProps = {
  backend: Backend;
  paneId: string;
  paneColumns: number | null;
  isClaude: boolean;
  /** A line over the text, such as why there is no chat. */
  note?: string;
  /** Gets each fresh read of the pane; left out where the chat already reports it. */
  onPaneChange?: (pane: Pane | null) => void;
};

/**
 * The pane's text, reformatted to the phone's width, opening at its end. Each fresh read of the
 * pane goes up to the header and the banner.
 */
function PaneText({ backend, paneId, paneColumns, isClaude, note, onPaneChange }: PaneTextProps) {
  const { colors } = useTheme();
  const { text, dimLines, pane, error } = usePaneText(backend, paneId);
  useEffect(() => onPaneChange?.(pane), [pane, onPaneChange]);
  const columnCount = useColumnCount();
  const { scrollRef, trackEnd, keepAtEnd } = useKeepAtEnd();
  const isLoading = text === null && !error;
  // A new read of the pane renders again with the same text, which needs no new blocks.
  const blocks = useMemo(
    () => (text === null ? null : getScreenBlocks(text, isClaude, columnCount, paneColumns)),
    [text, isClaude, columnCount, paneColumns],
  );

  return (
    <>
      {note ? <Text style={[styles.note, { color: colors.text }]}>{note}</Text> : null}
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
  note: { fontSize: 13, opacity: 0.7, paddingHorizontal: 16, paddingTop: 8 },
  // Short text sits at the bottom, as on a terminal.
  content: { flexGrow: 1, justifyContent: "flex-end", padding: CONTENT_PADDING },
  title: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  titleText: { flexShrink: 1 },
  spaceName: { fontSize: 16, fontWeight: "600" },
  place: { fontSize: 12, opacity: 0.7 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
});
