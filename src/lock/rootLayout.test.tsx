import { renderRouter, screen } from "expo-router/testing-library";
import type { ReactNode } from "react";
import { Text } from "react-native";

import RootLayout from "../../app/_layout";

import { type LockState, useAppLock } from "./useAppLock";

jest.mock("./useAppLock", () => ({ useAppLock: jest.fn() }));
// These tests are about the app under the cover, not the cover.
jest.mock("./LockScreen", () => ({ LockScreen: () => null }));
jest.mock("@/machines/MachineConnection", () => ({
  MachinesProvider: ({ children }: { children: ReactNode }) => children,
}));

function renderApp(state: LockState) {
  jest.mocked(useAppLock).mockReturnValue({ state, unlock: jest.fn() });
  renderRouter({ _layout: RootLayout, index: () => <Text>Pane text</Text> });
}

describe("RootLayout", () => {
  it.each<LockState>(["locked", "checking"])("hides the app from screen readers while %s", (state) => {
    renderApp(state);

    expect(screen.queryByText("Pane text")).toBeNull();
    expect(screen.getByText("Pane text", { includeHiddenElements: true })).toBeTruthy();
  });

  it("shows the app to screen readers once unlocked", () => {
    renderApp("unlocked");

    expect(screen.getByText("Pane text")).toBeTruthy();
  });
});
