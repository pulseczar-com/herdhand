import { DarkTheme, DefaultTheme, type Theme } from "expo-router";

// PulseCzar green is the one accent. Light mode uses PulseCzar's darker chrome green, because white
// on its brand green #17924F is below the 4.5:1 text contrast.
export const LIGHT_THEME: Theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: "#2E7D4F" } };
export const DARK_THEME: Theme = { ...DarkTheme, colors: { ...DarkTheme.colors, primary: "#3DDC84" } };

// White on the dark-mode green is 1.78:1, so text on it uses PulseCzar's near-black ground.
const DARK_ACCENT_INK = "#0A0D0C";
const LIGHT_ACCENT_INK = "#ffffff";

/** The color for text and icons drawn on the accent, such as a button label. */
export function getAccentInk(theme: Theme): string {
  return theme.dark ? DARK_ACCENT_INK : LIGHT_ACCENT_INK;
}
