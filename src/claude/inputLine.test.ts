import { hideClaudeInput } from "./inputLine";

const RULE = "─".repeat(40);
const FOOTER = "  ⏵⏵ accept edits on (shift+tab to cycle)";

describe("hideClaudeInput", () => {
  it.each([
    ["the suggestion in the input box", ["● Done.", RULE, "❯ merge #9", RULE, FOOTER], ["● Done.", RULE, "❯", RULE, FOOTER]],
    ["an empty input box", ["● Done.", RULE, "❯ ", RULE], ["● Done.", RULE, "❯", RULE]],
    ["a box with no footer and trailing spaces", [RULE, "❯ merge #9   ", `${RULE}  `], [RULE, "❯", `${RULE}  `]],
    ["only the last box", [RULE, "❯ earlier", RULE, "● Done.", RULE, "❯ merge #9", RULE], [RULE, "❯ earlier", RULE, "● Done.", RULE, "❯", RULE]],
  ])("hides %s", (_case, lines, expected) => {
    expect(hideClaudeInput(lines.join("\n"))).toBe(expected.join("\n"));
  });

  it.each([
    ["no box", ["● Done.", "❯ merge #9"]],
    ["one divider", ["● Done.", RULE, "❯ merge #9"]],
    ["two lines in the box", [RULE, "❯ a long message that", "  wraps", RULE]],
    ["a box line with no prompt", [RULE, "> merge #9", RULE]],
    ["a divider with a label", [RULE, "❯ merge #9", `${RULE} plan ${RULE}`]],
    ["a divider that is too short", ["───", "❯ merge #9", "───"]],
  ])("changes nothing with %s", (_case, lines) => {
    const text = lines.join("\n");
    expect(hideClaudeInput(text)).toBe(text);
  });
});
