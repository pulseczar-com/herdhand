// Ported from the herdr-firstmate-bearings sidebar mod (MIT, same author): bearings.js.
// Turns the bearings snapshot (schema fm-bearings.v1) into sections of rows, and a row with its
// task record into the item the opened screen shows.
import type { BadgeTone } from "@/herdr/badges";

export const SCHEMA = "fm-bearings.v1";

/** A [label, value] pair of an item. */
export type Fact = [label: string, value: string];

export type Status = { text: string; tone: BadgeTone };

/** A PR chip: its text and the repo of the pull request. `url` of the row is where it opens. */
export type PrChip = { label: string; repo: string };

/** One card. `facts` are the fields the opened item shows. */
export type Row = {
  itemId: string;
  title: string;
  detail: string;
  repo?: string;
  status?: Status;
  /** Why a queued item waits. */
  reason?: string;
  facts: Fact[];
  pr?: PrChip;
  url?: string;
  /** A secondmate whose ledger cannot be read. */
  flagged?: boolean;
};

export type SectionId = "decisions" | "in-flight" | "prs" | "secondmates" | "queued" | "landed";

export type Section = { id: SectionId; title: string; tone: BadgeTone; count: number; rows: Row[]; highlighted: boolean };

/** The task record of one item: the keys under "task:" of `fm-tasks-axi.sh show`. */
export type TaskRecord = Record<string, string>;

// The snapshot is JSON of a schema this app does not control, so every field is optional.
type Entry = Record<string, string | undefined>;
type Snapshot = {
  schema?: string;
  decisions_open?: Entry[];
  in_flight?: Entry[];
  recorded_prs?: Entry[];
  secondmates?: Entry[];
  gates?: Entry[];
  landed?: Entry[];
};

const list = (value: Entry[] | undefined): Entry[] => (Array.isArray(value) ? value : []);
const joinParts = (...parts: (string | false | undefined)[]) => parts.filter((part) => part && part !== "-").join(" · ");

// The snapshot writes "-" for no value.
const hasValue = (value: string | undefined): value is string => Boolean(value) && value !== "-";

function facts(values: Record<string, string | undefined>): Fact[] {
  const pairs = Object.entries(values);
  return pairs.filter((pair): pair is Fact => hasValue(pair[1]));
}

const STATUS_TONES: Record<string, BadgeTone> = {
  working: "attention",
  blocked: "danger",
  paused: "neutral",
  held: "neutral",
  merged: "success",
  done: "success",
};

function statusOf(text: string | undefined): Status | undefined {
  if (!hasValue(text) || text === "unknown") return undefined;
  return { text, tone: STATUS_TONES[text] ?? "neutral" };
}

// "(main)" is the snapshot's placeholder owner, not a name.
const plainOwner = (owner: string | undefined) => (/^\(/.test(owner ?? "") ? "" : (owner ?? ""));

// A hold's summary is "<title>: <reason>" cut short. The title is the part before the last colon
// (when that part is long enough to be a title); the full text is the Question of the opened item.
const MIN_TITLE_LENGTH = 20;

function decisionTitle(summary: string | undefined): string {
  const text = summary ?? "";
  const cut = text.lastIndexOf(": ");
  return stripCaptain(cut >= MIN_TITLE_LENGTH ? text.slice(0, cut) : text);
}

const stripCaptain = (title: string) => title.replace(/^captain\b:?\s*/i, "");

// The snapshot's verb "captain-hold" is internal; the pill says what the person has to do.
function decisionStatus(decision: Entry): Status {
  const text = `${decision.summary} ${decision.question}`;
  if (/hand task/i.test(text)) return { text: "hand task", tone: "neutral" };
  if (/deferred/i.test(text)) return { text: "deferred", tone: "neutral" };
  return { text: "decision", tone: "danger" };
}

function decisionRow(decision: Entry): Omit<Row, "itemId"> {
  return {
    title: decisionTitle(decision.summary),
    detail: "",
    status: decisionStatus(decision),
    facts: facts({ Question: decision.question, Key: decision.key, Owner: plainOwner(decision.owner) }),
  };
}

// A "backend ..." note means the snapshot could not see the task's terminal. That check
// can fail when the snapshot runs through the app (it needs the terminal socket), so it is not shown.
const shownDoing = (doing: string | undefined) => (/^backend /.test(doing ?? "") ? "" : doing);

function inFlightRow(task: Entry): Omit<Row, "itemId"> {
  return {
    title: task.name ?? task.id ?? "",
    detail: "",
    repo: task.repo,
    status: statusOf(task.state),
    facts: facts({ Repo: task.repo, State: task.state, Doing: shownDoing(task.doing), Kind: task.kind, Id: task.id }),
  };
}

// The PR is titled by the task it belongs to when the snapshot lists that task.
function prRow(pr: Entry, snapshot: Snapshot): Omit<Row, "itemId"> {
  const task = [...list(snapshot.in_flight), ...list(snapshot.landed)].find((item) => item.id === pr.id);
  const title = task?.name ?? task?.what ?? pr.id ?? "";
  return { title, detail: "", facts: facts({ Task: pr.id }), pr: prChip(pr.url), url: pr.url };
}

/** The chip text and repo from a ".../<repo>/pull/<number>" URL; a URL of another shape gets a plain "PR". */
export function prChip(url: string | undefined): PrChip {
  const [, repo = "", number] = /^https?:\/\/[^/]+\/(.+)\/pull\/(\d+)/.exec(url ?? "") ?? [];
  return { label: number ? `PR #${number}` : "PR", repo };
}

function secondmateRow(secondmate: Entry): Omit<Row, "itemId"> {
  return {
    title: secondmate.id ?? "",
    detail: secondmate.freshness ?? "",
    status: statusOf(secondmate.state),
    flagged: secondmate.freshness === "unavailable",
    facts: facts({
      State: secondmate.state,
      Doing: secondmate.doing,
      Freshness: secondmate.freshness,
      Source: secondmate.provenance,
      Reason: secondmate.reason,
    }),
  };
}

function queuedRow(gate: Entry): Omit<Row, "itemId"> {
  return {
    title: gate.title ?? "",
    detail: joinParts(plainOwner(gate.owner), gate.reason),
    status: hasValue(gate.blocked_by) ? statusOf("held") : undefined,
    reason: hasValue(gate.reason) ? gate.reason : "",
    facts: facts({ "Blocked by": gate.blocked_by, Reason: gate.reason, Owner: plainOwner(gate.owner), Filed: gate.filed }),
  };
}

function landedRow(landed: Entry): Omit<Row, "itemId"> {
  return {
    title: landed.what ?? "",
    detail: plainOwner(landed.owner),
    status: statusOf("merged"),
    facts: facts({ Owner: plainOwner(landed.owner), Artifact: landed.artifact }),
  };
}

type SectionSpec = {
  id: SectionId;
  title: string;
  tone: BadgeTone;
  highlight?: boolean;
  /** False for items that are not tasks, so no task record exists for them. */
  hasTask?: boolean;
  items: (snapshot: Snapshot) => Entry[];
  row: (item: Entry, snapshot: Snapshot) => Omit<Row, "itemId">;
};

const SECTIONS: SectionSpec[] = [
  { id: "decisions", title: "Waiting on you", tone: "danger", highlight: true, items: (b) => list(b.decisions_open), row: decisionRow },
  { id: "in-flight", title: "In flight", tone: "active", items: (b) => list(b.in_flight), row: inFlightRow },
  { id: "prs", title: "PRs", tone: "active", items: (b) => list(b.recorded_prs), row: prRow },
  { id: "secondmates", title: "Secondmates", tone: "neutral", hasTask: false, items: (b) => list(b.secondmates), row: secondmateRow },
  { id: "queued", title: "Queued", tone: "neutral", items: (b) => list(b.gates), row: queuedRow },
  { id: "landed", title: "Landed", tone: "success", items: (b) => list(b.landed), row: landedRow },
];

export type Bearings = { sections: Section[]; unsupported: string | null };

/** The sections of a snapshot's JSON text, all six. Throws on text that is not JSON; the caller shows that as a failed refresh. */
export function readBearings(text: string): Bearings {
  const snapshot = JSON.parse(text) as Snapshot | null;
  if (snapshot?.schema !== SCHEMA) {
    return { unsupported: `Unsupported bearings version (got ${snapshot?.schema})`, sections: [] };
  }
  const sections = SECTIONS.map(({ id, title, tone, highlight, items, row }): Section => {
    const rows = items(snapshot).map((item) => ({ ...row(item, snapshot), itemId: item.id ?? "" }));
    return { id, title, tone, count: rows.length, rows, highlighted: Boolean(highlight) && rows.length > 0 };
  });
  return { unsupported: null, sections };
}

/** The sections that have rows. */
export function withoutEmptySections(sections: Section[]): Section[] {
  return sections.filter((section) => section.count > 0);
}

/** Whether the section's items are tasks, so `fm-tasks-axi.sh show` has a record for them. */
export function hasTaskRecord(sectionId: SectionId): boolean {
  return SECTIONS.find((section) => section.id === sectionId)?.hasTask !== false;
}

// --- The opened item ---

const isEmptyField = (value: string) => !hasValue(value) || value === "none";
export const fieldKey = (label: string) => label.toLowerCase().replace(/[^a-z0-9]/g, "");

// Fields the item shows in its own way, so the list leaves them out: the repo, and the title
// (also named name, summary or what).
const SHOWN_ELSEWHERE = new Set(["repo", "title", "name", "summary", "what"]);

// Whether the item shows this field elsewhere: by key, as the status pill (and never the state
// "unknown"), or by value, as the PR chip, its URL or the repo.
function isShownElsewhere(row: Row, [label, value]: Fact, repo: string): boolean {
  const key = fieldKey(label);
  if (SHOWN_ELSEWHERE.has(key)) return true;
  if (key === "state") return Boolean(row.status) || value === "unknown";
  return [row.status?.text, row.pr?.label, row.url, repo].includes(value);
}

// A yes or no value, or a date, repeats by nature, so two badges may share it.
const REPEATABLE_VALUE = /^(yes|no|true|false|\d{4}-\d{2}-\d{2})$/;

// Drops a field whose value an earlier field already shows. The id is kept, so it wins over a later copy.
function withoutRepeatedValues(fields: Fact[]): Fact[] {
  const seen = new Set(fields.filter(([label]) => fieldKey(label) === "id").map(([, value]) => value));
  return fields.filter(([label, value]) => {
    if (fieldKey(label) === "id" || REPEATABLE_VALUE.test(value)) return true;
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

/**
 * The title and fields an opened item shows. With a task record, the title is the record's full
 * title and the fields are every record field, then the snapshot fields the record does not
 * already have. Fields with no value are left out.
 */
export function getItem(row: Row, record: TaskRecord | undefined): { title: string; fields: Fact[] } {
  const recordFields = Object.entries(record ?? {});
  const recordKeys = new Set(recordFields.map(([key]) => fieldKey(key)));
  const snapshotFields = row.facts.filter(([label]) => !recordKeys.has(fieldKey(label)));
  const repo = getRepo(row, record);
  const shown = [...recordFields, ...snapshotFields].filter((field) => !isEmptyField(field[1]) && !isShownElsewhere(row, field, repo));
  const title = record?.title ? stripCaptain(record.title) : row.title;
  return { title, fields: withoutRepeatedValues(shown) };
}

/**
 * The repo an item shows, without its owner: the PR's, then the snapshot row's, then the task
 * record's. A landed row has no repo in the snapshot, so its record gives it.
 */
export function getRepo(row: Row, record: TaskRecord | undefined): string {
  const recordRepo = record?.repo && !isEmptyField(record.repo) ? record.repo : "";
  const repo = row.pr?.repo || row.repo || recordRepo;
  return repo.split("/").pop() ?? "";
}

/** The text of a record that changes when any snapshot entry of that id changes, so the record is fetched again. */
export function getRecordSignature(sectionId: SectionId, row: Row): string {
  return JSON.stringify([sectionId, row]);
}
