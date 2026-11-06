/** The two Herdr front ends the app can talk to. The desktop app comes first: it is the default. */
export const HERDR_KINDS = ["desktop", "tui"] as const;

export type HerdrKind = (typeof HERDR_KINDS)[number];

export const KIND_LABELS: Record<HerdrKind, string> = {
  desktop: "Herdr App",
  tui: "Herdr TUI",
};
