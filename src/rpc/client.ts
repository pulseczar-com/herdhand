/** How long a request waits for its reply before it fails. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** A request/reply client over a line stream. The bridge feeds it every JSON line it reads. */
export type HerdrClient = {
  request(method: string, params?: object): Promise<unknown>;
  receive(message: object): void;
  /** Fails every request still waiting, for example when the connection closes. */
  rejectAll(reason: string): void;
};

/** A request that got no reply in time. Kept apart from errors that Herdr itself returns. */
export class RequestTimeoutError extends Error {
  constructor(method: string) {
    super(`No reply to ${method}`);
    this.name = "RequestTimeoutError";
  }
}
