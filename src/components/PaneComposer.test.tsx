import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ScrollView } from "react-native";

import type { Backend } from "@/herdr/backend";

import { PaneComposer } from "./PaneComposer";

jest.mock("expo-router", () => ({
  useTheme: () => ({ colors: { text: "#000", border: "#000", card: "#fff", notification: "#f00" } }),
}));
jest.mock("@/navigationTheme", () => ({ getAccentInk: () => "#fff" }));

function makeBackend(sendLine: Backend["sendLine"] = jest.fn().mockResolvedValue(undefined)): Backend {
  return {
    getVersion: jest.fn(),
    listSpaces: jest.fn(),
    readPane: jest.fn(),
    sendLine,
    pressKey: jest.fn().mockResolvedValue(undefined),
  };
}

function getInput() {
  return screen.getByPlaceholderText("Run a command");
}

describe("PaneComposer", () => {
  it.each([
    { how: "the Send button", submit: () => fireEvent.press(screen.getByRole("button", { name: "Send" })) },
    { how: "the keyboard's send key", submit: () => fireEvent(getInput(), "submitEditing") },
  ])("sends the line with $how and clears the input", async ({ submit }) => {
    const backend = makeBackend();
    render(<PaneComposer backend={backend} paneId="t6" placeholder="Run a command" />);

    fireEvent.changeText(getInput(), "ls -la");
    submit();

    await waitFor(() => expect(getInput().props.value).toBe(""));
    expect(backend.sendLine).toHaveBeenCalledWith("t6", "ls -la");
  });

  it("keeps the text and shows the error when the send fails, until a send works", async () => {
    const sendLine = jest.fn().mockRejectedValueOnce(new Error("Connection closed")).mockResolvedValueOnce(undefined);
    render(<PaneComposer backend={makeBackend(sendLine)} paneId="t6" placeholder="Run a command" />);

    fireEvent.changeText(getInput(), "ls -la");
    fireEvent.press(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Could not send: Connection closed")).toBeTruthy();
    expect(getInput().props.value).toBe("ls -la");

    fireEvent.press(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(getInput().props.value).toBe(""));
    expect(screen.queryByText("Could not send: Connection closed")).toBeNull();
  });

  it("keeps text typed while the send is going", async () => {
    let finishSend: () => void = () => {};
    const sendLine = jest.fn(() => new Promise<void>((resolve) => (finishSend = resolve)));
    render(<PaneComposer backend={makeBackend(sendLine)} paneId="t6" placeholder="Run a command" />);

    fireEvent.changeText(getInput(), "ls");
    fireEvent.press(screen.getByRole("button", { name: "Send" }));
    fireEvent.changeText(getInput(), "pwd");
    finishSend();

    await waitFor(() => expect(screen.getByRole("button", { name: "Send" }).props.accessibilityState?.disabled).toBeFalsy());
    expect(getInput().props.value).toBe("pwd");
  });

  it("shows the error when a key press fails, until a key press works", async () => {
    const backend = makeBackend();
    (backend.pressKey as jest.Mock).mockRejectedValueOnce(new Error("Connection closed")).mockResolvedValueOnce(undefined);
    render(<PaneComposer backend={backend} paneId="t6" placeholder="Run a command" />);

    fireEvent.press(screen.getByRole("button", { name: "Control C" }));

    expect(await screen.findByText("Could not send: Connection closed")).toBeTruthy();

    // The key press is async: act waits for it, so the check does not race the next render.
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Control C" })));

    expect(screen.queryByText("Could not send: Connection closed")).toBeNull();
  });

  it("does not send an empty line", () => {
    const backend = makeBackend();
    render(<PaneComposer backend={backend} paneId="t6" placeholder="Run a command" />);

    fireEvent.press(screen.getByRole("button", { name: "Send" }));
    fireEvent(getInput(), "submitEditing");

    expect(backend.sendLine).not.toHaveBeenCalled();
  });

  it("sends a line once while it is still going", () => {
    const backend = makeBackend(jest.fn(() => new Promise<void>(() => {})));
    render(<PaneComposer backend={backend} paneId="t6" placeholder="Run a command" />);

    fireEvent.changeText(getInput(), "ls -la");
    fireEvent.press(screen.getByRole("button", { name: "Send" }));
    fireEvent(getInput(), "submitEditing");

    expect(backend.sendLine).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: "Control C", key: "ctrl+c" },
    { label: "Escape", key: "esc" },
    { label: "Up", key: "up" },
    { label: "Enter", key: "enter" },
    { label: "Tab", key: "tab" },
    { label: "1", key: "1" },
    { label: "3", key: "3" },
    { label: "6", key: "6" },
  ])("presses $key when $label is tapped", ({ label, key }) => {
    const backend = makeBackend();
    render(<PaneComposer backend={backend} paneId="t6" placeholder="Run a command" />);

    fireEvent.press(screen.getByRole("button", { name: label }));

    expect(backend.pressKey).toHaveBeenCalledWith("t6", key);
  });

  // A question has at most four options, then "Type something" and "Chat about this".
  it("has no digit keys beyond 1 to 6", () => {
    render(<PaneComposer backend={makeBackend()} paneId="t6" placeholder="Run a command" />);

    expect(screen.queryByRole("button", { name: /^[07-9]$/ })).toBeNull();
  });

  it("shows exactly these keys, in this order, in rows that do not scroll", () => {
    render(<PaneComposer backend={makeBackend()} paneId="t6" placeholder="Run a command" />);

    const names = screen.getAllByRole("button").map((button) => button.props.accessibilityLabel);

    expect(names).toEqual(["Escape", "Control C", "Tab", "Up", "Down", "Enter", "1", "2", "3", "4", "5", "6", "Send"]);
    expect(screen.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
  });

  it("shows the placeholder it is given", () => {
    render(<PaneComposer backend={makeBackend()} paneId="t6" placeholder="Message the agent" />);

    expect(screen.getByPlaceholderText("Message the agent")).toBeTruthy();
  });
});
