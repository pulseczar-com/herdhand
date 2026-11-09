import { getTranscriptPath } from "@/claude/paths";
import type { Pane, Space } from "@/herdr/backend";

// Everything here is invented: no real machine, person, host or folder.

/** The folder of the demo Firstmate. The demo machine answers Bearings for this folder only. */
export const DEMO_FIRSTMATE_FOLDER = "/work/firstmate";

type Session = { pid: number; sessionId: string; cwd: string; branch: string; lines: string[] };

const MODEL = "claude-opus-5-5";

function userPrompt(uuid: string, cwd: string, text: string): string {
  return JSON.stringify({ type: "user", uuid, cwd, message: { role: "user", content: text } });
}

function reply(uuid: string, cwd: string, branch: string, text: string): string {
  return JSON.stringify({ type: "assistant", uuid, cwd, gitBranch: branch, message: { role: "assistant", model: MODEL, content: [{ type: "text", text }] } });
}

function toolCall(uuid: string, id: string, name: string, input: object): string {
  return JSON.stringify({ type: "assistant", uuid, message: { role: "assistant", model: MODEL, content: [{ type: "tool_use", id, name, input }] } });
}

function toolResult(uuid: string, id: string, text: string): string {
  return JSON.stringify({ type: "user", uuid, message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: text }] } });
}

const WEB = "/work/acme-web";
const API = "/work/acme-api";

const SEARCH_QUESTION = "Which text should the search page show when nothing matches?";
const SEARCH_OPTIONS = ["No results", "Nothing found. Try fewer words"];

const MIGRATE_COMMAND = "npm run migrate -- --env staging";

const SESSIONS: Session[] = [
  {
    pid: 4101,
    sessionId: "demo-search",
    cwd: WEB,
    branch: "search-empty-state",
    lines: [
      userPrompt("u1", WEB, "The search page is blank when nothing matches. Add an empty state."),
      reply("a1", WEB, "search-empty-state", "I'll start with the page that renders the results."),
      toolCall("a2", "t1", "Read", { file_path: "src/pages/Search.tsx" }),
      toolResult("u2", "t1", "export function Search() { /* 84 lines */ }"),
      reply(
        "a3",
        WEB,
        "search-empty-state",
        "The page renders an empty list when a query matches nothing.\n\nTwo wordings are ready in the design file. I need your choice before I write the component:\n\n- **No results**: short and neutral\n- **Nothing found. Try fewer words**: gives the reader a next step",
      ),
      toolCall("a4", "t2", "AskUserQuestion", {
        questions: [{ question: SEARCH_QUESTION, header: "Wording", multiSelect: false, options: SEARCH_OPTIONS.map((label) => ({ label, description: "" })) }],
      }),
    ],
  },
  {
    pid: 4102,
    sessionId: "demo-migrate",
    cwd: WEB,
    branch: "orders-table",
    lines: [
      userPrompt("u1", WEB, "Run the migration for the new orders table on staging."),
      reply("a1", WEB, "orders-table", "The migration file is in place. I'll check the pending list, then run it on staging."),
      toolCall("a2", "t1", "Bash", { command: "npm run migrate -- --status", description: "List pending migrations" }),
      toolResult("u2", "t1", "1 pending: 20261109_create_orders_table"),
      reply("a3", WEB, "orders-table", "One migration is pending. Running it on staging now."),
      toolCall("a4", "t2", "Bash", { command: MIGRATE_COMMAND, description: "Run the staging migration" }),
    ],
  },
  {
    pid: 4103,
    sessionId: "demo-pagination",
    cwd: API,
    branch: "cursor-pagination",
    lines: [
      userPrompt("u1", API, "Add cursor pagination to the orders endpoint."),
      reply("a1", API, "cursor-pagination", "I'll add a `cursor` and a `limit` parameter, then cover both with tests."),
      toolCall("a2", "t1", "Edit", { file_path: "src/orders/list.ts", old_string: "return all", new_string: "return page" }),
      toolResult("u2", "t1", "Edited src/orders/list.ts"),
      toolCall("a3", "t2", "Bash", { command: "npm test -- orders", description: "Run the orders tests" }),
      toolResult("u3", "t2", "Tests: 14 passed, 14 total"),
      reply("a4", API, "cursor-pagination", "Done. The endpoint takes `cursor` and `limit`, and returns `nextCursor`.\n\nAll 14 orders tests pass."),
    ],
  },
  {
    pid: 4104,
    sessionId: "demo-firstmate",
    cwd: DEMO_FIRSTMATE_FOLDER,
    branch: "main",
    lines: [
      userPrompt("u1", DEMO_FIRSTMATE_FOLDER, "What is waiting on me?"),
      reply("a1", DEMO_FIRSTMATE_FOLDER, "main", "Two decisions wait on you:\n\n1. **Search empty state wording**: which text to show\n2. **API rate limit change**: who gets the higher limit\n\nTwo ships are in flight, and four landed this week."),
    ],
  },
];

/** The files of the demo machine that the app reads: each Claude session file, and its transcript. */
export function getDemoFiles(): Map<string, string> {
  const files = new Map<string, string>();
  for (const { pid, sessionId, cwd, lines } of SESSIONS) {
    files.set(`.claude/sessions/${pid}.json`, `${JSON.stringify({ sessionId, cwd })}\n`);
    files.set(getTranscriptPath({ sessionId, cwd }), `${lines.join("\n")}\n`);
  }
  return files;
}

const PROMPT = "demo@demo-box:/work/acme-api$";

/** What each pane's screen shows. */
export const DEMO_SCREENS: Record<string, string> = {
  "demo-question": [
    "● I need your choice before I write the component.",
    "",
    ` ${SEARCH_QUESTION}`,
    ...SEARCH_OPTIONS.map((label, index) => ` ${index === 0 ? "❯" : " "} ${index + 1}. ${label}`),
  ].join("\n"),
  "demo-permission": [
    "● Running it on staging now.",
    "",
    " Bash command",
    "",
    `   ${MIGRATE_COMMAND}`,
    "   Run the staging migration",
    "",
    " Do you want to proceed?",
    " ❯ 1. Yes",
    "   2. Yes, and don't ask again for npm run commands",
    "   3. No, and tell Claude what to do differently (esc)",
  ].join("\n"),
  "demo-done": "● Done. All 14 orders tests pass.",
  "demo-firstmate": "● Two decisions wait on you.",
  "demo-shell": [
    `${PROMPT} git status --short`,
    " M src/orders/list.ts",
    " M src/orders/list.test.ts",
    `${PROMPT} npm test -- orders`,
    "PASS src/orders/list.test.ts",
    "  orders list",
    "    ✓ returns the first page (12 ms)",
    "    ✓ follows the cursor to the next page (4 ms)",
    "    ✓ rejects a limit above 100 (2 ms)",
    "",
    "Tests: 14 passed, 14 total",
    `${PROMPT} git log --oneline -3`,
    "4f1c9ab Add cursor pagination to the orders endpoint",
    "b7d20e5 Add a health check endpoint",
    "91a6c3d Fix the sidebar links in the docs",
    `${PROMPT} `,
  ].join("\n"),
};

type AgentPane = { id: string; title: string; state: "blocked" | "working" | "done"; pid: number; cwd: string } & Partial<Pane>;

const agentPane = ({ id, title, state, pid, cwd, ...extra }: AgentPane): Pane => ({
  id,
  title,
  agent: "claude-code",
  state,
  isFinished: false,
  columns: null,
  cwd,
  pid,
  ...extra,
});

export const DEMO_SPACES: Space[] = [
  {
    id: "demo-s1",
    name: "acme-web",
    tabs: [
      {
        id: "demo-t1",
        name: "search",
        panes: [agentPane({ id: "demo-question", title: "Search empty state", state: "blocked", pid: 4101, cwd: WEB, blockedKind: "question", message: "Claude has a question for you" })],
      },
      {
        id: "demo-t2",
        name: "migration",
        panes: [agentPane({ id: "demo-permission", title: "Orders table migration", state: "blocked", pid: 4102, cwd: WEB, blockedKind: "permission", message: "Claude needs your permission to use Bash" })],
      },
    ],
  },
  {
    id: "demo-s2",
    name: "acme-api",
    tabs: [
      { id: "demo-t3", name: "agent", panes: [agentPane({ id: "demo-done", title: "Cursor pagination", state: "done", pid: 4103, cwd: API })] },
      {
        id: "demo-t4",
        name: "shell",
        panes: [{ id: "demo-shell", title: "zsh", agent: null, state: null, isFinished: false, columns: null, cwd: API, isShellForeground: true }],
      },
    ],
  },
  {
    id: "demo-s3",
    name: "firstmate",
    tabs: [{ id: "demo-t5", name: "main", panes: [agentPane({ id: "demo-firstmate", title: "Firstmate", state: "working", pid: 4104, cwd: DEMO_FIRSTMATE_FOLDER })] }],
  },
];
