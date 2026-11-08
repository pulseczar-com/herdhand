import { useTheme } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { READ_LINES } from "@/herdr/backend";
import { getRunningOutput, type RunningOutput, type ShellBlock } from "@/shell/blocks";

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
 * chat with its output so far, or with the pane's live screen, which also serves a full-screen
 * program. All of it scrolls as one list, back to the pane as it was on open.
 */
export function ShellChat({ blocks, opening, isRunning, text, error }: ShellChatProps) {
  const { colors } = useTheme();
  const { scrollRef, stopFollowing, trackEnd, keepAtEnd } = useKeepAtEnd();
  const openingText = opening?.trimEnd() ?? "";
  const liveScreen = isRunning && text !== null ? getLiveScreen(text, opening, blocks.at(-1)) : null;

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
          onMomentumScrollBegin={stopFollowing}
          onScrollEndDrag={trackEnd}
          onMomentumScrollEnd={trackEnd}
          onContentSizeChange={keepAtEnd}
          onLayout={keepAtEnd}
        >
          {openingText ? <Output text={openingText} /> : null}
          {blocks.map((block) => (
            <BlockView key={block.id} block={block} />
          ))}
          {liveScreen?.output ? <Output text={liveScreen.output} /> : null}
          {liveScreen?.isCut ? <CutNote /> : null}
        </ScrollView>
      )}
    </>
  );
}

/**
 * What follows the chat while a command runs. A program that held the foreground on open gets the
 * whole pane, as there is no opening text yet to scroll back to. A command sent from the phone
 * gets its whole output so far, or the whole pane when its command line is out of the read, as
 * with a full-screen program. Any other command gets the end of the pane's screen.
 */
function getLiveScreen(text: string, opening: string | null, lastBlock: ShellBlock | undefined): RunningOutput {
  if (opening === null) return { output: text.trimEnd(), isCut: false };
  const runningOutput = lastBlock?.output === null ? getRunningOutput(lastBlock, text) : null;
  return runningOutput ?? { output: getScreenTail(text), isCut: false };
}

function BlockView({ block }: { block: ShellBlock }) {
  const { colors } = useTheme();
  const { command, output, isCut } = block;

  return (
    <View style={styles.block}>
      <PromptBubble text={command} />
      {output === null ? <Text style={[styles.note, { color: colors.text }]}>Running…</Text> : null}
      {output ? <Output text={output} /> : null}
      {isCut ? <CutNote /> : null}
    </View>
  );
}

function CutNote() {
  const { colors } = useTheme();
  return <Text style={[styles.note, { color: colors.text }]}>{`Cut to the last ${READ_LINES} lines.`}</Text>;
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
