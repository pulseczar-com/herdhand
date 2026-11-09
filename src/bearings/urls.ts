// Ported from the herdr-firstmate-bearings sidebar mod (MIT, same author): urls.js.

const URL_PATTERN = /https?:\/\/[^\s<>"'.,;:!?)\]}][^\s<>"']*/g;
const TRAILING = /[.,;:!?)\]}]+$/;

export type UrlSegment = { text: string; url?: string };

/** Splits a field value into text and link segments. A link segment has `url`; trailing punctuation stays text. */
export function splitUrls(value: string): UrlSegment[] {
  const segments: UrlSegment[] = [];
  let last = 0;
  for (const match of value.matchAll(URL_PATTERN)) {
    const url = match[0].replace(TRAILING, "");
    if (match.index > last) segments.push({ text: value.slice(last, match.index) });
    segments.push({ text: url, url });
    last = match.index + url.length;
  }
  if (last < value.length) segments.push({ text: value.slice(last) });
  return segments;
}
