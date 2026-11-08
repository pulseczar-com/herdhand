import { render, screen } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { ActivityIndicator } from "react-native";

import type { ShellBlock } from "@/shell/blocks";

import { ShellChat } from "./ShellChat";

jest.mock("expo-router", () => ({
  useTheme: () => ({ dark: true, colors: { text: "#eee", border: "#333", card: "#111", background: "#000", notification: "#f00" } }),
}));

const done = (command: string, output: string, isCut = false): ShellBlock => ({ id: 0, command, baseline: "", sentAtRead: 0, output, isCut });

function renderShell(props: Partial<ComponentProps<typeof ShellChat>> = {}) {
  render(<ShellChat blocks={[]} opening="$ " isRunning={false} text="$ " error={null} {...props} />);
}

describe("ShellChat", () => {
  it("shows the pane as it was on open, as one plain block", () => {
    renderShell({ opening: "demo@test-box:~$ ls\nREADME.md\ndemo@test-box:~$ " });

    expect(screen.getByText("demo@test-box:~$ ls\nREADME.md\ndemo@test-box:~$")).toBeTruthy();
  });

  it("shows each command as a bubble with its output under it", () => {
    renderShell({ blocks: [done("ls", "README.md\nsrc")] });

    expect(screen.getByText("ls")).toBeTruthy();
    expect(screen.getByText("README.md\nsrc")).toBeTruthy();
    expect(screen.queryByTestId("screen-card")).toBeNull();
  });

  it("says a running command runs, and ends the chat with the live screen", () => {
    const running: ShellBlock = { id: 0, command: "vim notes.txt", baseline: "", sentAtRead: 0, output: null, isCut: false };
    renderShell({ blocks: [running], isRunning: true, text: "-- INSERT --" });

    expect(screen.getByText("Running…")).toBeTruthy();
    expect(screen.getByTestId("screen-card")).toBeTruthy();
    expect(screen.getByText("-- INSERT --")).toBeTruthy();
  });

  it("shows no output box for a command that printed nothing", () => {
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
});
