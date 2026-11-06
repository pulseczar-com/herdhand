import { parseDetection } from "./commands";

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
