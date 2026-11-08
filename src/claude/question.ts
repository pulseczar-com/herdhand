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
 * selects that option. A checkbox mark after the digit, or a line the screen wrapped, still counts.
 */
export function showsOptions(screenText: string, options: string[], picked: number[]): boolean {
  const screen = collapseSpace(screenText);
  return picked.every((index) => {
    const listed = `(?:^|\\s)${index + 1}\\.\\s(?:\\[[^\\]]*\\]\\s)?${escapeRegExp(collapseSpace(options[index]))}`;
    return new RegExp(listed).test(screen);
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collapseSpace(text: string): string {
  return text.replace(/\s+/g, " ");
}
