import { useTheme } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { parseStyledText } from "@/pane/ansi";

/** The card shows this many of the screen's last lines. */
export const SCREEN_LINES = 15;

/** The last SCREEN_LINES lines of the screen, with no style codes and no blank lines at the end. */
export function getScreenTail(raw: string): string {
  const lines = parseStyledText(raw).text.trimEnd().split("\n");
  return lines.slice(-SCREEN_LINES).join("\n");
}

/**
 * The bottom of the pane's screen, for a dialog the transcript does not record, such as a
 * permission prompt or a sign-in. The caller refreshes the text.
 */
export function ScreenCard({ text }: { text: string }) {
  const { colors } = useTheme();

  return (
    <View testID="screen-card" style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.text, { color: colors.text }]}>{getScreenTail(text)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 10, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 10 },
  text: { fontFamily: "monospace", fontSize: 12, lineHeight: 16 },
});
