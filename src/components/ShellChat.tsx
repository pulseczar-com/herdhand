import { useTheme } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { READ_LINES } from "@/herdr/backend";
import type { ShellBlock } from "@/shell/blocks";

import { PromptBubble } from "./ChatView";
import { getScreenTail, ScreenCard } from "./ScreenCard";
import { useKeepAtEnd } from "./useKeepAtEnd";

type ShellChatProps = {
  blocks: ShellBlock[];
  /** The pane as it was on open, or null while it loads. */
  opening: string | null;
  /** Whether a command runs: the pane's screen then ends the chat. */
  isRunning: boolean;
  /** The pane's text now. */
  text: string | null;
  error: string | null;
};

/**
 * A shell pane as a chat: the pane as it was on open, then each command sent from the phone as a
 * bubble with its output under it. A running command, whoever started it, ends the chat with the
 * pane's live screen, which also serves a full-screen program.
 */
export function ShellChat({ blocks, opening, isRunning, text, error }: ShellChatProps) {
  const { colors } = useTheme();
  const { scrollRef, trackEnd, keepAtEnd } = useKeepAtEnd();
  const openingTail = opening === null ? "" : getScreenTail(opening);

  return (
    <>
      {error ? <Text style={[styles.message, { color: colors.notification }]}>{error}</Text> : null}
      {opening === null && !error ? <ActivityIndicator style={styles.message} /> : null}
      {opening === null ? null : (
        <ScrollView
          testID="shell-chat"
          ref={scrollRef}
          contentContainerStyle={styles.content}
          onScrollEndDrag={trackEnd}
          onMomentumScrollEnd={trackEnd}
          onContentSizeChange={keepAtEnd}
          onLayout={keepAtEnd}
        >
          {openingTail ? <Output text={openingTail} /> : null}
          {blocks.map((block) => (
            <BlockView key={block.id} block={block} />
          ))}
        </ScrollView>
      )}
      {isRunning && text !== null ? <ScreenCard text={text} /> : null}
    </>
  );
}

function BlockView({ block }: { block: ShellBlock }) {
  const { colors } = useTheme();
  const { command, output, isCut } = block;

  return (
    <View style={styles.block}>
      <PromptBubble text={command} />
      {output === null ? <Text style={[styles.note, { color: colors.text }]}>Running…</Text> : null}
      {output ? <Output text={output} /> : null}
      {isCut ? <Text style={[styles.note, { color: colors.text }]}>{`Cut to the last ${READ_LINES} lines.`}</Text> : null}
    </View>
  );
}

function Output({ text }: { text: string }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.output, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.outputText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  message: { fontSize: 15, padding: 16 },
  // Short chats sit at the bottom, as on a terminal.
  content: { flexGrow: 1, justifyContent: "flex-end", padding: 16, gap: 12 },
  block: { gap: 8 },
  note: { alignSelf: "center", fontSize: 12, opacity: 0.6 },
  output: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10 },
  outputText: { fontFamily: "monospace", fontSize: 12, lineHeight: 16 },
});
