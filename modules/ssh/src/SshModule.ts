import { NativeModule, requireNativeModule } from "expo";

export type ConnectOptions = {
  host: string;
  port: number;
  user: string;
  password: string;
  /** The saved "SHA256:..." fingerprint, or null on the first connect. */
  trustedFingerprint: string | null;
  /** The machine's name, shown in the notice that keeps the connection open in the background. */
  label: string;
};

export type SshModuleEvents = {
  onData: (event: { text: string }) => void;
  onClosed: (event: { reason: string }) => void;
};

/**
 * Error codes `connect` rejects with. For the two host key codes, the error message holds the
 * "SHA256:..." fingerprint the host presented. Expo can put text before it.
 */
export type SshErrorCode =
  | "HOST_KEY_UNKNOWN"
  | "HOST_KEY_CHANGED"
  | "AUTH_FAILED"
  | "UNREACHABLE"
  | "NOT_CONNECTED"
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
  /** Writes to the running command's stdin. */
  write(text: string): Promise<void>;
  close(): Promise<void>;
}

export default requireNativeModule<SshModule>("Ssh");
