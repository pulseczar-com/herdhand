import { BRIDGE_COMMANDS, EVENTS_COMMANDS, parseDetection } from "./commands";

describe("parseDetection", () => {
  it.each([
    { name: "both", output: "hc\nherdr-api-bridge-v1\n", expected: ["desktop", "tui"] },
    { name: "the desktop app only", output: "hc\n", expected: ["desktop"] },
    { name: "the TUI only", output: "herdr-api-bridge-v1\n", expected: ["tui"] },
    { name: "neither", output: "", expected: [] },
    { name: "a herdr with no bridge", output: "error: unknown command\n", expected: [] },
    { name: "\\r\\n line ends", output: "hc\r\nherdr-api-bridge-v1\r\n", expected: ["desktop", "tui"] },
  ])("finds $name", ({ output, expected }) => {
    expect(parseDetection(output)).toEqual(expected);
  });
});

describe("EVENTS_COMMANDS", () => {
  it("keeps one subscription open on the TUI's bridge, with no request loop", () => {
    expect(EVENTS_COMMANDS.tui).toContain("exec herdr remote-api-bridge");
    expect(EVENTS_COMMANDS.tui).not.toContain("while");
  });

  it("uses the desktop app's connect command for events too", () => {
    expect(EVENTS_COMMANDS.desktop).toBe(BRIDGE_COMMANDS.desktop);
  });
});
