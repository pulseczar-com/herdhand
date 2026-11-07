import { render, screen } from "@testing-library/react-native";

import type { Pane } from "@/herdr/backend";

import { NeedsYouBanner } from "./NeedsYouBanner";

jest.mock("expo-router", () => ({
  useTheme: () => ({ dark: true, colors: { text: "#eee", border: "#333", card: "#111", background: "#000", notification: "#f00" } }),
}));

function pane(fields: Partial<Pane>): Pane {
  return { id: "t1", title: "", agent: "claude-code", state: "blocked", isFinished: false, columns: null, ...fields };
}

describe("NeedsYouBanner", () => {
  it("shows the agent's own message when it is blocked", () => {
    render(<NeedsYouBanner pane={pane({ message: "approve Bash: npm test" })} />);

    expect(screen.getByText("Needs you")).toBeTruthy();
    expect(screen.getByText("approve Bash: npm test")).toBeTruthy();
  });

  it.each([
    { blockedKind: "question", title: "Needs you · Question" },
    { blockedKind: "permission", title: "Needs you · Permission" },
    { blockedKind: "auth", title: "Needs you · Sign-in" },
  ] as const)("says what the agent waits for: $blockedKind", ({ blockedKind, title }) => {
    render(<NeedsYouBanner pane={pane({ blockedKind, message: "Pick one" })} />);

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText("Pick one")).toBeTruthy();
  });

  it("shows nothing when the agent is not blocked", () => {
    render(<NeedsYouBanner pane={pane({ state: "working", message: "Running tests" })} />);

    expect(screen.queryByText(/Needs you/)).toBeNull();
  });

  it("shows nothing before the pane is read", () => {
    render(<NeedsYouBanner pane={null} />);

    expect(screen.queryByText(/Needs you/)).toBeNull();
  });
});
