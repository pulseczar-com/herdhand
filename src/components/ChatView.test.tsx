import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { StyleSheet } from "react-native";

import type { Chat, ChatItem } from "@/chat/chatItems";
import type { Pane } from "@/herdr/backend";

import { ChatView, NeedsYouBanner, RESULT_LINES } from "./ChatView";

jest.mock("expo-router", () => ({
  useTheme: () => ({ dark: true, colors: { text: "#eee", border: "#333", card: "#111", background: "#000", notification: "#f00" } }),
}));

function makeChat(...items: ChatItem[]): Chat {
  return new Map(items.map((item) => [item.id, item]));
}

function renderChat(chat: Chat | null, props: Partial<ComponentProps<typeof ChatView>> = {}) {
  render(<ChatView chat={chat} info={{}} hasEarlier={false} onLoadEarlier={jest.fn()} error={null} {...props} />);
}

const UNAVAILABLE_NOTE = "Chat is not available for this pane. Use Screen.";

describe("ChatView", () => {
  const PROMPT: ChatItem = { kind: "prompt", id: "u1", text: "Fix the build" };

  it("shows the model, folder and branch above the chat", () => {
    renderChat(makeChat(PROMPT), { info: { model: "claude-opus-5-5", folder: "demo", branch: "main" } });

    expect(screen.getByText("claude-opus-5-5 · demo · main")).toBeTruthy();
  });

  it("keeps the header outside the scrolling chat, so it stays in view", () => {
    renderChat(makeChat(PROMPT), { info: { model: "claude-opus-5-5" } });

    expect(screen.getByTestId("chat").findAll((node) => node.props.testID === "chat-info")).toHaveLength(0);
    expect(screen.getByTestId("chat-info")).toBeTruthy();
  });

  it("leaves out what the info does not have", () => {
    renderChat(makeChat(PROMPT), { info: { folder: "demo" } });
    expect(screen.getByText("demo")).toBeTruthy();
  });

  it("shows no header for empty info", () => {
    renderChat(makeChat(PROMPT));
    expect(screen.queryByTestId("chat-info")).toBeNull();
  });

  it("asks for earlier lines when the person scrolls to the top", () => {
    const onLoadEarlier = jest.fn();
    renderChat(makeChat(PROMPT), { hasEarlier: true, onLoadEarlier });

    fireEvent.scroll(screen.getByTestId("chat"), { nativeEvent: { contentOffset: { y: 300 }, contentSize: { height: 2000 }, layoutMeasurement: { height: 600 } } });
    expect(onLoadEarlier).not.toHaveBeenCalled();

    fireEvent.scroll(screen.getByTestId("chat"), { nativeEvent: { contentOffset: { y: 20 }, contentSize: { height: 2000 }, layoutMeasurement: { height: 600 } } });
    expect(onLoadEarlier).toHaveBeenCalledTimes(1);
  });

  it("does not ask when there is nothing earlier", () => {
    const onLoadEarlier = jest.fn();
    renderChat(makeChat(PROMPT), { onLoadEarlier });

    fireEvent.scroll(screen.getByTestId("chat"), { nativeEvent: { contentOffset: { y: 0 }, contentSize: { height: 2000 }, layoutMeasurement: { height: 600 } } });

    expect(onLoadEarlier).not.toHaveBeenCalled();
  });

  it("asks for earlier lines when the chat is too short to scroll", () => {
    const onLoadEarlier = jest.fn();
    renderChat(makeChat(PROMPT), { hasEarlier: true, onLoadEarlier });
    const chat = screen.getByTestId("chat");

    fireEvent(chat, "layout", { nativeEvent: { layout: { height: 600 } } });
    fireEvent(chat, "contentSizeChange", 320, 200);

    expect(onLoadEarlier).toHaveBeenCalledTimes(1);
  });

  it("asks again for each page that leaves the chat too short to scroll", () => {
    const onLoadEarlier = jest.fn();
    const props = { info: {}, hasEarlier: true, onLoadEarlier, error: null };
    const { rerender } = render(<ChatView chat={makeChat(PROMPT)} {...props} />);
    const chat = screen.getByTestId("chat");
    fireEvent(chat, "layout", { nativeEvent: { layout: { height: 600 } } });
    fireEvent(chat, "contentSizeChange", 320, 600);
    expect(onLoadEarlier).toHaveBeenCalledTimes(1);

    // The view is still not filled, so the content size does not change and fires nothing.
    rerender(<ChatView chat={makeChat(PROMPT, { kind: "note", id: "n1", text: "Conversation compacted" })} {...props} />);

    expect(onLoadEarlier).toHaveBeenCalledTimes(2);
  });

  it("asks again for each page that adds nothing to see while the person is at the top", () => {
    const onLoadEarlier = jest.fn();
    const props = { info: {}, hasEarlier: true, onLoadEarlier, error: null };
    const { rerender } = render(<ChatView chat={makeChat(PROMPT)} {...props} />);
    fireEvent.scroll(screen.getByTestId("chat"), { nativeEvent: { contentOffset: { y: 0 }, contentSize: { height: 2000 }, layoutMeasurement: { height: 600 } } });
    expect(onLoadEarlier).toHaveBeenCalledTimes(1);

    rerender(<ChatView chat={makeChat(PROMPT)} {...props} />);

    expect(onLoadEarlier).toHaveBeenCalledTimes(2);
  });

  it("does not ask again for a new chat when the person is away from the top", () => {
    const onLoadEarlier = jest.fn();
    const props = { info: {}, hasEarlier: true, onLoadEarlier, error: null };
    const { rerender } = render(<ChatView chat={makeChat(PROMPT)} {...props} />);
    fireEvent.scroll(screen.getByTestId("chat"), { nativeEvent: { contentOffset: { y: 800 }, contentSize: { height: 2000 }, layoutMeasurement: { height: 600 } } });

    rerender(<ChatView chat={makeChat(PROMPT, { kind: "note", id: "n1", text: "x" })} {...props} />);

    expect(onLoadEarlier).not.toHaveBeenCalled();
  });

  it("does not ask before the view is measured", () => {
    const onLoadEarlier = jest.fn();
    renderChat(makeChat(PROMPT), { hasEarlier: true, onLoadEarlier });

    expect(onLoadEarlier).not.toHaveBeenCalled();
  });

  it("shows prompts, replies and notes", () => {
    renderChat(
      makeChat(
        { kind: "prompt", id: "u1", text: "Fix the build" },
        { kind: "reply", id: "a1", text: "Fixed." },
        { kind: "note", id: "s1", text: "Conversation compacted" },
      ),
    );

    expect(screen.getByText("Fix the build")).toBeTruthy();
    expect(screen.getByText("Conversation compacted")).toBeTruthy();
  });

  // With no paragraph, a one-line reply would be a bare Text with no style: dark text on a dark theme.
  it("shows a one-line reply as a paragraph, in the theme's text color", () => {
    renderChat(makeChat({ kind: "reply", id: "a1", text: "Fixed." }));

    expect(StyleSheet.flatten(screen.getByText("Fixed.").props.style).color).toBe("#eee");
  });

  it("shows HTML tags in a reply as text", () => {
    renderChat(makeChat({ kind: "reply", id: "a1", text: "Use <b>bold</b> here." }));

    expect(screen.getByText("Use <b>bold</b> here.")).toBeTruthy();
  });

  it("shows a tool call as one row that a tap opens", () => {
    const result = Array.from({ length: RESULT_LINES + 3 }, (_, index) => `line ${index + 1}`).join("\n");
    renderChat(
      makeChat({ kind: "tool", id: "tool1", name: "Bash", summary: "List files", input: "ls -la", result: { text: result, isError: false } }),
    );
    expect(screen.getByText("Bash")).toBeTruthy();
    expect(screen.getByText("List files")).toBeTruthy();
    expect(screen.queryByText("ls -la")).toBeNull();

    fireEvent.press(screen.getByRole("button", { name: "Bash: List files" }));

    expect(screen.getByText("ls -la")).toBeTruthy();
    expect(screen.getByText(new RegExp(`line ${RESULT_LINES}$`))).toBeTruthy();
    expect(screen.queryByText(new RegExp(`line ${RESULT_LINES + 1}`))).toBeNull();
  });

  it.each([
    { where: "a call that runs", result: null, expected: "●" },
    { where: "a call that worked", result: { text: "", isError: false }, expected: "✓" },
    { where: "a call that failed", result: { text: "No such file", isError: true }, expected: "✕" },
  ])("marks $where with $expected", ({ result, expected }) => {
    renderChat(makeChat({ kind: "tool", id: "tool1", name: "Read", summary: "a.ts", input: "{}", result }));

    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("shows one line in place of a chat with no items", () => {
    renderChat(makeChat());

    expect(screen.getByText(UNAVAILABLE_NOTE)).toBeTruthy();
  });

  it("shows a poll error above the note when the chat is empty", () => {
    renderChat(makeChat(), { error: "The request timed out" });

    const rendered = JSON.stringify(screen.toJSON());
    expect(rendered).toContain("The request timed out");
    expect(rendered.indexOf("The request timed out")).toBeLessThan(rendered.indexOf(UNAVAILABLE_NOTE));
  });

  it("shows no note while the chat loads", () => {
    renderChat(null);

    expect(screen.queryByText(UNAVAILABLE_NOTE)).toBeNull();
  });
});

describe("NeedsYouBanner", () => {
  function pane(fields: Partial<Pane>): Pane {
    return { id: "t1", title: "", agent: "claude-code", state: "blocked", isFinished: false, columns: null, ...fields };
  }

  it("shows the agent's own message when it is blocked", () => {
    render(<NeedsYouBanner pane={pane({ message: "approve Bash: npm test" })} />);

    expect(screen.getByText("Needs you")).toBeTruthy();
    expect(screen.getByText("approve Bash: npm test")).toBeTruthy();
  });

  it("shows nothing when the agent is not blocked", () => {
    render(<NeedsYouBanner pane={pane({ state: "working", message: "Running tests" })} />);

    expect(screen.queryByText("Needs you")).toBeNull();
  });
});
