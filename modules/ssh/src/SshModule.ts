import { NativeModule, requireNativeModule } from "expo";

export type ConnectOptions = {
  host: string;
  port: number;
  user: string;
  /** Null signs in with the phone key. */
  password: string | null;
  /** The saved "SHA256:..." fingerprint, or null on the first connect. */
  trustedFingerprint: string | null;
  /** The machine's name, shown in the notice that keeps the connection open in the background. */
  label: string;
};

export type PairOptions = {
  host: string;
  port: number;
  user: string;
  /** The "SHA256:..." fingerprints of the machine's host keys, from the pairing code. */
  hostKeyFingerprints: string[];
  /** The one-time key's 32-byte Ed25519 seed, in base64. */
  oneTimeKeySeed: string;
  /** The phone key's authorized_keys line, with its comment. */
  phoneKeyLine: string;
};

export type PhoneKey = {
  /** "ecdsa-sha2-nistp256 AAAA...", with no comment. */
  publicKey: string;
  /** "SHA256:..." */
  fingerprint: string;
  /** When the key was made, in milliseconds since 1970. */
  createdAt: number;
};

/** How a command from `run` ended: its whole stdout as text, and its exit code (-1 when it sent none). */
export type RunResult = {
  output: string;
  exitCode: number;
};

export type SshModuleEvents = {
  onData: (event: { text: string }) => void;
  onClosed: (event: { reason: string }) => void;
};

/**
 * Error codes `connect` and `pair` reject with. For the two host key codes, the error message holds the
 * "SHA256:..." fingerprint the host presented. Expo can put text before it.
 */
export type SshErrorCode =
  | "HOST_KEY_UNKNOWN"
  | "HOST_KEY_CHANGED"
  | "AUTH_FAILED"
  | "UNREACHABLE"
  | "NOT_CONNECTED"
  | "PAIRING_REFUSED"
  | "PAIRING_NOT_FINISHED"
  | "SSH_ERROR";

declare class SshModule extends NativeModule<SshModuleEvents> {
  /**
   * Connects, and while the connection is open, holds it in the background with a notice that
   * has a Disconnect action. Disconnect closes the connection and fires `onClosed` with the
   * reason "disconnect requested".
   */
  connect(options: ConnectOptions): Promise<void>;
  /** Starts a plain command (no terminal). Only one runs at a time; a new one ends the last. */
  exec(command: string): Promise<void>;
  /**
   * Runs one plain command (no terminal) on a channel of its own, beside the one `exec` holds, and
   * resolves with all of its stdout once it ends. The connection stays open for both. Rejects
   * with NOT_CONNECTED, or SSH_ERROR when the command runs too long or prints too much.
   */
  run(command: string): Promise<RunResult>;
  /** Writes to the running command's stdin. */
  write(text: string): Promise<void>;
  close(): Promise<void>;
  /** This phone's key, made in the Android Keystore the first time. */
  getPhoneKey(): Promise<PhoneKey>;
  /**
   * Gives the phone key to a machine that runs the pairing script, then signs in with it to
   * prove it works. Uses connections of its own. Resolves with the host key fingerprint.
   */
  pair(options: PairOptions): Promise<string>;
}

export default requireNativeModule<SshModule>("Ssh");
