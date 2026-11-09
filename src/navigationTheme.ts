import { DarkTheme, DefaultTheme, type Theme } from "expo-router";

// The brand green is the one accent. Light mode uses a darker chrome green, because white
// on its brand green #17924F is below the 4.5:1 text contrast.
const LIGHT_ACCENT = "#2E7D4F";
const DARK_ACCENT = "#3DDC84";
export const LIGHT_THEME: Theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: LIGHT_ACCENT } };
export const DARK_THEME: Theme = { ...DarkTheme, colors: { ...DarkTheme.colors, primary: DARK_ACCENT } };

/** The accent as text, for a color that needs a transparency added to it. */
export function getAccentColor(theme: Theme): string {
  return theme.dark ? DARK_ACCENT : LIGHT_ACCENT;
}

// White on the dark-mode green is 1.78:1, so text on it uses the brand near-black ground.
const DARK_ACCENT_INK = "#0A0D0C";
const LIGHT_ACCENT_INK = "#ffffff";

/** The color for text and icons drawn on the accent, such as a button label. */
export function getAccentInk(theme: Theme): string {
  return theme.dark ? DARK_ACCENT_INK : LIGHT_ACCENT_INK;
}
