import { getErrorMessage } from "@/errorMessage";
import type { HerdrKind } from "@/herdr/kinds";
import type { SshErrorCode } from "../../modules/ssh";
import { RequestTimeoutError } from "@/rpc/client";

type ConnectFailure =
  | "hostKeyUnknown"
  | "hostKeyChanged"
  | "loginFailed"
  | "unreachable"
  | "herdrNotFound"
  | "noReply"
  | "closed"
  | "other";

/** The kind that was tried, and the kinds the machine offers. Known once detection has run. */
export type ConnectAttempt = { kind: HerdrKind; availableKinds: HerdrKind[] };

/**
 * Why connecting to a machine failed. For the host key failures, it carries the fingerprint.
 * After detection, it carries the attempt, so the person can try another kind.
 */
export class ConnectError extends Error {
  constructor(
    readonly reason: ConnectFailure,
    message: string,
    readonly fingerprint?: string,
    readonly attempt?: ConnectAttempt,
  ) {
    super(message);
    this.name = "ConnectError";
  }
}

const FAILURES_BY_CODE: Partial<Record<SshErrorCode, ConnectFailure>> = {
  HOST_KEY_UNKNOWN: "hostKeyUnknown",
  HOST_KEY_CHANGED: "hostKeyChanged",
  AUTH_FAILED: "loginFailed",
  UNREACHABLE: "unreachable",
};

const FINGERPRINT_PATTERN = /SHA256:[A-Za-z0-9+/]+/;
const EXPO_CAUSE_MARKER = "Caused by: ";

/** Turns an SSH module error, a request timeout or any other error into a ConnectError. */
export function toConnectError(error: unknown): ConnectError {
  if (error instanceof ConnectError) return error;
  if (error instanceof RequestTimeoutError) return new ConnectError("noReply", error.message);

  const message = removeExpoPrefix(getErrorMessage(error));
  const code = (error as { code?: SshErrorCode }).code;
  const reason = (code && FAILURES_BY_CODE[code]) ?? "other";
  const isHostKeyError = reason === "hostKeyUnknown" || reason === "hostKeyChanged";
  const fingerprint = isHostKeyError ? message.match(FINGERPRINT_PATTERN)?.[0] : undefined;
  return new ConnectError(reason, message, fingerprint);
}

// Expo wraps a native error in "Call to function '...' has been rejected.\n→ Caused by: <cause>".
function removeExpoPrefix(message: string): string {
  const at = message.lastIndexOf(EXPO_CAUSE_MARKER);
  return at === -1 ? message : message.slice(at + EXPO_CAUSE_MARKER.length);
}

/** A one-line message for the person, naming the machine. */
export function describeConnectError(
  error: ConnectError,
  machine: { name: string; host: string },
): string {
  switch (error.reason) {
    case "loginFailed":
      return "Login failed. Check the user name and password.";
    case "unreachable":
      return `Cannot reach ${machine.host}.`;
    case "herdrNotFound":
      return `No Herdr found on ${machine.name}.`;
    case "noReply":
      return `Herdr on ${machine.name} did not answer.`;
    case "hostKeyUnknown":
      return `The host key of ${machine.host} is not trusted yet.`;
    case "hostKeyChanged":
      return `The host key of ${machine.host} has changed. Herdhand will not connect.`;
    case "closed":
      return `The connection to ${machine.name} closed: ${error.message}`;
    case "other":
      return error.message;
  }
}
