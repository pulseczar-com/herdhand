// Ported from the herdr-firstmate-bearings sidebar mod (MIT, same author): fields.js.
// Sorts the fields of an opened item by type: short values become badges, long text stays a
// paragraph, and a URL becomes a link chip, never raw text.
import { type Fact, fieldKey, prChip } from "./bearings";
import { splitUrls } from "./urls";

// Fields that are always long free text, however short one value is.
const TEXT_KEYS = new Set(["holdreason", "question", "body", "reason", "doing"]);
const DATE_KEYS = new Set(["filed", "created", "closed", "holduntil"]);
const MAX_BADGE_LENGTH = 40;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Text labels that read better than the raw key. Any other key shows as its words with a capital first letter.
const LABEL_NAMES: Record<string, string> = { body: "Description" };

const wordsOf = (label: string) => label.toLowerCase().replace(/[_-]/g, " ");

/** "Description" for the key "body"; "Hold reason" for "hold_reason". */
export function getLabel(label: string): string {
  const named = LABEL_NAMES[fieldKey(label)];
  if (named) return named;
  const words = wordsOf(label);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * "3d ago", "today" or "in 9d" for a YYYY-MM-DD date, by whole days from the clock's day (UTC).
 * Text that is not a date gives "".
 */
export function getRelativeDate(text: string, now: number): string {
  const match = ISO_DATE.exec(text);
  if (!match) return "";
  const day = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const days = Math.round((day - Math.floor(now / DAY_MS) * DAY_MS) / DAY_MS);
  if (days === 0) return "today";
  return days < 0 ? `${-days}d ago` : `in ${days}d`;
}

const isTrue = (value: string) => value === "yes" || value === "true";
const isFalse = (value: string) => value === "no" || value === "false";

const urlsIn = (value: string) => splitUrls(value).flatMap((segment) => (segment.url ? [segment.url] : []));

const isLongText = (key: string, value: string) => TEXT_KEYS.has(key) || value.length > MAX_BADGE_LENGTH;

export type Link = { url: string; label: string; isPr: boolean };

/** A link chip: "PR #12" for a pull request, else the host and last path part. */
export function getLink(url: string): Link {
  const pr = prChip(url).label;
  if (pr !== "PR") return { url, label: pr, isPr: true };
  const { host, last } = splitUrl(url);
  return { url, label: last ? `${host}/${last}` : host, isPr: false };
}

// A URL the text matcher found can still be rejected by the parser; it is then labeled by its own text.
function splitUrl(url: string): { host: string; last: string | undefined } {
  try {
    const { host, pathname } = new URL(url);
    return { host, last: pathname.split("/").filter(Boolean).pop() };
  } catch {
    return { host: url, last: undefined };
  }
}

/** The key as a muted prefix, the value, and the full date when the value shows as a relative date. */
export type Badge = { prefix: string; text: string; tip: string };
export type Text = { label: string; value: string };

function getBadge(label: string, key: string, value: string, now: number): Badge {
  if (isTrue(value)) return { prefix: "", text: wordsOf(label), tip: "" };
  const relative = DATE_KEYS.has(key) ? getRelativeDate(value, now) : "";
  return { prefix: wordsOf(label), text: relative || value, tip: relative ? value : "" };
}

/**
 * Splits fields into badges, texts and links, keeping their order. A boolean shows only when
 * true. "created" is dropped when "filed" has the same date. A long-text field keeps its URLs
 * inside the text; any other field with a URL gives link chips and nothing else.
 */
export function getTypedFields(fields: Fact[], now: number): { badges: Badge[]; texts: Text[]; links: Link[] } {
  const badges: Badge[] = [];
  const texts: Text[] = [];
  const links = new Map<string, Link>();
  const filed = fields.find(([label]) => fieldKey(label) === "filed")?.[1];
  for (const [label, value] of fields) {
    const key = fieldKey(label);
    if (isFalse(value) || (key === "created" && value === filed)) continue;
    const urls = urlsIn(value);
    if (urls.length > 0 && !TEXT_KEYS.has(key)) urls.forEach((url) => links.set(url, getLink(url)));
    else if (isLongText(key, value)) texts.push({ label, value });
    else badges.push(getBadge(label, key, value, now));
  }
  return { badges, texts, links: [...links.values()] };
}
