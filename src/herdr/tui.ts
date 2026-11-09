import { type HerdrClient, REQUEST_TIMEOUT_MS, RequestTimeoutError } from "@/rpc/client";

import { findPane } from "./agentPanes";
import { type Backend, type Pane, READ_LINES, type Space, type Tab, toAgentState } from "./backend";

/** A request that waits for its reply, and the timer that fails it. */
type Waiting = {
  resolve(result: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
};

type TuiReply = { id?: unknown; result?: unknown; error?: { message?: unknown } };

/**
 * Client for the TUI's `herdr remote-api-bridge`. The bridge speaks newline JSON that is not
 * JSON-RPC 2.0: `{id, method, params}` in, `{id, result}` or `{id, error}` out.
 */
export function makeTuiClient(send: (line: string) => void): HerdrClient {
  const waiting = new Map<string, Waiting>();
  let lastId = 0;

  function request(method: string, params: object = {}): Promise<unknown> {
    lastId += 1;
    const id = String(lastId);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new RequestTimeoutError(method));
      }, REQUEST_TIMEOUT_MS);
      waiting.set(id, { resolve, reject, timer });
      send(JSON.stringify({ id, method, params }));
    });
  }

  return {
    request,
    receive: (message) => settleRequest(waiting, message as TuiReply),
    rejectAll: (reason) => rejectWaiting(waiting, reason),
  };
}

/** Settles the request the reply answers. A reply to no waiting request is dropped. */
function settleRequest(waiting: Map<string, Waiting>, reply: TuiReply): void {
  const id = String(reply.id);
  const entry = waiting.get(id);
  if (!entry) return;
  waiting.delete(id);
  clearTimeout(entry.timer);
  if (reply.error) {
    entry.reject(new Error(String(reply.error.message ?? "Herdr returned an error")));
    return;
  }
  entry.resolve(reply.result);
}

/** Fails every waiting request with the reason, for example when the connection closes. */
function rejectWaiting(waiting: Map<string, Waiting>, reason: string): void {
  for (const entry of waiting.values()) {
    clearTimeout(entry.timer);
    entry.reject(new Error(reason));
  }
  waiting.clear();
}

/** The TUI's side of the Backend interface. */
export function makeTuiBackend(client: HerdrClient): Backend {
  return {
    getVersion: () => getTuiVersion(client),
    listSpaces: async () => {
      const snapshot = await client.request("session.snapshot");
      return snapshotToSpaces(snapshot);
    },
    readPane: async (paneId) => {
      // `recent_unwrapped` joins the lines the pane wrapped at its own width, so the phone can wrap
      // them at its width. `ansi` keeps the style codes, which mark the text the program dims.
      const params = {
        pane_id: paneId,
        source: "recent_unwrapped",
        format: "ansi",
        strip_ansi: false,
        lines: READ_LINES,
      };
      const reply = (await client.request("pane.read", params)) as { read?: { text?: string } };
      return reply.read?.text ?? "";
    },
    // `pane.send_text` presses no Enter; `pane.send_input` sends the text and the Enter together.
    sendLine: async (paneId, text) => {
      await client.request("pane.send_input", { pane_id: paneId, text, keys: ["enter"] });
    },
    pressKey: async (paneId, key) => {
      await client.request("pane.send_keys", { pane_id: paneId, keys: [key] });
    },
    // The snapshot is the TUI's one call that tells a pane's agent and its session.
    getPane: async (paneId) => {
      const located = findPane(snapshotToSpaces(await client.request("session.snapshot")), paneId);
      if (!located) throw new Error(`No pane ${paneId}`);
      const { pane } = located;
      return pane.agent ? pane : { ...pane, isShellForeground: await getIsShellForeground(client, paneId) };
    },
  };
}

/**
 * Whether the shell is in the pane's foreground process group, which a running command holds
 * instead. Undefined when the call fails, as the pane's other facts still serve.
 */
async function getIsShellForeground(client: HerdrClient, paneId: string): Promise<boolean | undefined> {
  try {
    const reply = (await client.request("pane.process_info", { pane_id: paneId })) as { process_info?: ProcessInfo };
    const { shell_pid: shellPid, foreground_processes: foreground } = reply.process_info ?? {};
    if (shellPid === undefined || !foreground) return undefined;
    return foreground.some((process) => process.pid === shellPid);
  } catch {
    return undefined;
  }
}

/** The TUI's version, from `ping`. */
async function getTuiVersion(client: HerdrClient): Promise<string> {
  const pong = (await client.request("ping")) as { version?: unknown };
  return String(pong.version ?? "unknown");
}

// Shape of the `session.snapshot` reply: flat lists, each item naming its parent by id.
type TuiWorkspace = { workspace_id?: string; label?: string };
type TuiTab = { tab_id?: string; workspace_id?: string; label?: string };
type TuiPane = {
  pane_id?: string;
  tab_id?: string;
  label?: string | null;
  cwd?: string;
  terminal_title_stripped?: string;
  agent?: string;
  agent_status?: string;
  agent_session?: { kind?: string; value?: string };
};
type ProcessInfo = { shell_pid?: number | null; foreground_processes?: { pid?: number }[] };
type TuiLayout = { panes?: { pane_id?: string; rect?: { width?: number } }[] };
type Snapshot = {
  snapshot?: { workspaces?: TuiWorkspace[]; tabs?: TuiTab[]; panes?: TuiPane[]; layouts?: TuiLayout[] };
};

/** Builds the workspaces, tabs and panes from the snapshot's flat lists, in their order. */
export function snapshotToSpaces(reply: unknown): Space[] {
  const { workspaces = [], tabs = [], panes = [], layouts = [] } = (reply as Snapshot).snapshot ?? {};
  const widths = getPaneWidths(layouts);
  return workspaces.map((workspace) => {
    const ownTabs = tabs.filter((tab) => tab.workspace_id === workspace.workspace_id);
    return {
      id: String(workspace.workspace_id),
      name: String(workspace.label ?? ""),
      tabs: ownTabs.map((tab) => toTab(tab, panes, widths)),
    };
  });
}

/** The width of each pane in the snapshot's layouts, by pane id. */
function getPaneWidths(layouts: TuiLayout[]): Map<string, number> {
  const widths = new Map<string, number>();
  const layoutPanes = layouts.flatMap((layout) => layout.panes ?? []);
  for (const { pane_id, rect } of layoutPanes) {
    if (pane_id && rect?.width) widths.set(pane_id, rect.width);
  }
  return widths;
}

/** The tab with its own panes, each with its width from the layouts. */
function toTab(tab: TuiTab, panes: TuiPane[], widths: Map<string, number>): Tab {
  const ownPanes = panes.filter((pane) => pane.tab_id === tab.tab_id);
  const toOwnPane = (pane: TuiPane) => toPane(pane, widths.get(String(pane.pane_id)) ?? null);
  return { id: String(tab.tab_id), name: String(tab.label ?? ""), panes: ownPanes.map(toOwnPane) };
}

/** A pane with no agent is a plain shell. */
function toPane(pane: TuiPane, columns: number | null): Pane {
  const id = String(pane.pane_id);
  const title = pane.label || pane.terminal_title_stripped || "";
  const shell = { id, title, agent: null, state: null, isFinished: false, columns, cwd: pane.cwd };
  if (!pane.agent) return shell;
  const agentPane = { ...shell, agent: pane.agent, state: toAgentState(pane.agent_status) };
  const { kind, value } = pane.agent_session ?? {};
  if (!value) return agentPane;
  if (kind === "id") return { ...agentPane, sessionId: value };
  return kind === "path" ? { ...agentPane, sessionPath: value } : agentPane;
}
