import { useTheme } from "expo-router";
import { type ColorValue, StyleSheet, Text, View } from "react-native";

import type { Segment } from "@/pane/ansi";
import type { Block } from "@/pane/reformat";

const FONT_SIZE = 13;
// The rule keeps one text line's height, so the text around it does not move.
const LINE_HEIGHT = 20;
// A monospace character is about 0.6 of the font size wide.
const CHARACTER_WIDTH = FONT_SIZE * 0.6;

const LABEL_OPACITY = 0.6;
const DIM_ALPHA = 0.5;
const RGB_COLOR = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/;

/**
 * A pane's text as reformatted blocks: plain lines, paragraphs, thin lines and table cards. A
 * line in `dimLines` shows its dim segments dimmed.
 */
export function PaneBlocks({ blocks, dimLines }: { blocks: Block[]; dimLines?: Map<string, Segment[]> }) {
  return (
    <>
      {blocks.map((block, index) => (
        <PaneBlock key={index} block={block} dimLines={dimLines} />
      ))}
    </>
  );
}

/** How many monospace columns of pane text fit in a width in points. */
export function getColumnCount(width: number): number {
  return Math.floor(width / CHARACTER_WIDTH);
}

/**
 * The color at half opacity, as nested Text on Android has no `opacity`. A color that is not
 * `rgb(r, g, b)` comes back unchanged.
 */
export function getDimColor(color: ColorValue): ColorValue {
  const match = typeof color === "string" ? RGB_COLOR.exec(color) : null;
  if (!match) return color;
  const [, red, green, blue] = match;
  return `rgba(${red}, ${green}, ${blue}, ${DIM_ALPHA})`;
}

function PaneBlock({ block, dimLines }: { block: Block; dimLines?: Map<string, Segment[]> }) {
  const { colors } = useTheme();
  const textStyle = [styles.text, styles.monospace, { color: colors.text }];

  switch (block.kind) {
    case "lines":
      return <LinesText lines={block.lines} dimLines={dimLines} />;
    case "paragraph":
      // The text wraps in its own column, so its next rows start under its first word.
      return (
        <View style={styles.paragraph}>
          <Text style={textStyle}>{block.prefix}</Text>
          <Text style={[styles.text, styles.paragraphText, { color: colors.text }]}>{block.text}</Text>
        </View>
      );
    case "rule":
      return <Rule label={block.label} isLabelFirst={block.isLabelFirst} />;
    case "table":
      return <TableCards header={block.header} rows={block.rows} />;
  }
}

/** Plain lines as one text; a line the program dimmed has its dim segments in a dimmer color. */
function LinesText({ lines, dimLines }: { lines: string[]; dimLines?: Map<string, Segment[]> }) {
  const { colors } = useTheme();
  const dimColor = getDimColor(colors.text);
  const textStyle = [styles.text, styles.monospace, { color: colors.text }];
  const hasDim = lines.some((line) => dimLines?.has(line));
  if (!hasDim) return <Text style={textStyle}>{lines.join("\n")}</Text>;

  return (
    <Text style={textStyle}>
      {lines.map((line, index) => (
        <Text key={index}>
          {index > 0 ? "\n" : ""}
          {renderLine(line, dimLines?.get(line), dimColor)}
        </Text>
      ))}
    </Text>
  );
}

/** A dimmed line's segments, each dim one in the dim color; a line without segments as it is. */
function renderLine(line: string, segments: Segment[] | undefined, dimColor: ColorValue) {
  if (!segments) return line;
  return segments.map((segment, index) => (
    <Text key={index} style={segment.isDim ? { color: dimColor } : undefined}>
      {segment.text}
    </Text>
  ));
}

/** A thin line, with its label at the side where the source has it. */
function Rule({ label, isLabelFirst }: { label: string | null; isLabelFirst: boolean }) {
  const { colors } = useTheme();
  if (label === null) return <View style={[styles.rule, { backgroundColor: colors.border }]} />;

  const line = <View style={[styles.rule, styles.ruleInRow, { backgroundColor: colors.border }]} />;
  const labelText = <Text style={[styles.text, styles.monospace, styles.label, { color: colors.text }]}>{label}</Text>;
  return (
    <View style={styles.labeledRule}>
      {isLabelFirst ? labelText : null}
      {line}
      {isLabelFirst ? null : labelText}
    </View>
  );
}

/** One card for each table row: its first cell as the title, then each other cell under its header. */
function TableCards({ header, rows }: { header: string[]; rows: string[][] }) {
  const { colors } = useTheme();

  return (
    <View style={styles.cards}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{row[0]}</Text>
          {row.slice(1).map((cell, cellIndex) => (
            <View key={cellIndex} style={styles.cardRow}>
              <Text style={[styles.cardLabel, { color: colors.text }]}>{header[cellIndex + 1]}</Text>
              <Text style={[styles.cardValue, { color: colors.text }]}>{cell}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT },
  monospace: { fontFamily: "monospace" },
  paragraph: { flexDirection: "row" },
  paragraphText: { flex: 1 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: (LINE_HEIGHT - StyleSheet.hairlineWidth) / 2 },
  ruleInRow: { flex: 1 },
  labeledRule: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { opacity: LABEL_OPACITY },
  cards: { gap: 8, marginVertical: 8 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  cardRow: { flexDirection: "row", gap: 12 },
  cardLabel: { width: "30%", fontSize: 13, opacity: 0.6 },
  cardValue: { flex: 1, fontSize: 13 },
});
