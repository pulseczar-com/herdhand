import { MaterialIcons } from "@expo/vector-icons";
import { useTheme } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { getErrorMessage } from "@/errorMessage";
import { type Backend, PANE_KEYS, type PaneKey } from "@/herdr/backend";
import { getAccentInk } from "@/navigationTheme";

type KeyLabel = { label: string; spoken: string };

const SEND_ICON_SIZE = 22;

// What a key shows, and what a screen reader says for it.
const KEY_LABELS: Record<PaneKey, KeyLabel> = {
  esc: { label: "Esc", spoken: "Escape" },
  "ctrl+c": { label: "^C", spoken: "Control C" },
  up: { label: "↑", spoken: "Up" },
  down: { label: "↓", spoken: "Down" },
  enter: { label: "⏎", spoken: "Enter" },
  1: { label: "1", spoken: "1" },
  2: { label: "2", spoken: "2" },
  3: { label: "3", spoken: "3" },
};

type PaneComposerProps = { backend: Backend; paneId: string; placeholder: string };

/**
 * The key row and a one-line composer for a pane. The placeholder says where the line goes. A
 * line goes once: Send waits for it, and the text stays in the input when it fails.
 */
export function PaneComposer({ backend, paneId, placeholder }: PaneComposerProps) {
  const theme = useTheme();
  const { colors } = theme;
  const accentInk = getAccentInk(theme);
  const { line, setLine, canSend, error, sendLine, pressKey } = usePaneInput(backend, paneId);

  return (
    <View style={[styles.composer, { borderColor: colors.border, backgroundColor: colors.card }]}>
      {error ? <Text style={[styles.error, { color: colors.notification }]}>{error}</Text> : null}
      <View style={styles.keys}>
        {PANE_KEYS.map((key) => (
          <KeyButton key={key} paneKey={key} onPress={() => void pressKey(key)} />
        ))}
      </View>
      <View style={styles.lineRow}>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          value={line}
          onChangeText={setLine}
          onSubmitEditing={() => void sendLine()}
          placeholder={placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          submitBehavior="submit"
        />
        <Pressable
          style={[styles.send, { backgroundColor: colors.primary }, !canSend && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={() => void sendLine()}
        >
          <MaterialIcons name="arrow-upward" size={SEND_ICON_SIZE} color={accentInk} />
        </Pressable>
      </View>
    </View>
  );
}

/** The line being written, and sending it or a key to the pane. A failed send shows its error. */
function usePaneInput(backend: Backend, paneId: string) {
  const [line, setLine] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSend = line !== "" && !isSending;

  async function sendLine() {
    if (!canSend) return;
    const sent = line;
    setIsSending(true);
    try {
      await backend.sendLine(paneId, sent);
      // Text typed while the line was on its way stays.
      setLine((current) => (current === sent ? "" : current));
      setError(null);
    } catch (failure) {
      showError(failure);
    } finally {
      setIsSending(false);
    }
  }

  async function pressKey(key: PaneKey) {
    try {
      await backend.pressKey(paneId, key);
      setError(null);
    } catch (failure) {
      showError(failure);
    }
  }

  function showError(failure: unknown) {
    setError(`Could not send: ${getErrorMessage(failure)}`);
  }

  return { line, setLine, canSend, error, sendLine, pressKey };
}

function KeyButton({ paneKey, onPress }: { paneKey: PaneKey; onPress: () => void }) {
  const { colors } = useTheme();
  const { label, spoken } = KEY_LABELS[paneKey];

  return (
    <Pressable
      style={[styles.key, { backgroundColor: colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onPress}
      android_ripple={{ color: colors.border }}
    >
      <Text style={{ color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, paddingBottom: 12, gap: 8 },
  error: { fontSize: 15, paddingHorizontal: 12 },
  keys: { flexDirection: "row", gap: 6, paddingHorizontal: 10 },
  key: { flex: 1, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  lineRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10 },
  input: { flex: 1, height: 46, paddingHorizontal: 16, borderRadius: 23, borderWidth: StyleSheet.hairlineWidth, fontSize: 15 },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.4 },
});
