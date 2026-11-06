import Ssh from "../../modules/ssh";

import type { Backend } from "@/herdr/backend";
import { makeDesktopBackend, makeDesktopClient } from "@/herdr/desktop";
import type { HerdrKind } from "@/herdr/kinds";
import { makeTuiBackend, makeTuiClient } from "@/herdr/tui";
import type { Machine } from "@/machines/store";
import { type HerdrClient, REQUEST_TIMEOUT_MS, RequestTimeoutError } from "@/rpc/client";
import { JsonLineReader } from "@/rpc/lines";

import { BRIDGE_COMMANDS, DETECT_COMMAND, parseDetection } from "./commands";
import { type ConnectAttempt, ConnectError, toConnectError } from "./errors";

/** The `onClosed` reason the native module gives when the person disconnects from the notice. */
export const DISCONNECT_REQUESTED = "disconnect requested";

type OpenBridgeOptions = {
  machine: Machine;
  password: string;
  trustedFingerprint: string | null;
};

/** A running Herdr bridge on a machine, its version, and the kinds the machine offers. */
export type Bridge = {
  machineId: string;
  kind: HerdrKind;
  availableKinds: HerdrKind[];
  version: string;
  backend: Backend;
  /**
   * Resolves with the reason when the bridge ends without `close`: the command exited, the
   * link dropped, or the person disconnected (DISCONNECT_REQUESTED). The connection is closed
   * by then.
   */
  closed: Promise<string>;
  /**
   * The reason the bridge ended, or null while it runs. It is set the moment the end arrives,
   * before pending requests fail and before `closed` settles.
   */
  readonly endReason: string | null;
  close(): Promise<void>;
};

type KindParts = {
  makeClient(send: (line: string) => void): HerdrClient;
  makeBackend(client: HerdrClient): Backend;
};

const KIND_PARTS: Record<HerdrKind, KindParts> = {
  desktop: { makeClient: makeDesktopClient, makeBackend: makeDesktopBackend },
  tui: { makeClient: makeTuiClient, makeBackend: makeTuiBackend },
};

// The native module holds one connection, so attempts run one after another. The tail of the
// queue is the last attempt, and `current` is the bridge that is open now. It stays open for
// the life of the app, across screens, until it is closed or it drops.
let queueTail: Promise<unknown> = Promise.resolve();
let current: Bridge | null = null;

/** The machine's open bridge, or null when that machine has none. */
export function getOpenBridge(machineId: string): Bridge | null {
  return current?.machineId === machineId ? current : null;
}

/** Closes the machine's bridge, also one still opening: it waits for the queued attempts first. */
export async function closeOpenBridge(machineId: string): Promise<void> {
  await queueTail;
  await getOpenBridge(machineId)?.close();
}

/**
 * Logs in over SSH, finds which Herdr the machine runs, starts its bridge and reads its version.
 * Uses the machine's saved kind when the machine still offers it, or else the first kind found.
 * Waits for earlier attempts to settle, then closes the bridge they left open.
 * Rejects with a ConnectError, and leaves nothing open when it does.
 */
export function openBridge(options: OpenBridgeOptions): Promise<Bridge> {
  const opening = queueTail.then(() => attemptOpen(options));
  queueTail = opening.catch(() => undefined);
  return opening;
}

async function attemptOpen({ machine, password, trustedFingerprint }: OpenBridgeOptions): Promise<Bridge> {
  let attempt: ConnectAttempt | undefined;
  let wasDisconnectRequested = false;
  const watchDisconnect = Ssh.addListener("onClosed", (event) => {
    if (event.reason === DISCONNECT_REQUESTED) wasDisconnectRequested = true;
  });
  try {
    await current?.close();
    await Ssh.connect({
      host: machine.host,
      port: machine.port,
      user: machine.user,
      password,
      trustedFingerprint,
      label: machine.name,
    });
    const detectionOutput = await runToEnd(DETECT_COMMAND);
    const availableKinds = parseDetection(detectionOutput);
    const kind = chooseKind(availableKinds, machine.kind);
    attempt = { kind, availableKinds };
    const bridge = await startKindBridge(machine.id, attempt);
    current = bridge;
    return bridge;
  } catch (error) {
    await Ssh.close();
    if (wasDisconnectRequested) throw new ConnectError("closed", DISCONNECT_REQUESTED);
    const failure = toConnectError(error);
    throw withAttempt(failure, attempt);
  } finally {
    watchDisconnect.remove();
  }
}

/**
 * Runs a short command and resolves with all of its output once it ends. Rejects when it runs
 * past REQUEST_TIMEOUT_MS, so a hung command cannot hold the queue of attempts forever.
 */
function runToEnd(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const stopListening = listenToCommand(
      (text) => {
        output += text;
      },
      () => settle(() => resolve(output)),
    );
    const rejectAsHung = () => settle(() => reject(new RequestTimeoutError(command)));
    const timer = setTimeout(rejectAsHung, REQUEST_TIMEOUT_MS);
    Ssh.exec(command).catch((error: unknown) => settle(() => reject(error)));

    function settle(finish: () => void) {
      clearTimeout(timer);
      stopListening();
      finish();
    }
  });
}

/** The saved kind when the machine still offers it, or else the first kind found. */
function chooseKind(available: HerdrKind[], saved: HerdrKind | undefined): HerdrKind {
  if (available.length === 0) throw new ConnectError("herdrNotFound", "No Herdr found");
  if (saved && available.includes(saved)) return saved;
  return available[0];
}

/**
 * Starts the kind's bridge and reads Herdr's version. Stops the bridge when the read fails.
 * The open bridge clears `current` once it closes.
 */
async function startKindBridge(machineId: string, { kind, availableKinds }: ConnectAttempt): Promise<Bridge> {
  const { client, stop, ended, getEndReason } = await startBridge(kind);
  const backend = KIND_PARTS[kind].makeBackend(client);
  const version = await backend.getVersion().catch(async (error: unknown) => {
    await stop();
    throw error;
  });
  let closing: Promise<void> | undefined;
  const bridge: Bridge = {
    machineId,
    kind,
    availableKinds,
    version,
    backend,
    get endReason() {
      return getEndReason();
    },
    // A drop leaves the SSH login open; closing it also ends the notice that holds it.
    closed: ended.then(async (reason) => {
      await bridge.close();
      return reason;
    }),
    close: () => {
      closing ??= stop().finally(() => {
        if (current === bridge) current = null;
      });
      return closing;
    },
  };
  return bridge;
}

/** A running bridge command, the client fed by its output, and its end. */
type StartedBridge = {
  client: HerdrClient;
  stop(): Promise<void>;
  ended: Promise<string>;
  getEndReason(): string | null;
};

/**
 * Starts the kind's bridge command and connects its output to a client for that kind.
 * `ended` resolves with the reason when the command ends before `stop`.
 */
async function startBridge(kind: HerdrKind): Promise<StartedBridge> {
  const reader = new JsonLineReader();
  const client = KIND_PARTS[kind].makeClient((line) => {
    Ssh.write(`${line}\n`).catch((error: unknown) => client.rejectAll(String(error)));
  });
  let endReason: string | null = null;
  let resolveEnded: (reason: string) => void = () => {};
  const ended = new Promise<string>((resolve) => (resolveEnded = resolve));
  const stopListening = listenToCommand(
    (text) => {
      for (const message of reader.push(text)) client.receive(message);
    },
    (reason) => {
      endReason = reason;
      detach();
      resolveEnded(reason);
    },
  );
  function detach() {
    stopListening();
    client.rejectAll("Connection closed");
  }
  async function stop() {
    detach();
    await Ssh.close();
  }

  try {
    await Ssh.exec(BRIDGE_COMMANDS[kind]);
  } catch (error) {
    detach();
    throw error;
  }
  return { client, stop, ended, getEndReason: () => endReason };
}

/** The failure, with the attempt when detection had run, so the person can try another kind. */
function withAttempt(failure: ConnectError, attempt: ConnectAttempt | undefined): ConnectError {
  if (!attempt) return failure;
  return new ConnectError(failure.reason, failure.message, failure.fingerprint, attempt);
}

/** Listens to the running command's output and end. Returns the function that stops listening. */
function listenToCommand(onData: (text: string) => void, onEnd: (reason: string) => void): () => void {
  const dataListener = Ssh.addListener("onData", (event) => onData(event.text));
  const closedListener = Ssh.addListener("onClosed", (event) => onEnd(event.reason));
  return () => {
    dataListener.remove();
    closedListener.remove();
  };
}
