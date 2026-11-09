import { fireEvent, render, screen } from "@testing-library/react-native";
import { useTheme } from "expo-router";
import { Linking } from "react-native";

import SettingsScreen from "../../app/settings";

import { getPhoneKey } from "@/ssh/pairing";

jest.mock("expo-router", () => ({ useTheme: jest.fn() }));
jest.mock("expo-application", () => ({ nativeApplicationVersion: "0.1.0" }));
jest.mock("@/ssh/pairing", () => ({ getPhoneKey: jest.fn() }));
jest.mock("./store", () => ({ getAppLockEnabled: jest.fn().mockResolvedValue(false), saveAppLockEnabled: jest.fn() }));

const colors = { text: "#000", border: "#000", primary: "#000", background: "#fff", notification: "#f00" };

describe("the Settings screen", () => {
  beforeEach(() => {
    jest.mocked(useTheme).mockReturnValue({ dark: false, colors } as never);
    jest.mocked(getPhoneKey).mockResolvedValue({
      line: "ecdsa-sha2-nistp256 AAAA herdhand-Pixel-8-2026-11-07",
      comment: "herdhand-Pixel-8-2026-11-07",
      fingerprint: "SHA256:phone",
    });
  });

  it("shows the phone key's name and fingerprint, to find it on a machine", async () => {
    render(<SettingsScreen />);

    expect(await screen.findByText("herdhand-Pixel-8-2026-11-07")).toBeTruthy();
    expect(screen.getByText("SHA256:phone")).toBeTruthy();
  });

  it("says why the phone key is not available", async () => {
    jest.mocked(getPhoneKey).mockRejectedValue(new Error("Keystore is locked"));

    render(<SettingsScreen />);

    expect(await screen.findByText("The phone key is not available: Keystore is locked")).toBeTruthy();
  });

  it.each([
    ["dark", true, require("../../assets/pulseczar-lockup-dark.png")],
    ["light", false, require("../../assets/pulseczar-lockup-light.png")],
  ])("shows the PulseCzar lockup in About, in its %s cut", async (_name, dark, lockup) => {
    jest.mocked(useTheme).mockReturnValue({ dark, colors } as never);

    render(<SettingsScreen />);

    expect(await screen.findByLabelText("PulseCzar")).toHaveProp("source", lockup);
  });

  it("opens the privacy policy in the browser", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);

    render(<SettingsScreen />);
    fireEvent.press(await screen.findByText("Privacy policy"));

    expect(openURL).toHaveBeenCalledWith("https://pulseczar.com/herdhand/privacy");
  });
});
