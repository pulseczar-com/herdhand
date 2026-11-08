import type { AskedQuestion, Chat, ChatItem, ToolItem } from "@/chat/chatItems";

import { getAnswerKeys, getPendingQuestion, showsOptions } from "./question";

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

describe("showsOptions", () => {
  const options = ["main", "dev", "docs"];
  it.each([
    { where: "an option on its digit", screen: "  1. main\n  2. dev", picked: [1], expected: true },
    { where: "an option behind a cursor mark", screen: "❯ 2. dev", picked: [1], expected: true },
    { where: "an option behind a checkbox", screen: "1. [ ] main\n2. [x] dev", picked: [0, 1], expected: true },
    { where: "a label the screen wrapped", screen: "1. Use the existing\n   branch for it", picked: [0], expected: true, labels: ["Use the existing branch for it"] },
    { where: "an echoed answer with no digit", screen: "→ dev\n1. Yes\n2. Yes, and don't ask again\n3. No", picked: [1], expected: false },
    { where: "the label on another digit", screen: "1. dev\n2. main", picked: [1], expected: false },
    { where: "an option that is gone", screen: "❯ npm test", picked: [1], expected: false },
    { where: "one of two picks gone", screen: "1. main", picked: [0, 1], expected: false },
    { where: "a label with regex marks", screen: "1. Use a.b (now)", picked: [0], expected: true, labels: ["Use a.b (now)"] },
  ])("is $expected for $where", ({ screen, picked, expected, labels }) => {
    expect(showsOptions(screen, labels ?? options, picked)).toBe(expected);
  });
});
