import { useTheme } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { getAccentInk } from "@/navigationTheme";
import { useToneColor } from "@/components/StatePill";

// Dims the screen behind the sheet.
const SCRIM_COLOR = "rgba(0,0,0,0.4)";

type DiscussSheetProps = {
  /** The sheet shows while it is true. */
  visible: boolean;
  /** The Firstmate's name, for the title. */
  homeName: string;
  /** Sends the note. Gives null when it was sent, else the error line. */
  onSend: (text: string) => Promise<string | null>;
  onClose: () => void;
};

/** A sheet from the bottom with a multi-line field. Send saves a note in the Firstmate's inbox. */
export function DiscussSheet({ visible, homeName, onSend, onClose }: DiscussSheetProps) {
  const theme = useTheme();
  const { colors } = theme;
  const dangerColor = useToneColor("danger");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function send() {
    setIsSending(true);
    const failure = await onSend(text);
    setIsSending(false);
    setError(failure);
    if (!failure) setText("");
  }

  function close() {
    setError(null);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <Pressable style={styles.scrim} accessibilityLabel="Close" onPress={close} />
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text }]}>{`Discuss with ${homeName}`}</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            value={text}
            onChangeText={setText}
            placeholder="Write a note"
            placeholderTextColor={colors.border}
            multiline
            autoFocus
            accessibilityLabel="Note"
          />
          {error ? <Text style={[styles.error, { color: dangerColor }]}>{error}</Text> : null}
          <View style={styles.buttons}>
            <Pressable style={styles.button} accessibilityRole="button" onPress={close}>
              <Text style={{ color: colors.text }}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, { backgroundColor: colors.primary }, isSending && styles.disabled]}
              accessibilityRole="button"
              disabled={isSending}
              onPress={() => void send()}
            >
              <Text style={{ color: getAccentInk(theme) }}>Send</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: SCRIM_COLOR },
  sheet: { padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, gap: 12 },
  handle: { alignSelf: "center", width: 36, height: 4, borderRadius: 2 },
  title: { fontSize: 16, fontWeight: "600" },
  input: { minHeight: 96, maxHeight: 200, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, textAlignVertical: "top" },
  error: { fontSize: 13 },
  buttons: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  button: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  disabled: { opacity: 0.5 },
});
