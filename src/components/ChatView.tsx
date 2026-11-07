import { useTheme } from "expo-router";
import { Markdown, type NativeOptions } from "markdown-to-jsx/native";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { Chat, ChatInfo, ChatItem, ToolItem } from "@/chat/chatItems";

import { getPillBackground, useToneColor } from "./StatePill";
import { useKeepAtEnd } from "./useKeepAtEnd";

/** An open tool row shows this many lines of its result. */
export const RESULT_LINES = 12;

// How close to the top, in points, asks for earlier lines.
const TOP_SLACK = 100;
// The least time between two scroll events, in milliseconds.
const SCROLL_EVENT_INTERVAL = 100;
const UNAVAILABLE_TEXT = "Chat is not available for this pane. Use Screen.";

type ChatViewProps = {
  chat: Chat | null;
  info: ChatInfo;
  hasEarlier: boolean;
  onLoadEarlier: () => void;
  error: string | null;
};

type ChatBodyProps = Omit<ChatViewProps, "error">;

/**
 * A conversation with an agent: a header with the model, folder and branch, prompts on the right,
 * replies in Markdown, and each tool call as a row that a tap opens. Scrolling to the top asks for
 * earlier lines. When the chat has nothing to show, one line says it is not available.
 */
export function ChatView({ chat, error, ...bodyProps }: ChatViewProps) {
  const { colors } = useTheme();

  return (
    <>
      {error ? <Text style={[styles.message, { color: colors.notification }]}>{error}</Text> : null}
      <ChatBody chat={chat} {...bodyProps} />
    </>
  );
}

/** The loaded chat: kept at its end while the person is there, and filled from the top. */
function ChatBody({ chat, info, hasEarlier, onLoadEarlier }: ChatBodyProps) {
  const { colors } = useTheme();
  const { scrollRef, trackEnd, keepAtEnd } = useKeepAtEnd();
  const earlier = useLoadEarlier(chat, hasEarlier, onLoadEarlier);

  if (chat === null) return <ActivityIndicator style={styles.message} />;
  if (chat.size === 0) return <Text style={[styles.message, { color: colors.text }]}>{UNAVAILABLE_TEXT}</Text>;

  return (
    <>
      <ChatHeader info={info} />
      <ScrollView
        ref={scrollRef}
        testID="chat"
        contentContainerStyle={styles.content}
        // The view keeps what the person reads in place when earlier items are added above it.
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        scrollEventThrottle={SCROLL_EVENT_INTERVAL}
        onScroll={earlier.loadEarlierNearTop}
        onScrollEndDrag={trackEnd}
        onMomentumScrollEnd={trackEnd}
        onContentSizeChange={(_width, height) => {
          keepAtEnd();
          earlier.setContentHeight(height);
        }}
        onLayout={({ nativeEvent }) => {
          keepAtEnd();
          earlier.setViewHeight(nativeEvent.layout.height);
        }}
      >
        {Array.from(chat.values()).map((item) => (
          <ChatItemView key={item.id} item={item} />
        ))}
      </ScrollView>
    </>
  );
}

/**
 * Asks for earlier lines when the person scrolls near the top. A chat too short to scroll has no
 * scroll to the top, so it also asks each time the chat or a measured height changes.
 */
function useLoadEarlier(chat: Chat | null, hasEarlier: boolean, onLoadEarlier: () => void) {
  const viewHeight = useRef<number | null>(null);
  const contentHeight = useRef<number | null>(null);
  const scrollOffset = useRef<number | null>(null);

  function loadEarlierNearTop({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) {
    scrollOffset.current = nativeEvent.contentOffset.y;
    if (hasEarlier && isNearTop(scrollOffset.current)) onLoadEarlier();
  }

  function keepFilled() {
    if (hasEarlier && shouldLoadEarlier(contentHeight.current, viewHeight.current, scrollOffset.current)) onLoadEarlier();
  }

  // A page that adds nothing to see changes no size and moves nothing, so each new chat checks again.
  useEffect(() => {
    keepFilled();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the chat changes, not on every render
  }, [chat, hasEarlier, onLoadEarlier]);

  function setContentHeight(height: number) {
    contentHeight.current = height;
    keepFilled();
  }

  function setViewHeight(height: number) {
    viewHeight.current = height;
    keepFilled();
  }

  return { loadEarlierNearTop, setContentHeight, setViewHeight };
}

function isNearTop(offset: number): boolean {
  return offset <= TOP_SLACK;
}

/** Whether the chat, once measured, is too short to scroll or the person is at its top. */
function shouldLoadEarlier(contentHeight: number | null, viewHeight: number | null, offset: number | null): boolean {
  const isShort = contentHeight !== null && viewHeight !== null && contentHeight <= viewHeight;
  return isShort || (offset !== null && isNearTop(offset));
}

/** The model, folder and branch, as the transcript has them. Nothing shows when it has none. */
function ChatHeader({ info }: { info: ChatInfo }) {
  const { colors } = useTheme();
  const text = [info.model, info.folder, info.branch].filter(Boolean).join(" · ");
  if (!text) return null;

  return (
    <Text testID="chat-info" style={[styles.info, { color: colors.text }]}>
      {text}
    </Text>
  );
}

// Items keep their identity across polls, so an unchanged reply is not parsed again.
const ChatItemView = memo(function ChatItemView({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case "prompt":
      return <PromptBubble text={item.text} />;
    case "reply":
      return <Reply text={item.text} />;
    case "tool":
      return <ToolRow tool={item} />;
    case "note":
      return <Note text={item.text} />;
  }
});

function PromptBubble({ text }: { text: string }) {
  const { colors } = useTheme();
  const tint = getPillBackground(useToneColor("active"));

  return (
    <View style={[styles.prompt, { backgroundColor: tint }]}>
      <Text style={[styles.text, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

function Reply({ text }: { text: string }) {
  const options = useMarkdownOptions();
  return <Markdown options={options}>{text}</Markdown>;
}

/**
 * The renderer's options in the theme's colors. `forceBlock` makes a one-line reply a paragraph,
 * so it gets the paragraph's style; raw HTML shows as text, as the agent wrote it.
 */
function useMarkdownOptions(): NativeOptions {
  const { colors } = useTheme();
  const linkColor = useToneColor("active");

  return useMemo(() => {
    const text = { color: colors.text };
    const line = { borderColor: colors.border, borderBottomColor: colors.border, borderRightColor: colors.border };
    return {
      forceBlock: true,
      disableParsingRawHTML: true,
      styles: {
        text,
        paragraph: [text, styles.paragraph],
        listItemBullet: text,
        listItemNumber: text,
        tableHeaderText: text,
        link: { color: linkColor },
        codeInline: [styles.monospace, { backgroundColor: colors.border }],
        codeBlock: [styles.codeBlock, { backgroundColor: colors.card, borderColor: colors.border }],
        table: line,
        tableHeader: { backgroundColor: colors.card },
        tableCellDivider: line,
        tableRowDivider: line,
        thematicBreak: { backgroundColor: colors.border },
      },
    };
  }, [colors, linkColor]);
}

// ---- Tool rows ----

const TOOL_STATUSES = {
  running: { mark: "●", tone: "active" },
  done: { mark: "✓", tone: "success" },
  failed: { mark: "✕", tone: "danger" },
} as const;

/** A tool call as one line: its mark, name and summary. A tap shows its input and the start of its result. */
function ToolRow({ tool }: { tool: ToolItem }) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const chevron = isOpen ? "⌃" : "⌄";

  return (
    <Pressable
      style={[styles.tool, { borderColor: colors.border, backgroundColor: colors.card }]}
      accessibilityRole="button"
      accessibilityLabel={`${tool.name}: ${tool.summary}`}
      accessibilityState={{ expanded: isOpen }}
      onPress={() => setIsOpen((open) => !open)}
    >
      <View style={styles.toolLine}>
        <ToolMark tool={tool} />
        <Text style={[styles.toolName, { color: colors.text }]}>{tool.name}</Text>
        <Text numberOfLines={1} style={[styles.toolSummary, { color: colors.text }]}>
          {tool.summary}
        </Text>
        <Text style={[styles.chevron, { color: colors.text }]}>{chevron}</Text>
      </View>
      {isOpen ? <ToolDetails tool={tool} /> : null}
    </Pressable>
  );
}

function ToolMark({ tool }: { tool: ToolItem }) {
  const { mark, tone } = TOOL_STATUSES[getToolStatus(tool)];
  const color = useToneColor(tone);
  return <Text style={[styles.toolMark, { color }]}>{mark}</Text>;
}

function getToolStatus(tool: ToolItem): keyof typeof TOOL_STATUSES {
  if (!tool.result) return "running";
  return tool.result.isError ? "failed" : "done";
}

function ToolDetails({ tool }: { tool: ToolItem }) {
  const resultStart = tool.result ? getFirstLines(tool.result.text) : "";

  return (
    <>
      <DetailBlock label="Input" text={tool.input} />
      {resultStart ? <DetailBlock label="Result" text={resultStart} /> : null}
    </>
  );
}

function getFirstLines(text: string): string {
  const lines = text.split("\n");
  return lines.slice(0, RESULT_LINES).join("\n");
}

function DetailBlock({ label, text }: { label: string; text: string }) {
  const { colors } = useTheme();

  return (
    <View style={styles.detail}>
      <Text style={[styles.detailLabel, { color: colors.text }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.monospace, styles.detailText, { color: colors.text, backgroundColor: colors.background }]}>{text}</Text>
    </View>
  );
}

function Note({ text }: { text: string }) {
  const { colors } = useTheme();
  return <Text style={[styles.note, { color: colors.text }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  message: { fontSize: 15, padding: 16 },
  content: { flexGrow: 1, justifyContent: "flex-end", padding: 16, gap: 12 },
  text: { fontSize: 16, lineHeight: 24 },
  paragraph: { marginBottom: 8 },
  monospace: { fontFamily: "monospace" },
  prompt: { alignSelf: "flex-end", maxWidth: "85%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  codeBlock: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 10, marginBottom: 8 },
  tool: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  toolLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  toolMark: { fontSize: 14, fontWeight: "700" },
  toolName: { fontSize: 15, fontWeight: "600" },
  toolSummary: { flex: 1, fontSize: 15, opacity: 0.7 },
  chevron: { fontSize: 14, opacity: 0.6 },
  detail: { marginTop: 10, gap: 4 },
  detailLabel: { fontSize: 11, fontWeight: "600", opacity: 0.6 },
  detailText: { fontSize: 13, borderRadius: 8, padding: 8 },
  info: { alignSelf: "center", fontSize: 12, opacity: 0.6, paddingTop: 8 },
  note: { alignSelf: "center", fontSize: 12, opacity: 0.6 },
});
