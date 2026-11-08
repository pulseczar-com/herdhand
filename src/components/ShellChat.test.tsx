import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import type { ReactTestInstance } from "react-test-renderer";

import type { ShellBlock } from "@/shell/blocks";

import { READ_LINES } from "@/herdr/backend";
import { SCREEN_LINES } from "./ScreenCard";
import { ShellChat } from "./ShellChat";

jest.mock("expo-router", () => ({
  useTheme: () => ({ dark: true, colors: { text: "#eee", border: "#333", card: "#111", background: "#000", notification: "#f00" } }),
}));

const done = (command: string, output: string, isCut = false): ShellBlock => ({ id: 0, command, baseline: "", sentAtRead: 0, output, isCut });

/** Whether the element or any element around it draws a border or a background. */
function isInBox(element: ReactTestInstance | null): boolean {
  for (let node = element; node; node = node.parent) {
    const style = StyleSheet.flatten(node.props.style);
    if (style?.borderWidth || style?.backgroundColor) return true;
  }
  return false;
}

function renderShell(props: Partial<ComponentProps<typeof ShellChat>> = {}) {
  render(<ShellChat blocks={[]} opening="$ " isRunning={false} text="$ " error={null} {...props} />);
}

describe("ShellChat", () => {
  it("shows the pane as it was on open, as one plain block", () => {
    renderShell({ opening: "demo@test-box:~$ ls\nREADME.md\ndemo@test-box:~$ " });

    expect(screen.getByText("demo@test-box:~$ ls\nREADME.md\ndemo@test-box:~$")).toBeTruthy();
  });

  it("shows the whole pane as it was on open, not only its last lines, so it scrolls back", () => {
    const lines = Array.from({ length: SCREEN_LINES + 1 }, (_, index) => `line ${index + 1}`);
    renderShell({ opening: [...lines, "$ "].join("\n") });

    expect(screen.getByText([...lines, "$"].join("\n"))).toBeTruthy();
  });

  it("shows each command as a bubble with its output under it as plain text, with no box", () => {
    renderShell({ blocks: [done("ls", "README.md\nsrc")] });

    expect(isInBox(screen.getByText("ls"))).toBe(true);
    expect(isInBox(screen.getByText("README.md\nsrc"))).toBe(false);
  });

  it("says a running command runs, and ends the chat with the live screen as plain text that scrolls with it", () => {
    const running: ShellBlock = { id: 0, command: "vim notes.txt", baseline: "", sentAtRead: 0, output: null, isCut: false };
    renderShell({ blocks: [running], isRunning: true, text: "-- INSERT --" });

    expect(screen.getByText("Running…")).toBeTruthy();
    expect(within(screen.getByTestId("shell-chat")).getByText("-- INSERT --")).toBeTruthy();
  });

  it("shows the whole pane, so it scrolls back, while a program that held the foreground on open runs", () => {
    const lines = Array.from({ length: SCREEN_LINES + 1 }, (_, index) => `npm run dev: line ${index + 1}`);
    renderShell({ opening: null, isRunning: true, text: lines.join("\n") });

    expect(within(screen.getByTestId("shell-chat")).getByText(lines.join("\n"))).toBeTruthy();
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  });

  it("shows the whole output of a running command from the phone, so it scrolls back", () => {
    const running: ShellBlock = { id: 0, command: "npm run build", baseline: "$ ", sentAtRead: 0, output: null, isCut: false };
    const lines = Array.from({ length: SCREEN_LINES + 25 }, (_, index) => `build step ${index + 1}`);
    renderShell({ blocks: [running], isRunning: true, text: ["$ npm run build", ...lines].join("\n") });

    expect(within(screen.getByTestId("shell-chat")).getByText(lines.join("\n"))).toBeTruthy();
  });

  it("shows only the end of the screen of a command typed on the machine", () => {
    const lines = Array.from({ length: SCREEN_LINES + 25 }, (_, index) => `server line ${index + 1}`);
    renderShell({ isRunning: true, text: ["$ npm run dev", ...lines].join("\n") });

    expect(screen.getByText(lines.slice(-SCREEN_LINES).join("\n"))).toBeTruthy();
  });

  it("shows the whole pane with a cut note when the output has pushed the command line out of the read", () => {
    const running: ShellBlock = { id: 0, command: "npm run dev", baseline: "$ ", sentAtRead: 0, output: null, isCut: false };
    const lines = Array.from({ length: READ_LINES }, (_, index) => `server line ${index + 1}`);
    renderShell({ blocks: [running], isRunning: true, text: lines.join("\n") });

    expect(within(screen.getByTestId("shell-chat")).getByText(lines.join("\n"))).toBeTruthy();
    expect(screen.getByText(`Cut to the last ${READ_LINES} lines.`)).toBeTruthy();
  });

  it("shows no output for a command that printed nothing", () => {
    renderShell({ opening: "", blocks: [done("true", "")] });

    expect(screen.getByText("true")).toBeTruthy();
    expect(screen.queryByText("Running…")).toBeNull();
  });

  it("says when the output was cut", () => {
    renderShell({ blocks: [done("make", "line", true)] });

    expect(screen.getByText("Cut to the last 200 lines.")).toBeTruthy();
  });

  it("shows a loader until the pane is read, and the error when the read fails", () => {
    renderShell({ opening: null, text: null });
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeTruthy();

    renderShell({ opening: null, text: null, error: "Could not read the pane: Connection closed" });
    expect(screen.getByText("Could not read the pane: Connection closed")).toBeTruthy();
  });

  describe("following the end", () => {
    // A frame runs when time moves on; the scroll command waits one frame.
    const FRAME_MS = 16;
    const makeScrollEvent = (offsetY: number) => ({
      nativeEvent: { contentOffset: { x: 0, y: offsetY }, contentSize: { width: 400, height: 2000 }, layoutMeasurement: { width: 400, height: 600 } },
    });

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function renderScrolledShell() {
      renderShell();
      const scrollView = screen.UNSAFE_getAllByType(ScrollView).find((view) => view.props.testID === "shell-chat")!;
      act(() => jest.advanceTimersByTime(FRAME_MS));
      jest.mocked(scrollView.instance.scrollToEnd).mockClear();
      return scrollView;
    }

    it("does not pull the view back to the end while a fling that began near the end carries it up", () => {
      const scrollView = renderScrolledShell();
      const shell = screen.getByTestId("shell-chat");

      // A short flick releases within the slack of the end, then the momentum starts.
      fireEvent(shell, "scrollEndDrag", makeScrollEvent(1390));
      fireEvent(shell, "momentumScrollBegin");
      fireEvent(shell, "contentSizeChange", 400, 2100);
      act(() => jest.advanceTimersByTime(FRAME_MS));

      expect(scrollView.instance.scrollToEnd).not.toHaveBeenCalled();
    });
  });
});
