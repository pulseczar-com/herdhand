import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionsAndroid } from "react-native";

import type { Backend } from "@/herdr/backend";
import type { HerdrKind } from "@/herdr/kinds";
import { getNotificationPermissionAsked, saveNotificationPermissionAsked } from "@/settings/store";
import type { HostReader } from "@/ssh/hostReader";
import { type Bridge, closeOpenBridge, DISCONNECT_REQUESTED, getOpenBridge, openBridge, type RunCommand } from "@/ssh/bridge";
import { type ConnectAttempt, ConnectError, describeConnectError, toConnectError } from "@/ssh/errors";

import {
  getMachine,
  getSignInPassword,
  getTrustedFingerprint,
  type Machine,
  saveMachineKind,
  saveTrustedFingerprint,
} from "./store";

export type ConnectionStatus =
  | { phase: "connecting" }
  | { phase: "trust"; fingerprint: string }
  /** The person disconnected from the notice. The app does not reconnect by itself. */
  | { phase: "disconnected" }
  | { phase: "connected"; kind: HerdrKind; availableKinds: HerdrKind[]; version: string; backend: Backend; host: HostReader; run: RunCommand }
  | {
      phase: "failed";
      message: string;
      savedFingerprint?: string;
      presentedFingerprint?: string;
      /** Set once the machine's Herdr kinds are known, so the person can try another kind. */
      attempt?: ConnectAttempt;
    };

const CONNECTING: ConnectionStatus = { phase: "connecting" };

/**
 * The waits before each retry of a link that dropped: quick at first, then once a minute at most.
 * The last wait repeats until the machine answers or the login fails.
 */
export const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000];

/** How long the check on return to the app waits for a reply before it treats the link as dead. */
export const PROBE_TIMEOUT_MS = 5_000;

/**
 * Connects to a saved machine, or shows the connection it already has open. The connection
 * stays open when the screen leaves; `disconnect`, a kind switch, an error or a Disconnect from
 * the notice closes it.
 * Exposes the steps the person can take: trust a new host key, switch kind, reconnect.
 * Reconnects a link that dropped on its own, with a growing wait between tries while the app is in
 * use. When the app is in use again (`isForeground`), it reconnects a link that dropped or no
 * longer replies at once, since Android can cut a background app's network.
 */
export function useMachineConnection(id: string, isForeground: boolean) {
  const [machine, setMachine] = useState<Machine>();
  const [status, setStatus] = useState<ConnectionStatus>(CONNECTING);
  const bridge = useRef<Bridge | null>(null);
  // The machine the hook serves now, or null once the screen left. The page moves one
  // connection between machines, so a late result for another machine is dropped.
  const servedId = useRef<string | null>(id);
  const isAfterDrop = useRef(false);
  // The app opens under the lock, so the first connect waits until the app is first in use.
  const [hasBeenForeground, setHasBeenForeground] = useState(isForeground);
  if (isForeground && !hasBeenForeground) setHasBeenForeground(true);
  // Each connect gets a number, so the result of one that a newer connect replaced is dropped.
  const generation = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const retryCount = useRef(0);
  const connectAgain = useRef<() => Promise<void>>(async () => {});
  const isForegroundNow = useRef(isForeground);

  /** The one way back from every drop: waits, then connects again if the app is in use. */
  const scheduleRetry = useCallback(() => {
    clearTimeout(retryTimer.current);
    const delay = RETRY_DELAYS_MS[Math.min(retryCount.current, RETRY_DELAYS_MS.length - 1)];
    retryCount.current += 1;
    retryTimer.current = setTimeout(() => {
      // Away from the app, its return connects at once instead.
      if (isForegroundNow.current) void connectAgain.current();
    }, delay);
  }, []);

  /**
   * Shows an open bridge as connected, its drop as a failure the app reconnects on return, and
   * a disconnect the person asked for as a state the app leaves alone.
   */
  const showOpen = useCallback((opened: Bridge, saved: Machine) => {
    bridge.current = opened;
    isAfterDrop.current = false;
    retryCount.current = 0;
    setStatus({
      phase: "connected",
      kind: opened.kind,
      availableKinds: opened.availableKinds,
      version: opened.version,
      backend: opened.backend,
      host: opened.host,
      run: opened.run,
    });
    void opened.closed.then((reason) => {
      if (bridge.current !== opened || servedId.current !== saved.id) return;
      if (reason === DISCONNECT_REQUESTED) {
        setStatus({ phase: "disconnected" });
        return;
      }
      isAfterDrop.current = true;
      const attempt = { kind: opened.kind, availableKinds: opened.availableKinds };
      const dropped = new ConnectError("closed", reason, undefined, attempt);
      setStatus(getFailureStatus(dropped, saved, null));
      scheduleRetry();
    });
  }, [scheduleRetry]);

  const connectTo = useCallback(async (saved: Machine | undefined) => {
    const thisConnect = ++generation.current;
    clearTimeout(retryTimer.current);
    await closeBridge(bridge);
    // The screen left or moved to another machine, or a newer connect took over.
    const isOutdated = () => servedId.current !== saved?.id || generation.current !== thisConnect;
    if (!saved || isOutdated()) return;
    setMachine(saved);
    setStatus(CONNECTING);
    const [password, trustedFingerprint] = await Promise.all([getSignInPassword(saved), getTrustedFingerprint(saved.id)]);
    if (isOutdated()) return;
    try {
      const opened = await openBridge({ machine: saved, password, trustedFingerprint });
      // The hook moved on meanwhile. A screen that left keeps the bridge for its machine's next
      // screen. The next `openBridge` call, for another machine, closes it.
      if (isOutdated()) return;
      showOpen(opened, saved);
      void askNotificationPermissionOnce();
    } catch (error) {
      if (isOutdated()) return;
      const connectError = toConnectError(error);
      if (isDisconnectRequested(connectError)) {
        isAfterDrop.current = false;
        setStatus({ phase: "disconnected" });
        return;
      }
      // A failed reconnect after a drop retries on return only while the network is the cause.
      isAfterDrop.current = isAfterDrop.current && isNetworkFailure(connectError);
      setStatus(getFailureStatus(connectError, saved, trustedFingerprint));
      if (isAfterDrop.current) scheduleRetry();
    }
  }, [showOpen, scheduleRetry]);

  const connect = useCallback(() => getMachine(id).then(connectTo), [id, connectTo]);
  useEffect(() => {
    connectAgain.current = connect;
    isForegroundNow.current = isForeground;
  }, [connect, isForeground]);

  /** Reconnects when the open link gives no reply, unless a newer link already replaced it. */
  const reconnectIfSilent = useCallback(
    async (probed: Backend) => {
      const isLive = await isAnswering(probed);
      const probedBridge = bridge.current;
      // The screen moved on, or a newer link took the probed one's place.
      const isStale = servedId.current !== id || probedBridge?.backend !== probed;
      if (isLive || isStale) return;
      if (probedBridge.endReason === DISCONNECT_REQUESTED) return;
      isAfterDrop.current = true;
      await connect();
    },
    [id, connect],
  );

  const showKept = useCallback(
    async (kept: Bridge) => {
      const saved = await getMachine(id);
      if (!saved || servedId.current !== saved.id) return;
      setMachine(saved);
      showOpen(kept, saved);
      await reconnectIfSilent(kept.backend);
    },
    [id, showOpen, reconnectIfSilent],
  );

  useEffect(() => {
    if (!hasBeenForeground) return;
    servedId.current = id;
    const kept = getOpenBridge(id);
    void (kept ? showKept(kept) : connect());
    return () => {
      servedId.current = null;
      clearTimeout(retryTimer.current);
    };
  }, [id, hasBeenForeground, connect, showKept]);

  useEffect(() => {
    // On the first render the status is still "connecting", so this acts only on a return.
    if (!isForeground) return;
    if (status.phase === "failed" && isAfterDrop.current) {
      void connect();
    } else if (status.phase === "connected") {
      void reconnectIfSilent(status.backend);
    }
    // Runs on the change of isForeground only: a status change while in use is not a return.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isForeground]);

  const trust = useCallback(
    async (fingerprint: string) => {
      await saveTrustedFingerprint(id, fingerprint);
      await connect();
    },
    [id, connect],
  );

  const switchKind = useCallback(
    async (kind: HerdrKind) => {
      await saveMachineKind(id, kind);
      await connect();
    },
    [id, connect],
  );

  const disconnect = useCallback(() => {
    bridge.current = null;
    isAfterDrop.current = false;
    clearTimeout(retryTimer.current);
    return closeOpenBridge(id);
  }, [id]);

  // Until the first step for a new id runs, the state still holds the last machine's.
  const isForId = machine?.id === id;
  const statusForId = isForId ? status : CONNECTING;
  return { status: statusForId, reconnect: connect, trust, switchKind, disconnect };
}

/**
 * Android 13 and later hide the notice that holds the connection without this permission. The
 * service runs without it, so the app asks once, on the first connect, and not again.
 */
async function askNotificationPermissionOnce() {
  if (await getNotificationPermissionAsked()) return;
  await saveNotificationPermissionAsked();
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
}

function isDisconnectRequested(error: ConnectError): boolean {
  return error.reason === "closed" && error.message === DISCONNECT_REQUESTED;
}

function isNetworkFailure(error: ConnectError): boolean {
  return error.reason === "unreachable" || error.reason === "noReply";
}

/** The host key prompt for a new key; otherwise the error, with both keys when the key changed. */
function getFailureStatus(error: ConnectError, machine: Machine, savedFingerprint: string | null): ConnectionStatus {
  if (error.reason === "hostKeyUnknown" && error.fingerprint) {
    return { phase: "trust", fingerprint: error.fingerprint };
  }
  const message = describeConnectError(error, machine);
  return {
    phase: "failed",
    message,
    savedFingerprint: savedFingerprint ?? undefined,
    presentedFingerprint: error.fingerprint,
    attempt: error.attempt,
  };
}

/** Whether the backend answers within PROBE_TIMEOUT_MS. */
function isAnswering(backend: Backend): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), PROBE_TIMEOUT_MS);
  });
  const reply = backend.getVersion().then(
    () => true,
    () => false,
  );
  return Promise.race([reply, timeout]).finally(() => clearTimeout(timer));
}

async function closeBridge(bridge: { current: Bridge | null }) {
  const open = bridge.current;
  bridge.current = null;
  await open?.close();
}
