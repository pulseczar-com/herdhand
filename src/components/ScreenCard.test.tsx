import { render, screen } from "@testing-library/react-native";

import { getScreenTail, SCREEN_LINES, ScreenCard } from "./ScreenCard";

jest.mock("expo-router", () => ({
  useTheme: () => ({ dark: true, colors: { text: "#eee", border: "#333", card: "#111", background: "#000" } }),
}));

describe("getScreenTail", () => {
  it.each([
    { where: "a short screen", text: "a\nb", expected: "a\nb" },
    { where: "blank lines at the end", text: "a\nb\n\n  \n", expected: "a\nb" },
    { where: "style codes", text: "\x1b[1mTrust this folder?\x1b[0m", expected: "Trust this folder?" },
  ])("keeps $where", ({ text, expected }) => {
    expect(getScreenTail(text)).toBe(expected);
  });

  it("keeps the last lines of a long screen", () => {
    const text = Array.from({ length: SCREEN_LINES + 5 }, (_, index) => `line ${index + 1}`).join("\n");

    const lines = getScreenTail(text).split("\n");

    expect(lines).toHaveLength(SCREEN_LINES);
    expect(lines[0]).toBe("line 6");
    expect(lines.at(-1)).toBe(`line ${SCREEN_LINES + 5}`);
  });
});

describe("ScreenCard", () => {
  it("shows the end of the screen", () => {
    render(<ScreenCard text={"Welcome\nDo you trust this folder?\n1. Yes\n2. No"} />);

    expect(screen.getByText(/Do you trust this folder\?/)).toBeTruthy();
    expect(screen.getByText(/2\. No/)).toBeTruthy();
  });
});
