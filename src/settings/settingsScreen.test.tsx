import { render, screen } from "@testing-library/react-native";
import { useTheme } from "expo-router";

import SettingsScreen from "../../app/settings";

jest.mock("expo-router", () => ({ useTheme: jest.fn() }));
jest.mock("expo-application", () => ({ nativeApplicationVersion: "0.1.0" }));
jest.mock("./store", () => ({ getAppLockEnabled: jest.fn().mockResolvedValue(false), saveAppLockEnabled: jest.fn() }));

const colors = { text: "#000", border: "#000", primary: "#000", background: "#fff", notification: "#f00" };

describe("the Settings screen", () => {
  it.each([
    ["dark", true, require("../../assets/pulseczar-lockup-dark.png")],
    ["light", false, require("../../assets/pulseczar-lockup-light.png")],
  ])("shows the PulseCzar lockup in About, in its %s cut", async (_name, dark, lockup) => {
    jest.mocked(useTheme).mockReturnValue({ dark, colors } as never);

    render(<SettingsScreen />);

    expect(await screen.findByLabelText("PulseCzar")).toHaveProp("source", lockup);
  });
});
