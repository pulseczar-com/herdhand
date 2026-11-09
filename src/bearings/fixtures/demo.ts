// Ported from the herdr-firstmate-bearings sidebar mod (MIT, same author): demo.js.
// A sample Firstmate for tests and the web preview. Every name and URL is invented. The
// snapshot has the shape of `fm-bearings-snapshot.sh --json`; the records have the fields of
// `fm-tasks-axi.sh show <id> --full`.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEB = "https://github.com/example/acme-web/pull";
const API = "https://github.com/example/acme-api/pull";
const DOCS = "https://github.com/example/docs-site/pull";
const NO_HOLD = { held: "no", hold_reason: "-", hold_kind: "-", hold_until: "-" };
const NO_BLOCK = { blocked: "no", blocked_by: "none", deps: "-" };

const isoDay = (now: number, daysAgo: number) => new Date(now - daysAgo * DAY_MS).toISOString().slice(0, 10);

function snapshotOf(now: number) {
  const filed = (daysAgo: number) => isoDay(now, daysAgo);
  return {
    schema: "fm-bearings.v1",
    home: "demo",
    generated: new Date(now).toISOString().replace(/\.\d+Z$/, "Z"),
    prs: "not requested",
    decisions_open: [
      {
        id: "acme-web-empty-search",
        key: "acme-web-empty-search",
        verb: "captain-hold",
        summary: "Search empty state wording: which text?",
        question: 'Which text should the search page show when nothing matches: "No results" or "Nothing found. Try fewer words"?',
        owner: "(main)",
      },
      {
        id: "acme-api-rate-limit",
        key: "acme-api-rate-limit",
        verb: "captain-hold",
        summary: "API rate limit change: raise the default?",
        question: "Raise the default rate limit from 60 to 120 requests a minute for all keys, or only for paid keys?",
        owner: "(main)",
      },
    ],
    in_flight: [
      { id: "acme-api-pagination", kind: "ship", state: "working", repo: "acme-api", name: "Add cursor pagination to the orders endpoint", doing: "tests green on branch" },
      { id: "docs-site-install-guide", kind: "task", state: "paused", repo: "docs-site", name: "Rewrite the install guide", doing: "waiting on CI" },
    ],
    recorded_prs: [
      { id: "acme-api-pagination", url: `${API}/58` },
      { id: "docs-site-install-guide", url: `${DOCS}/12` },
    ],
    gates: [
      { id: "acme-web-dark-mode", title: "Add a dark mode toggle", blocked_by: "-", reason: "-", owner: "(main)", filed: filed(4) },
      { id: "acme-api-webhooks", title: "Send a webhook when an order ships", blocked_by: "acme-api-pagination", reason: "waits for pagination", owner: "(main)", filed: filed(6) },
      { id: "docs-site-search", title: "Add search to the docs site", blocked_by: "-", reason: "-", owner: "(main)", filed: filed(2) },
    ],
    landed: [
      { id: "acme-web-login-errors", what: "Show clear errors on the login form", artifact: `${WEB}/39`, owner: "(main)" },
      { id: "acme-api-health", what: "Add a health check endpoint", artifact: `${API}/55`, owner: "(main)" },
      { id: "docs-site-nav", what: "Fix the sidebar links in the docs", artifact: `${DOCS}/10`, owner: "(main)" },
      { id: "acme-web-footer", what: "Update the footer links", artifact: `${WEB}/37`, owner: "(main)" },
    ],
  };
}

function recordsOf(now: number): Record<string, Record<string, string>> {
  const day = (daysAgo: number) => isoDay(now, daysAgo);
  const records = [
    { id: "acme-web-empty-search", title: "Search empty state wording", state: "queued", ...NO_BLOCK, held: "yes", hold_reason: "Needs a copy choice before the page can ship", hold_kind: "captain", hold_until: "-", kind: "ship", repo: "acme-web", priority: "1", created: day(3), closed: "-", links: "-", body: "Show a friendly message on the search page when a query matches nothing. Two wordings are ready." },
    { id: "acme-api-rate-limit", title: "API rate limit change", state: "queued", ...NO_BLOCK, held: "yes", hold_reason: "Needs a decision on who gets the higher limit", hold_kind: "captain", hold_until: "-", kind: "ship", repo: "acme-api", priority: "2", created: day(5), closed: "-", links: "-", body: "Customers hit the default limit during bulk imports. Raising it helps them but also raises the load on the API." },
    { id: "acme-api-pagination", title: "Add cursor pagination to the orders endpoint", state: "in_flight", ...NO_BLOCK, ...NO_HOLD, kind: "ship", repo: "acme-api", priority: "1", created: day(2), closed: "-", links: `pr:${API}/58`, body: "The orders endpoint returns every order at once. Add a cursor and a page size so large accounts load fast." },
    { id: "docs-site-install-guide", title: "Rewrite the install guide", state: "in_flight", ...NO_BLOCK, ...NO_HOLD, kind: "task", repo: "docs-site", priority: "-", created: day(4), closed: "-", links: `pr:${DOCS}/12`, body: "Cover the three install paths in order and add a troubleshooting section for the common errors." },
    { id: "acme-web-dark-mode", title: "Add a dark mode toggle", state: "queued", ...NO_BLOCK, ...NO_HOLD, kind: "ship", repo: "acme-web", priority: "-", created: day(4), closed: "-", links: "-", body: "Add a toggle in the header that switches the color theme and remembers the choice." },
    { id: "acme-api-webhooks", title: "Send a webhook when an order ships", state: "queued", ...NO_HOLD, blocked: "yes", blocked_by: "acme-api-pagination", deps: "blocked-by:acme-api-pagination", kind: "ship", repo: "acme-api", priority: "-", created: day(6), closed: "-", links: "-", body: "Call each customer's webhook URL when an order ships. It reuses the cursor from the pagination work." },
    { id: "docs-site-search", title: "Add search to the docs site", state: "queued", ...NO_BLOCK, ...NO_HOLD, kind: "task", repo: "docs-site", priority: "-", created: day(2), closed: "-", links: "-", body: "Add a search box to the header that finds pages by title and heading." },
    { id: "acme-web-login-errors", title: "Show clear errors on the login form", state: "done", ...NO_BLOCK, ...NO_HOLD, kind: "ship", repo: "acme-web", priority: "-", created: day(9), closed: day(3), links: `pr:${WEB}/39`, body: "The login form showed a blank error. Show the reason, such as a wrong password or a locked account." },
    { id: "acme-api-health", title: "Add a health check endpoint", state: "done", ...NO_BLOCK, ...NO_HOLD, kind: "ship", repo: "acme-api", priority: "-", created: day(11), closed: day(5), links: `pr:${API}/55`, body: "Add a /health route that reports the database and queue status for the load balancer." },
    { id: "docs-site-nav", title: "Fix the sidebar links in the docs", state: "done", ...NO_BLOCK, ...NO_HOLD, kind: "task", repo: "docs-site", priority: "-", created: day(12), closed: day(7), links: `pr:${DOCS}/10`, body: "Three sidebar links pointed to pages that moved. Update them and add a link check." },
    { id: "acme-web-footer", title: "Update the footer links", state: "done", ...NO_BLOCK, ...NO_HOLD, kind: "task", repo: "acme-web", priority: "-", created: day(14), closed: day(9), links: `pr:${WEB}/37`, body: "Replace the old terms and privacy links and add the status page link." },
  ];
  return Object.fromEntries(records.map((record) => [record.id, record]));
}

/** The sample bearings for one moment: the snapshot, and the task records by task id. */
export function getDemoBearings(now: number) {
  return { snapshot: snapshotOf(now), records: recordsOf(now) };
}

/** A record as `fm-tasks-axi.sh show <id> --full` prints it. */
export function toToon(record: Record<string, string>): string {
  const lines = Object.entries(record).map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`);
  return ["task:", ...lines, ""].join("\n");
}
