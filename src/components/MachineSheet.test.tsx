import { act, fireEvent, render, screen } from "@testing-library/react-native";

import type { Backend } from "@/herdr/backend";
import type { HerdrKind } from "@/herdr/kinds";
import type { Machine } from "@/machines/store";
import type { ConnectionStatus } from "@/machines/useMachineConnection";
import type { HostReader } from "@/ssh/hostReader";

import { MachineSheet } from "./MachineSheet";

jest.mock("expo-router", () => ({
  useTheme: () => ({ dark: false, colors: { text: "#000", border: "#000", background: "#fff", card: "#fff", primary: "#00f" } }),
}));

const machine: Machine = { id: "m1", name: "test-box", host: "test-box.example.com", port: 22, user: "test-user" };

function connected(kind: HerdrKind, availableKinds: HerdrKind[]): ConnectionStatus {
  return { phase: "connected", kind, availableKinds, version: "0.1.17", backend: {} as Backend, host: {} as HostReader };
}

function makeActions() {
  return { edit: jest.fn(), reconnect: jest.fn(), remove: jest.fn(), switchKind: jest.fn() };
}

/** Renders the sheet, then lets the icon fonts finish loading, which updates the icons once. */
async function renderSheet(status: ConnectionStatus, actions = makeActions(), onClose = jest.fn()) {
  render(<MachineSheet machine={machine} status={status} onClose={onClose} actions={actions} />);
  await act(async () => {});
  return { actions, onClose };
}

describe("MachineSheet", () => {
  it("closes the sheet and starts the edit when Edit is tapped", async () => {
    const { actions, onClose } = await renderSheet(connected("desktop", ["desktop"]));

    fireEvent.press(screen.getByText("Edit"));

    expect(onClose).toHaveBeenCalled();
    expect(actions.edit).toHaveBeenCalledTimes(1);
  });

  it("offers Edit before the machine has connected", async () => {
    await renderSheet({ phase: "connecting" });

    expect(screen.getByText("Edit")).toBeTruthy();
  });

  it.each<{ installed: string; availableKinds: HerdrKind[]; label: string }>([
    { installed: "only the app", availableKinds: ["desktop"], label: "Herdr App 0.1.17" },
    { installed: "only the TUI", availableKinds: ["tui"], label: "Herdr TUI 0.1.17" },
  ])("shows no kind toggle when $installed is installed", async ({ availableKinds, label }) => {
    await renderSheet(connected(availableKinds[0], availableKinds));

    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByText(`test-user@test-box.example.com · ${label}`)).toBeTruthy();
  });

  it("shows the kind toggle, named Herdr App and Herdr TUI, when both are installed", async () => {
    const { actions } = await renderSheet(connected("desktop", ["desktop", "tui"]));

    expect(screen.getAllByRole("radio").map((option) => option.props.accessibilityState.selected)).toEqual([true, false]);
    fireEvent.press(screen.getByText("Herdr TUI"));
    expect(actions.switchKind).toHaveBeenCalledWith("tui");
  });
});
