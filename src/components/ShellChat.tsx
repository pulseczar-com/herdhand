import { useTheme } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { READ_LINES } from "@/herdr/backend";
import type { ShellBlock } from "@/shell/blocks";

import { PromptBubble } from "./ChatView";
import { getScreenTail } from "./ScreenCard";
import { useKeepAtEnd } from "./useKeepAtEnd";

type ShellChatProps = {
  blocks: ShellBlock[];
  /** The pane as it was when the shell first held the foreground, or null until then. */
  opening: string | null;
  /** Whether a command runs: the pane's screen then ends the chat. */
  isRunning: boolean;
  /** The pane's text now, or null while it loads. */
  text: string | null;
  error: string | null;
};

/**
 * A shell pane as a chat: the pane as it was on open, then each command sent from the phone as a
 * bubble with its output under it as plain text. A running command, whoever started it, ends the
 * chat with the pane's live screen, which also serves a full-screen program. All of it scrolls as
 * one list, back to the pane as it was on open.
 */
export function ShellChat({ blocks, opening, isRunning, text, error }: ShellChatProps) {
  const { colors } = useTheme();
  const { scrollRef, stopFollowing, trackEnd, keepAtEnd } = useKeepAtEnd();
  const openingText = opening?.trimEnd() ?? "";

  return (
    <>
      {error ? <Text style={[styles.message, { color: colors.notification }]}>{error}</Text> : null}
      {text === null && !error ? <ActivityIndicator style={styles.message} /> : null}
      {text === null ? null : (
        <ScrollView
          testID="shell-chat"
          ref={scrollRef}
          contentContainerStyle={styles.content}
          onScrollBeginDrag={stopFollowing}
          onScrollEndDrag={trackEnd}
          onMomentumScrollEnd={trackEnd}
          onContentSizeChange={keepAtEnd}
          onLayout={keepAtEnd}
        >
          {openingText ? <Output text={openingText} /> : null}
          {blocks.map((block) => (
            <BlockView key={block.id} block={block} />
          ))}
          {isRunning ? <Output text={getScreenTail(text)} /> : null}
        </ScrollView>
      )}
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

/** Text the pane printed, as a terminal shows it: only the commands sent from the phone get a bubble. */
function Output({ text }: { text: string }) {
  const { colors } = useTheme();
  return <Text style={[styles.output, { color: colors.text }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  message: { fontSize: 15, padding: 16 },
  // Short chats sit at the bottom, as on a terminal.
  content: { flexGrow: 1, justifyContent: "flex-end", padding: 16, gap: 12 },
  block: { gap: 8 },
  note: { alignSelf: "center", fontSize: 12, opacity: 0.6 },
  output: { fontFamily: "monospace", fontSize: 12, lineHeight: 16 },
});
