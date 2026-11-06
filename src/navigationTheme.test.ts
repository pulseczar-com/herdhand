import { DARK_THEME, getAccentInk, LIGHT_THEME } from "./navigationTheme";

// WCAG's minimum contrast for normal-size text.
const MIN_TEXT_CONTRAST = 4.5;

function getChannelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function getRelativeLuminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  return 0.2126 * getChannelLuminance(red) + 0.7152 * getChannelLuminance(green) + 0.0722 * getChannelLuminance(blue);
}

function getContrast(first: string, second: string): number {
  const [darker, lighter] = [getRelativeLuminance(first), getRelativeLuminance(second)].sort((a, b) => a - b);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("the navigation themes", () => {
  it.each([
    ["light", LIGHT_THEME],
    ["dark", DARK_THEME],
  ])("keep text on the %s accent readable", (_name, theme) => {
    const contrast = getContrast(getAccentInk(theme), theme.colors.primary as string);

    expect(contrast).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });
});
