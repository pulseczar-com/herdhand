import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import type { Block } from "@/pane/reformat";

import { getDimColor, PaneBlocks } from "./PaneBlocks";

jest.mock("expo-router", () => ({
  useTheme: () => ({ colors: { text: "rgb(10, 20, 30)", border: "#000", card: "#fff", notification: "#f00" } }),
}));

function getFontFamily(text: string) {
  return StyleSheet.flatten(screen.getByText(text).props.style).fontFamily;
}

describe("PaneBlocks", () => {
  it("shows a paragraph's text in the proportional font and its prefix in monospace", () => {
    const blocks: Block[] = [
      { kind: "lines", lines: ["a line"] },
      { kind: "paragraph", prefix: "● ", text: "joined words" },
    ];
    render(<PaneBlocks blocks={blocks} />);

    expect(getFontFamily("joined words")).toBeUndefined();
    expect(getFontFamily("● ")).toBe("monospace");
    expect(getFontFamily("a line")).toBe("monospace");
  });

  it("shows a labeled rule's label in monospace, dimmed", () => {
    const blocks: Block[] = [{ kind: "rule", label: "done", isLabelFirst: false }];
    render(<PaneBlocks blocks={blocks} />);

    const style = StyleSheet.flatten(screen.getByText("done").props.style);
    expect(style.opacity).toBe(0.6);
    expect(style.fontFamily).toBe("monospace");
  });

  it("shows dim segments of a line at half opacity and the others as they are", () => {
    const dimLines = new Map([["❯ hint", [{ text: "❯ ", isDim: false }, { text: "hint", isDim: true }]]]);
    render(<PaneBlocks blocks={[{ kind: "lines", lines: ["before", "❯ hint"] }]} dimLines={dimLines} />);

    expect(StyleSheet.flatten(screen.getByText("hint").props.style).color).toBe("rgba(10, 20, 30, 0.5)");
    // A plain segment sets no color, so it takes the line's text color.
    expect(screen.getByText("❯ ").props.style).toBeUndefined();
  });
});

describe("getDimColor", () => {
  it.each([
    { color: "rgb(10, 20, 30)", dim: "rgba(10, 20, 30, 0.5)" },
    { color: "rgb(255,255,255)", dim: "rgba(255, 255, 255, 0.5)" },
    { color: "#ffffff", dim: "#ffffff" },
    { color: "rgba(1, 2, 3, 0.9)", dim: "rgba(1, 2, 3, 0.9)" },
  ])("turns $color into $dim", ({ color, dim }) => {
    expect(getDimColor(color)).toBe(dim);
  });
});
