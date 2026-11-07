import type { AskedQuestion, Chat, ChatItem, ToolItem } from "@/chat/chatItems";

import { getAnswerKeys, getPendingQuestion, showsLabels } from "./question";

function ask(id: string, questions: AskedQuestion[], result: ToolItem["result"] = null): ToolItem {
  return { kind: "tool", id, name: "AskUserQuestion", summary: "", input: "{}", result, questions };
}

function makeChat(...items: ChatItem[]): Chat {
  return new Map(items.map((item) => [item.id, item]));
}

const BRANCH: AskedQuestion = { question: "Which branch?", multiSelect: false, options: ["main", "dev"] };

describe("getPendingQuestion", () => {
  it("gives the question of the last call that has no result", () => {
    expect(getPendingQuestion(makeChat(ask("q1", [BRANCH])))).toEqual({ id: "q1", ...BRANCH });
  });

  it.each([
    { where: "no items", chat: makeChat() },
    { where: "an answered call", chat: makeChat(ask("q1", [BRANCH], { text: "done", isError: false })) },
    { where: "an earlier call left open", chat: makeChat(ask("q1", [BRANCH]), { kind: "prompt", id: "u1", text: "next" }) },
    { where: "several questions in one call", chat: makeChat(ask("q1", [BRANCH, BRANCH])) },
    { where: "more options than keys", chat: makeChat(ask("q1", [{ ...BRANCH, options: ["1", "2", "3", "4", "5", "6", "7"] }])) },
    { where: "no options", chat: makeChat(ask("q1", [{ ...BRANCH, options: [] }])) },
  ])("gives nothing for $where", ({ chat }) => {
    expect(getPendingQuestion(chat)).toBeNull();
  });
});

describe("getAnswerKeys", () => {
  it.each([
    { where: "one choice", multiSelect: false, picked: [1], expected: ["2"] },
    { where: "several picks", multiSelect: true, picked: [0, 2], expected: ["1", "3", "tab", "1"] },
    { where: "picks out of order", multiSelect: true, picked: [2, 0], expected: ["1", "3", "tab", "1"] },
  ])("gives $expected for $where", ({ multiSelect, picked, expected }) => {
    expect(getAnswerKeys(multiSelect, picked)).toEqual(expected);
  });
});

describe("showsLabels", () => {
  it.each([
    { where: "a label on a line", screen: "  1. main\n  2. dev", labels: ["dev"], expected: true },
    { where: "a label the screen wrapped", screen: "1. Use the existing\n   branch for it", labels: ["Use the existing branch for it"], expected: true },
    { where: "a label that is gone", screen: "❯ npm test", labels: ["dev"], expected: false },
    { where: "one of two labels gone", screen: "1. main", labels: ["main", "dev"], expected: false },
  ])("is $expected for $where", ({ screen, labels, expected }) => {
    expect(showsLabels(screen, labels)).toBe(expected);
  });
});
