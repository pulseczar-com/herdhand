import { type Block, reformatPane } from "./reformat";

// A phone in portrait shows about 44 columns of the monospace pane text.
const PHONE_COLUMNS = 44;

// The pane's width in columns, as Herdr reports it.
const PANE_COLUMNS = 40;
// A pane wider than every line of the shell screen below.
const WIDE_PANE_COLUMNS = 120;

const lines = (...text: string[]): Block => ({ kind: "lines", lines: text });
const paragraph = (prefix: string, text: string): Block => ({ kind: "paragraph", prefix, text });
const rule: Block = { kind: "rule", label: null, isLabelFirst: false };
const labeledRule = (label: string, isLabelFirst: boolean): Block => ({ kind: "rule", label, isLabelFirst });

// The text of each line the blocks show, before the phone wraps it: one for each line that did not join.
function getShownLines(blocks: Block[]): string[] {
  return blocks.flatMap((block) => {
    if (block.kind === "lines") return block.lines;
    if (block.kind === "paragraph") return [block.prefix + block.text];
    throw new Error(`unexpected ${block.kind} block`);
  });
}

describe("reformatPane joins lines that a program wrapped at the pane's width", () => {
  it.each([
    {
      name: "a reply after a symbol bullet",
      input: [
        "● The build failed because the config",
        "  file sets a port that another",
        "  service already uses on this",
        "  machine.",
      ],
      expected: [
        paragraph("● ", "The build failed because the config file sets a port that another service already uses on this machine."),
      ],
    },
    {
      name: "a dash list item",
      input: ["  - Move the port into the environment", "    file so each machine can pick its", "    own."],
      expected: [paragraph("  - ", "Move the port into the environment file so each machine can pick its own.")],
    },
    {
      name: "a numbered list item",
      input: ["  12. Restart the service after the", "      change and check the health page", "      again."],
      expected: [paragraph("  12. ", "Restart the service after the change and check the health page again.")],
    },
    {
      name: "plain text with no indent",
      input: ["Plain text that a program wrapped at", "the pane width joins back into one", "paragraph."],
      expected: [paragraph("", "Plain text that a program wrapped at the pane width joins back into one paragraph.")],
    },
    {
      name: "two list items one after the other",
      input: [
        "  - Move the port into the environment",
        "    file so each machine can pick its",
        "    own.",
        "  - Move the port into the environment",
        "    file.",
      ],
      expected: [
        paragraph("  - ", "Move the port into the environment file so each machine can pick its own."),
        paragraph("  - ", "Move the port into the environment file."),
      ],
    },
    {
      name: "a paragraph between plain lines",
      input: ["Summary", "Plain text that a program wrapped at", "the pane width.", "", "Done"],
      expected: [
        lines("Summary"),
        paragraph("", "Plain text that a program wrapped at the pane width."),
        lines("", "Done"),
      ],
    },
  ])("joins $name", ({ input, expected }) => {
    expect(reformatPane(input.join("\n"), PHONE_COLUMNS, PANE_COLUMNS)).toEqual(expected);
  });
});

describe("reformatPane keeps lines apart when they are not sure to be one wrapped line", () => {
  it.each([
    { name: "the first line is short", input: ["● Done.", "  Next the tests"] },
    { name: "the next word would have fitted", input: ["  file sets a port that another", "  is"] },
    { name: "a line has column gaps", input: ["README.md   package.json   tsconfig.json", "node_modules"] },
    { name: "the next line has its own marker", input: ["● The build failed because the config", "  - nested item"] },
    { name: "the next line has another indent", input: ["● The build failed because the config", "    file sets a port"] },
    { name: "a blank line comes between", input: ["● The build failed because the config", "", "  file sets a port"] },
    {
      name: "the line is longer than the pane, so the terminal wrapped it",
      input: ["This line is longer than the pane width so the terminal wrapped it", "and more"],
    },
    {
      name: "a URL longer than the pane comes before a short line",
      input: ["https://example.com/docs/guides/getting-started/installing-the-command-line-tools", "Done."],
    },
  ])("when $name", ({ input }) => {
    const blocks = reformatPane(input.join("\n"), PHONE_COLUMNS, PANE_COLUMNS);

    expect(getShownLines(blocks)).toEqual(input);
  });

  it("joins nothing when Herdr gives no pane width", () => {
    const input = ["● The build failed because the config", "  file sets a port that another", "  machine."];

    expect(reformatPane(input.join("\n"), PHONE_COLUMNS, null)).toEqual([lines(...input)]);
  });
});

describe("reformatPane turns a divider line into one thin line", () => {
  it.each([
    { name: "box-drawing dashes", line: "─".repeat(12) },
    { name: "heavy box-drawing dashes", line: "━".repeat(30) },
    { name: "dashed box-drawing dashes", line: "╌".repeat(30) },
    { name: "eight hyphens", line: "--------" },
    { name: "indented equals signs", line: "  ════════" },
    { name: "underscores", line: "__________" },
  ])("for $name", ({ line }) => {
    expect(reformatPane(`above\n${line}\nbelow`, PHONE_COLUMNS, PANE_COLUMNS)).toEqual([lines("above"), rule, lines("below")]);
  });

  it.each([
    { name: "a label in the middle of a long line", line: `${"─".repeat(170)} firstmate ${"─".repeat(12)}`, label: "firstmate", isLabelFirst: false },
    { name: "a label near the start", line: "── Results ──────────", label: "Results", isLabelFirst: true },
    { name: "a label after the line", line: "────────── v2.1", label: "v2.1", isLabelFirst: false },
    { name: "a label before the line", line: "v2.1 ──────────", label: "v2.1", isLabelFirst: true },
    { name: "a label after ASCII hyphens", line: "--------- done", label: "done", isLabelFirst: false },
  ])("with $name keeps the label", ({ line, label, isLabelFirst }) => {
    expect(reformatPane(`above\n${line}\nbelow`, PHONE_COLUMNS, PANE_COLUMNS)).toEqual([
      lines("above"),
      labeledRule(label, isLabelFirst),
      lines("below"),
    ]);
  });

  it.each([
    { name: "seven hyphens", line: "-------" },
    { name: "a label longer than 30 characters", line: `${"─".repeat(20)} ${"x".repeat(31)}` },
    { name: "two runs of different characters", line: `${"─".repeat(10)} done ${"=".repeat(10)}` },
    { name: "a label with a rule character in it", line: `${"─".repeat(10)} a-b ${"─".repeat(10)}` },
    { name: "a label glued to the line", line: `${"─".repeat(10)}done` },
    { name: "a title between dashes", line: "--- Results ---" },
    { name: "mixed characters", line: "-=-=-=-=-=" },
  ])("keeps $name as text", ({ line }) => {
    expect(reformatPane(`above\n${line}\nbelow`, PHONE_COLUMNS, PANE_COLUMNS)).toEqual([lines("above", line, "below")]);
  });
});

describe("reformatPane turns a box table that does not fit into one card for each row", () => {
  it.each([
    {
      name: "rows between separators",
      table: [
        "┌──────────┬──────────┬──────────────────────────────┐",
        "│ Name     │ Language │ Notes                        │",
        "├──────────┼──────────┼──────────────────────────────┤",
        "│ tmux     │ C        │ Widely installed on servers  │",
        "├──────────┼──────────┼──────────────────────────────┤",
        "│ zellij   │ Rust     │ Shows key hints on screen    │",
        "└──────────┴──────────┴──────────────────────────────┘",
      ],
    },
    {
      name: "one row on each line, with no separators between them",
      table: [
        "┌──────────┬──────────┬──────────────────────────────┐",
        "│ Name     │ Language │ Notes                        │",
        "├──────────┼──────────┼──────────────────────────────┤",
        "│ tmux     │ C        │ Widely installed on servers  │",
        "│ zellij   │ Rust     │ Shows key hints on screen    │",
        "└──────────┴──────────┴──────────────────────────────┘",
      ],
    },
    {
      name: "rows whose cells wrap over two lines",
      table: [
        "┌──────────┬──────────┬──────────────────────┐",
        "│ Name     │ Language │ Notes                │",
        "├──────────┼──────────┼──────────────────────┤",
        "│ tmux     │ C        │ Widely installed     │",
        "│          │          │ on servers           │",
        "├──────────┼──────────┼──────────────────────┤",
        "│ zellij   │ Rust     │ Shows key hints      │",
        "│          │          │ on screen            │",
        "└──────────┴──────────┴──────────────────────┘",
      ],
    },
  ])("with $name", ({ table }) => {
    const expected: Block = {
      kind: "table",
      header: ["Name", "Language", "Notes"],
      rows: [
        ["tmux", "C", "Widely installed on servers"],
        ["zellij", "Rust", "Shows key hints on screen"],
      ],
    };

    expect(reformatPane(["Tools:", ...table, "Done"].join("\n"), PHONE_COLUMNS, PANE_COLUMNS)).toEqual([
      lines("Tools:"),
      expected,
      lines("Done"),
    ]);
  });

  it.each([
    {
      name: "a table that fits the phone",
      table: [
        "┌────────┬──────┐",
        "│ Name   │ Lang │",
        "├────────┼──────┤",
        "│ tmux   │ C    │",
        "├────────┼──────┤",
        "│ zellij │ Rust │",
        "└────────┴──────┘",
      ],
    },
    {
      name: "a row with a missing cell",
      table: [
        "┌──────────┬──────────┬──────────────────────────────┐",
        "│ Name     │ Language │ Notes                        │",
        "├──────────┼──────────┼──────────────────────────────┤",
        "│ tmux     │ C                                       │",
        "└──────────┴──────────┴──────────────────────────────┘",
      ],
    },
    {
      name: "a table with no header separator",
      table: [
        "┌──────────┬──────────┬──────────────────────────────┐",
        "│ tmux     │ C        │ Widely installed on servers  │",
        "└──────────┴──────────┴──────────────────────────────┘",
      ],
    },
    {
      name: "a table with no bottom line",
      table: [
        "┌──────────┬──────────┬──────────────────────────────┐",
        "│ Name     │ Language │ Notes                        │",
        "├──────────┼──────────┼──────────────────────────────┤",
        "│ tmux     │ C        │ Widely installed on servers  │",
      ],
    },
    {
      name: "a wrapped cell with no separators between body rows",
      table: [
        "┌──────────┬──────────┬──────────────────────┐",
        "│ Name     │ Language │ Notes                │",
        "├──────────┼──────────┼──────────────────────┤",
        "│ tmux     │ C        │ Widely installed     │",
        "│          │          │ on servers           │",
        "└──────────┴──────────┴──────────────────────┘",
      ],
    },
    {
      name: "a blank repeated key with no separators between body rows",
      table: [
        "┌──────────┬──────────┬──────────────────────┐",
        "│ Name     │ Language │ Notes                │",
        "├──────────┼──────────┼──────────────────────┤",
        "│ tmux     │ C        │ Widely installed     │",
        "│          │ Go       │ Port in progress     │",
        "└──────────┴──────────┴──────────────────────┘",
      ],
    },
    {
      name: "a first cell that wraps, with no separators between body rows",
      table: [
        "┌────────────────┬──────────┬────────────────┐",
        "│ Name           │ Language │ Notes          │",
        "├────────────────┼──────────┼────────────────┤",
        "│ herdr-remote-  │ Rust     │ Bridge         │",
        "│ api            │          │                │",
        "└────────────────┴──────────┴────────────────┘",
      ],
    },
    {
      name: "a table cut off at the top",
      table: [
        "│ tmux     │ C        │ Widely installed on servers  │",
        "├──────────┼──────────┼──────────────────────────────┤",
        "│ zellij   │ Rust     │ Shows key hints on screen    │",
        "└──────────┴──────────┴──────────────────────────────┘",
      ],
    },
  ])("keeps $name as text", ({ table }) => {
    expect(reformatPane(table.join("\n"), PHONE_COLUMNS, PANE_COLUMNS)).toEqual([lines(...table)]);
  });
});

describe("reformatPane does not take an unclosed box for a table", () => {
  it("still turns a divider after the box into a thin line", () => {
    const input = ["╭────────╮", "│ prompt │", "╰─ esc to cancel ─╯", "Some text", "────────", "Done"];

    expect(reformatPane(input.join("\n"), PHONE_COLUMNS, PANE_COLUMNS)).toEqual([
      lines(...input.slice(0, 4)),
      rule,
      lines("Done"),
    ]);
  });
});

describe("reformatPane leaves a plain shell as it is", () => {
  it("keeps every line of a shell screen", () => {
    const shell = [
      "dev@test-box:~/demo$ ls -l",
      "total 8",
      "-rw-r--r-- 1 dev dev  120 Nov  5 10:42 README.md",
      "-rw-r--r-- 1 dev dev 2048 Nov  5 10:40 calc.py",
      "dev@test-box:~/demo$ git log --oneline -2",
      "a1b2c3d Add the calculator and a long commit subject that the terminal wrapped",
      "d4e5f6a Initial commit",
      "dev@test-box:~/demo$",
    ];

    expect(reformatPane(shell.join("\n"), PHONE_COLUMNS, WIDE_PANE_COLUMNS)).toEqual([lines(...shell)]);
  });

  // A terminal keeps blank rows below the prompt; they would push the prompt off the screen.
  it("drops the blank rows and spaces at the end of the screen", () => {
    expect(reformatPane("dev@test-box:~$ ls   \nREADME.md\n\n   \n", PHONE_COLUMNS, PANE_COLUMNS)).toEqual([
      lines("dev@test-box:~$ ls", "README.md"),
    ]);
  });
});

describe("reformatPane collapses right-aligned gaps in lines wider than the phone", () => {
  const FOOTER = `  Haiku 5.5 medium · 0/300k · 5h ▓░░░░ 25% (reset in 2h01m)${" ".repeat(130)}/rc`;
  const COLLAPSED_FOOTER = "  Haiku 5.5 medium · 0/300k · 5h ▓░░░░ 25% (reset in 2h01m)  /rc";

  it("moves the right-aligned part next to the rest", () => {
    const second = "  ⏵⏵ auto mode on (shift+tab to cycle) · PR #9";

    expect(getShownLines(reformatPane(`${FOOTER}\n${second}`, PHONE_COLUMNS, null))).toEqual([COLLAPSED_FOOTER, second]);
  });

  it("collapses two right-aligned lines whose right parts start at different columns", () => {
    const input = [`  first line of the footer${" ".repeat(60)}/rc`, `  a second, longer footer line here${" ".repeat(70)}/model`];

    expect(getShownLines(reformatPane(input.join("\n"), PHONE_COLUMNS, null))).toEqual([
      "  first line of the footer  /rc",
      "  a second, longer footer line here  /model",
    ]);
  });

  it("keeps aligned columns", () => {
    const table = [
      "USER       PID  %CPU %MEM COMMAND               ARGUMENTS",
      "dev       1234   0.1  0.2 node                  server.js --port 3000",
      "dev       5678   2.3  1.4 python                worker.py --queue default",
    ];

    expect(getShownLines(reformatPane(table.join("\n"), PHONE_COLUMNS, null))).toEqual(table);
  });

  it("keeps a line that fits the phone", () => {
    const line = "name      value";

    expect(getShownLines(reformatPane(line, PHONE_COLUMNS, null))).toEqual([line]);
  });

  it("keeps the indent", () => {
    const line = `      indented text that is long enough${" ".repeat(20)}end`;

    expect(getShownLines(reformatPane(line, PHONE_COLUMNS, null))).toEqual(["      indented text that is long enough  end"]);
  });
});
