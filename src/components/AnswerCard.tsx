import { useTheme } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { getAnswerKeys, type PendingQuestion, showsLabels } from "@/claude/question";
import { getErrorMessage } from "@/errorMessage";
import type { Backend } from "@/herdr/backend";
import { getAccentInk } from "@/navigationTheme";
import { parseStyledText } from "@/pane/ansi";

import { getPillBackground, useToneColor } from "./StatePill";

type AnswerCardProps = {
  backend: Backend;
  paneId: string;
  question: PendingQuestion;
  /** Called when the question is done: its keys went out, or the screen no longer shows the options. The caller shows the screen instead. */
  onDone: () => void;
};

/**
 * Claude's question with its options as buttons. A tap sends the option's key, once the screen
 * still shows the option's label. For a question with several answers, a tap picks an option and
 * Send answer sends the picks.
 */
export function AnswerCard({ backend, paneId, question, onDone }: AnswerCardProps) {
  const theme = useTheme();
  const { colors } = theme;
  const { picked, isSending, error, pick, answer } = useAnswer(backend, paneId, question, onDone);
  const canSend = picked.length > 0 && !isSending;

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.question, { color: colors.text }]}>{question.question}</Text>
      {question.options.map((label, index) => (
        <OptionButton key={label} label={label} isPicked={picked.includes(index)} isDisabled={isSending} onPress={() => pick(index)} />
      ))}
      {question.multiSelect ? (
        <Pressable
          style={[styles.option, { backgroundColor: colors.primary }, !canSend && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Send answer"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={() => void answer(picked)}
        >
          <Text style={[styles.sendLabel, { color: getAccentInk(theme) }]}>Send answer</Text>
        </Pressable>
      ) : null}
      {error ? <Text style={[styles.error, { color: colors.notification }]}>{error}</Text> : null}
    </View>
  );
}

function useAnswer(backend: Backend, paneId: string, question: PendingQuestion, onDone: () => void) {
  const [picked, setPicked] = useState<number[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(index: number) {
    if (!question.multiSelect) return void answer([index]);
    setPicked((current) => (current.includes(index) ? current.filter((other) => other !== index) : [...current, index]));
  }

  /** Reads the screen once, and sends the keys only when it still shows the options picked. */
  async function answer(indexes: number[]) {
    setIsSending(true);
    try {
      const screenText = parseStyledText(await backend.readPane(paneId)).text;
      if (!showsLabels(screenText, indexes.map((index) => question.options[index]))) return onDone();
      for (const key of getAnswerKeys(question.multiSelect, indexes)) await backend.pressKey(paneId, key);
      setPicked([]);
      setError(null);
      onDone();
    } catch (failure) {
      setError(`Could not send: ${getErrorMessage(failure)}`);
    } finally {
      setIsSending(false);
    }
  }

  return { picked, isSending, error, pick, answer };
}

function OptionButton(props: { label: string; isPicked: boolean; isDisabled: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const activeColor = useToneColor("active");
  const { label, isPicked, isDisabled, onPress } = props;

  return (
    <Pressable
      style={[styles.option, { backgroundColor: isPicked ? getPillBackground(activeColor) : colors.border }, isDisabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, selected: isPicked }}
      disabled={isDisabled}
      onPress={onPress}
    >
      <Text style={[styles.optionLabel, { color: isPicked ? activeColor : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 10, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 8 },
  question: { fontSize: 16, lineHeight: 24, fontWeight: "600" },
  option: { minHeight: 44, borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" },
  optionLabel: { fontSize: 15 },
  sendLabel: { fontSize: 15, fontWeight: "600", textAlign: "center" },
  error: { fontSize: 15 },
  disabled: { opacity: 0.4 },
});
