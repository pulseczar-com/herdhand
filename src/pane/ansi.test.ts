import { parseStyledText } from "./ansi";

const ESC = "\x1b";

describe("parseStyledText", () => {
  it.each([
    {
      name: "a dim hint after a prompt",
      raw: `❯ ${ESC}[0m${ESC}[2mTry "edit bridge.ts to..."${ESC}[0m`,
      text: '❯ Try "edit bridge.ts to..."',
      dim: { '❯ Try "edit bridge.ts to..."': [{ text: "❯ ", isDim: false }, { text: 'Try "edit bridge.ts to..."', isDim: true }] },
    },
    {
      name: "a dim color span in a footer",
      raw: `Haiku ${ESC}[2m${ESC}[38;2;153;153;153mmedium${ESC}[0m · 0/300k`,
      text: "Haiku medium · 0/300k",
      dim: {
        "Haiku medium · 0/300k": [
          { text: "Haiku ", isDim: false },
          { text: "medium", isDim: true },
          { text: " · 0/300k", isDim: false },
        ],
      },
    },
    { name: "a truecolor code, not dim", raw: `${ESC}[38;2;136;136;136mgray${ESC}[0m`, text: "gray", dim: {} },
    { name: "a 256-color code, not dim", raw: `${ESC}[38;5;2mgreen${ESC}[0m`, text: "green", dim: {} },
    { name: "a 256-color background, not dim", raw: `${ESC}[48;5;2mgreen${ESC}[0m`, text: "green", dim: {} },
    {
      name: "22 ending the dim",
      raw: `${ESC}[2mfaint${ESC}[22m normal`,
      text: "faint normal",
      dim: { "faint normal": [{ text: "faint", isDim: true }, { text: " normal", isDim: false }] },
    },
    {
      name: "dim and bold together, then a reset",
      raw: `${ESC}[1;2mboth${ESC}[m after`,
      text: "both after",
      dim: { "both after": [{ text: "both", isDim: true }, { text: " after", isDim: false }] },
    },
    { name: "an OSC 8 hyperlink with BEL", raw: `${ESC}]8;;https://example.com\x07link${ESC}]8;;\x07`, text: "link", dim: {} },
    { name: "an OSC 8 hyperlink with ST", raw: `${ESC}]8;;https://example.com${ESC}\\link${ESC}]8;;${ESC}\\`, text: "link", dim: {} },
    { name: "a two-character escape", raw: `${ESC}7saved${ESC}8`, text: "saved", dim: {} },
    { name: "an unfinished CSI at the end, only its ESC dropped", raw: `done${ESC}[38;2`, text: "done[38;2", dim: {} },
    { name: "text with no escapes", raw: "dev@test-box:~$ ls\nREADME.md", text: "dev@test-box:~$ ls\nREADME.md", dim: {} },
  ])("reads $name", ({ raw, text, dim }) => {
    const parsed = parseStyledText(raw);

    expect(parsed.text).toBe(text);
    expect(Object.fromEntries(parsed.dimLines)).toEqual(dim);
  });

  it("keeps the dim across lines and trims trailing spaces from the last segment", () => {
    const parsed = parseStyledText(`${ESC}[2mone  \ntwo   ${ESC}[0m\nthree`);

    expect(parsed.text).toBe("one  \ntwo   \nthree");
    expect(Object.fromEntries(parsed.dimLines)).toEqual({ one: [{ text: "one", isDim: true }], two: [{ text: "two", isDim: true }] });
  });
});
