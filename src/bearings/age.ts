const SECONDS_PER_MINUTE = 60;

/** "12s ago" under a minute, then "3m ago". */
export function getAgeText(since: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - since) / 1000));
  if (seconds < SECONDS_PER_MINUTE) return `${seconds}s ago`;
  return `${Math.round(seconds / SECONDS_PER_MINUTE)}m ago`;
}
