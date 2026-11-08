import {
  createJSONRPCErrorResponse,
  JSONRPCClient,
  JSONRPCErrorException,
  type JSONRPCResponse,
} from "json-rpc-2.0";

import { type HerdrClient, REQUEST_TIMEOUT_MS, RequestTimeoutError } from "@/rpc/client";

import {
  type Backend,
  type Pane,
  READ_LINES,
  type Space,
  type Tab,
  toAgentState,
  toBlockedKind,
} from "./backend";

// json-rpc-2.0 reports a timeout as an error reply with this code. Herdr's errors use the
// negative JSON-RPC codes, so the two cannot be confused.
const TIMEOUT_ERROR_CODE = 1;

/** The protocol generation this app speaks to the desktop app's core. */
const PROTOCOL_GENERATION = 1;

// The layout document the desktop app keeps its spaces, tabs and splits in.
const LAYOUT_DOC = "herdr-app";

/** Client for the desktop app's `hc connect`, which speaks JSON-RPC 2.0 over newline JSON. */
export function makeDesktopClient(send: (line: string) => void): HerdrClient {
  const client = new JSONRPCClient((payload) => send(JSON.stringify(payload)));
  const withTimeout = client.timeout(REQUEST_TIMEOUT_MS, (id) =>
    createJSONRPCErrorResponse(id, TIMEOUT_ERROR_CODE, "Request timeout"),
  );

  async function request(method: string, params?: object): Promise<unknown> {
    try {
      return await withTimeout.request(method, params);
    } catch (error) {
      throw isTimeout(error) ? new RequestTimeoutError(method) : error;
    }
  }

  return {
    request,
    receive: (message) => client.receive(message as JSONRPCResponse),
    rejectAll: (reason) => client.rejectAllPendingRequests(reason),
  };
}

function isTimeout(error: unknown): boolean {
  return error instanceof JSONRPCErrorException && error.code === TIMEOUT_ERROR_CODE;
}

/** The desktop app's side of the Backend interface. */
export function makeDesktopBackend(client: HerdrClient): Backend {
  return {
    getVersion: () => getDesktopVersion(client),
    listSpaces: async () => {
      const [doc, terminals] = await Promise.all([
        client.request("doc.get", { name: LAYOUT_DOC }),
        client.request("terminal.list", { all: true }),
      ]);
      return toSpaces(doc, terminals);
    },
    readPane: async (paneId) => {
      const params = { terminal: paneId, lines: READ_LINES };
      const read = (await client.request("terminal.read", params)) as { text?: string };
      return read.text ?? "";
    },
    // Herdr refuses a line to a blocked agent; the key row answers its prompt instead.
    sendLine: async (paneId, text) => {
      await client.request("terminal.send", { terminal: paneId, text });
    },
    pressKey: async (paneId, key) => {
      await client.request("terminal.keys", { terminal: paneId, keys: [key] });
    },
    getPane: async (paneId) => {
      const terminal = (await client.request("terminal.get", { terminal: paneId })) as Terminal;
      return toPane(terminal);
    },
  };
}

/** The desktop app's version, from the `hello` handshake. */
async function getDesktopVersion(client: HerdrClient): Promise<string> {
  const hello = (await client.request("hello", { generation: PROTOCOL_GENERATION })) as {
    version?: unknown;
  };
  return String(hello.version ?? "unknown");
}

// Shapes of the `doc.get` and `terminal.list` replies. The layout document has no schema, so
// every field is optional.
type LayoutNode = { content?: { terminal?: string }; children?: LayoutNode[] };
type LayoutTab = { id?: string; name?: string; root?: LayoutNode };
type LayoutSpace = { id?: string; name?: string; tabs?: LayoutTab[] };
type LayoutDoc = { value?: { spaces?: LayoutSpace[] } };
type Terminal = {
  address?: string;
  cols?: number;
  state?: string;
  title?: string;
  argv?: string[];
  foreground?: { pid?: number; name?: string } | null;
  status?: { app?: string; state?: string; kind?: string | null; msg?: string } | null;
};
type TerminalList = { terminals?: Terminal[] };

/** Builds the spaces from the layout document, and each pane's state from its terminal. */
export function toSpaces(doc: unknown, terminalList: unknown): Space[] {
  const terminals = getTerminalsByAddress(terminalList as TerminalList);
  const spaces = (doc as LayoutDoc).value?.spaces ?? [];
  return spaces.map((space) => ({
    id: String(space.id),
    name: String(space.name ?? ""),
    tabs: (space.tabs ?? []).map((tab, index) => toTab(tab, index, terminals)),
  }));
}

function getTerminalsByAddress(list: TerminalList): Map<string, Terminal> {
  const terminals = new Map<string, Terminal>();
  for (const terminal of list.terminals ?? []) {
    if (terminal.address) terminals.set(terminal.address, terminal);
  }
  return terminals;
}

/** A tab's panes are the terminals in its split tree that `terminal.list` has, finished ones too. */
function toTab(tab: LayoutTab, index: number, terminals: Map<string, Terminal>): Tab {
  const tabTerminals = getTerminalAddresses(tab.root)
    .map((address) => terminals.get(address))
    .filter((terminal) => terminal !== undefined);
  return { id: String(tab.id), name: getTabName(tab.name, index), panes: tabTerminals.map(toPane) };
}

// The desktop app shows a tab with no name by its position.
function getTabName(name: string | undefined, index: number): string {
  return name || String(index + 1);
}

/** The terminal of every pane in a split tree, depth first, which is Herdr's order. */
function getTerminalAddresses(node: LayoutNode | undefined): string[] {
  if (!node) return [];
  const own = node.content?.terminal ? [node.content.terminal] : [];
  return [...own, ...(node.children ?? []).flatMap(getTerminalAddresses)];
}

/**
 * Whether the shell the terminal started holds its foreground, by the program's name: the login
 * shell's name has a leading dash. Undefined when Herdr gives no foreground.
 */
function isShellForeground({ argv, foreground }: Terminal): boolean | undefined {
  if (!foreground?.name || !argv?.[0]) return undefined;
  return foreground.name === argv[0].split("/").pop()?.replace(/^-/, "");
}

/** A finished terminal shows no agent, and a terminal with no status is a plain shell. */
function toPane(terminal: Terminal): Pane {
  const { status } = terminal;
  const id = String(terminal.address);
  const title = terminal.title ?? "";
  const columns = terminal.cols || null;
  const shell = { id, title, agent: null, state: null, columns };
  if (terminal.state === "finished") return { ...shell, isFinished: true };
  if (!status) return { ...shell, isFinished: false, isShellForeground: isShellForeground(terminal) };
  return {
    id,
    title,
    agent: status.app ?? null,
    state: toAgentState(status.state),
    isFinished: false,
    columns,
    pid: terminal.foreground?.pid,
    message: status.msg,
    blockedKind: toBlockedKind(status.kind),
  };
}
