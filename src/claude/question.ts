import type { AskedQuestion, Chat } from "@/chat/chatItems";
import type { PaneKey } from "@/herdr/backend";

/** A question Claude waits for an answer to, with the id of the call that asked it. */
export type PendingQuestion = AskedQuestion & { id: string };

// The digit keys the app can send: an option past the sixth has no key.
const OPTION_KEYS: readonly PaneKey[] = ["1", "2", "3", "4", "5", "6"];

/**
 * The question of the last call in the chat, when it has no result yet and the app can answer it:
 * one question, with one to six options. A call that asks several questions needs more than
 * keys to answer, so the screen shows it instead.
 */
export function getPendingQuestion(chat: Chat): PendingQuestion | null {
  const last = Array.from(chat.values()).at(-1);
  if (last?.kind !== "tool" || last.result !== null || last.questions?.length !== 1) return null;
  const [asked] = last.questions;
  if (asked.options.length === 0 || asked.options.length > OPTION_KEYS.length) return null;
  return { id: last.id, ...asked };
}

/**
 * The keys that answer: the option's digit for one choice. For several, Claude toggles each
 * option on its digit, Tab moves to the submit tab, and 1 submits.
 */
export function getAnswerKeys(multiSelect: boolean, picked: number[]): PaneKey[] {
  const digits = [...picked].sort((a, b) => a - b).map((index) => OPTION_KEYS[index]);
  return multiSelect ? [...digits, "tab", "1"] : digits;
}

/**
 * Whether the screen still lists each picked option on its own digit ("2. dev"), so the digit key
 * selects that option, not a longer option that starts with its label. Only the text after the
 * last place the question shows counts: the live dialog lists its options under the question, and
 * after an answer the echo of the question ("Which branch? → dev") comes before the next dialog,
 * so an answered question never counts. A checkbox mark after the digit, or a line the screen
 * wrapped, still counts.
 */
export function showsOptions(screenText: string, question: AskedQuestion, picked: number[]): boolean {
  const screen = collapseSpace(screenText);
  const text = collapseSpace(question.question);
  const asked = screen.lastIndexOf(text);
  if (asked < 0) return false;
  const dialog = screen.slice(asked);
  if (dialog.startsWith(`${text} →`)) return false;
  return picked.every((index) => {
    const listed = `(?:^|\\s)${index + 1}\\.\\s(?:\\[[^\\]]*\\]\\s)?${escapeRegExp(collapseSpace(question.options[index]))}(?=\\s|$)`;
    return new RegExp(listed).test(dialog);
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collapseSpace(text: string): string {
  return text.replace(/\s+/g, " ");
}
