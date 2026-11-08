import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import type { Backend } from "@/herdr/backend";
import type { PendingQuestion } from "@/claude/question";

import { AnswerCard } from "./AnswerCard";

jest.mock("expo-router", () => ({
  useTheme: () => ({ dark: true, colors: { text: "#eee", border: "#333", card: "#111", background: "#000", notification: "#f00" } }),
}));

jest.mock("@/navigationTheme", () => ({ getAccentInk: () => "#fff" }));

const SCREEN = "Which branch?\n 1. main\n 2. dev\n 3. Type something.";
const SINGLE: PendingQuestion = { id: "q1", question: "Which branch?", multiSelect: false, options: ["main", "dev"] };
const MULTI: PendingQuestion = { ...SINGLE, multiSelect: true, options: ["main", "dev", "docs"] };

function makeBackend(screenText = SCREEN): Backend {
  return {
    getVersion: jest.fn(),
    listSpaces: jest.fn(),
    readPane: jest.fn().mockResolvedValue(screenText),
    sendLine: jest.fn(),
    pressKey: jest.fn().mockResolvedValue(undefined),
  };
}

function renderCard(backend: Backend, question = SINGLE, onDone = jest.fn()) {
  render(<AnswerCard backend={backend} paneId="t1" question={question} onDone={onDone} />);
  return { onDone };
}

describe("AnswerCard", () => {
  it("shows the question and a button for each option", () => {
    renderCard(makeBackend());

    expect(screen.getByText("Which branch?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "main" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "dev" })).toBeTruthy();
  });

  it("sends the option's digit once the screen still shows its label", async () => {
    const backend = makeBackend();
    renderCard(backend);

    fireEvent.press(screen.getByRole("button", { name: "dev" }));

    await waitFor(() => expect(backend.pressKey).toHaveBeenCalledWith("t1", "2"));
    expect(backend.pressKey).toHaveBeenCalledTimes(1);
  });

  it("tells the caller the question is done once the keys are sent", async () => {
    const { onDone } = renderCard(makeBackend());

    fireEvent.press(screen.getByRole("button", { name: "dev" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("sends no key and asks for the screen when the label is gone", async () => {
    const backend = makeBackend("❯ npm test");
    const { onDone } = renderCard(backend);

    fireEvent.press(screen.getByRole("button", { name: "dev" }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(backend.pressKey).not.toHaveBeenCalled();
  });

  it("sends the digits of the picked options, then Tab and 1, for a question with several answers", async () => {
    const backend = makeBackend(`${SCREEN}\n 3. docs`);
    renderCard(backend, MULTI);

    fireEvent.press(screen.getByRole("button", { name: "docs" }));
    fireEvent.press(screen.getByRole("button", { name: "main" }));
    expect(backend.pressKey).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole("button", { name: "Send answer" }));

    await waitFor(() => expect(backend.pressKey).toHaveBeenCalledTimes(4));
    expect(jest.mocked(backend.pressKey).mock.calls.map(([, key]) => key)).toEqual(["1", "3", "tab", "1"]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Send answer" }).props.accessibilityState.disabled).toBe(true));
  });

  it("lets a picked option be unpicked, and sends nothing with none picked", async () => {
    const backend = makeBackend();
    renderCard(backend, MULTI);

    fireEvent.press(screen.getByRole("button", { name: "main" }));
    fireEvent.press(screen.getByRole("button", { name: "main" }));

    expect(screen.getByRole("button", { name: "Send answer" }).props.accessibilityState.disabled).toBe(true);
  });

  it("shows the error when a key does not send", async () => {
    const backend = makeBackend();
    jest.mocked(backend.pressKey).mockRejectedValue(new Error("timed out"));
    const { onDone } = renderCard(backend);

    fireEvent.press(screen.getByRole("button", { name: "main" }));

    expect(await screen.findByText("Could not send: timed out")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
});
