import { EVENT_FEEDS, type EventFeed } from "@/herdr/events";
import type { HerdrKind } from "@/herdr/kinds";
import { JsonLineReader } from "@/rpc/lines";

import Ssh from "../../modules/ssh";
import { EVENTS_COMMANDS } from "./commands";
import { EVENTS_STREAM, listenToStream } from "./stream";

/** Events that come in a burst tell one change, this long after the first. */
export const CHANGE_WINDOW_MS = 500;
/** The desktop app sends a heartbeat every 15 s. Two missed in a row mean a dead link. */
export const HEARTBEAT_TIMEOUT_MS = 40_000;
/** The wait before the stream starts again, so a drop that ends the bridge too stops it first. */
export const RESTART_DELAY_MS = 1_000;
// A Herdr that cannot serve events closes the stream at once, every time. Live updates then stay
// off for this connection, and the list still loads and refreshes.
const MAX_CLOSES_WITHOUT_A_LINE = 3;

/** The live changes of a machine's Herdr, on a channel of their own beside the bridge's. */
export type Events = {
  /** Calls the listener once for a burst of changes. Returns the function that removes it. */
  onChange(listener: () => void): () => void;
  /** Ends the stream's listeners and timers. The connection's close ends the stream itself. */
  stop(): void;
};

/**
 * Starts the kind's events stream and keeps it running: it starts again when it closes while the
 * connection stays open (the TUI closes it with `events_lost`), and asks for a fresh list then.
 * `onDead` runs when the desktop app's heartbeat stops, so the caller can end the connection.
 */
export function startEvents(kind: HerdrKind, onDead: (reason: string) => void): Events {
  const stream = new EventStream(kind, onDead);
  stream.open(false);
  return { onChange: (listener) => stream.addListener(listener), stop: () => stream.stop() };
}

class EventStream {
  private readonly feed: EventFeed;
  private readonly listeners = new Set<() => void>();
  private isStopped = false;
  private closesWithoutALine = 0;
  private stopListening = () => {};
  private changeTimer: ReturnType<typeof setTimeout> | undefined;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly kind: HerdrKind,
    private readonly onDead: (reason: string) => void,
  ) {
    this.feed = EVENT_FEEDS[kind];
  }

  addListener(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  stop() {
    this.isStopped = true;
    this.stopListening();
    clearTimeout(this.changeTimer);
    clearTimeout(this.watchdog);
    clearTimeout(this.restartTimer);
    this.listeners.clear();
  }

  /** Starts the command, then sends the subscribe line. A start that fails counts as a close. */
  open(isRestart: boolean) {
    const reader = new JsonLineReader();
    const close = this.makeClose();
    this.stopListening = listenToStream(
      EVENTS_STREAM,
      (text) => {
        for (const message of reader.push(text)) this.receive(message);
      },
      close,
    );
    this.watchHeartbeat();
    Ssh.exec(EVENTS_STREAM, EVENTS_COMMANDS[this.kind])
      .then(() => Ssh.write(EVENTS_STREAM, `${this.feed.subscribeLine}\n`))
      .then(() => {
        // Changes while the stream was down are lost; the subscription is live again now.
        if (isRestart) this.scheduleChange();
      })
      .catch(close);
  }

  /** The close of one run of the stream: it counts once, however it is reported. */
  private makeClose(): () => void {
    let isOpen = true;
    return () => {
      if (!isOpen) return;
      isOpen = false;
      this.stopListening();
      clearTimeout(this.watchdog);
      this.closesWithoutALine += 1;
      if (this.isStopped || this.closesWithoutALine >= MAX_CLOSES_WITHOUT_A_LINE) return;
      this.restartTimer = setTimeout(() => this.open(true), RESTART_DELAY_MS);
    };
  }

  private receive(message: object) {
    this.closesWithoutALine = 0;
    this.watchHeartbeat();
    if (this.feed.isChange(message)) this.scheduleChange();
  }

  /** The first change of a burst starts the timer; the rest of the burst joins it. */
  private scheduleChange() {
    this.changeTimer ??= setTimeout(() => {
      this.changeTimer = undefined;
      for (const listener of [...this.listeners]) listener();
    }, CHANGE_WINDOW_MS);
  }

  private watchHeartbeat() {
    if (!this.feed.watchesHeartbeat) return;
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.onDead("no heartbeat"), HEARTBEAT_TIMEOUT_MS);
  }
}
