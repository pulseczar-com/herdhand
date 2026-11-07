import { Platform } from "react-native";

import Ssh from "../../modules/ssh";

import type { PairingCode } from "@/pairing/code";
import { makePhoneKeyComment } from "@/pairing/phoneKey";

import { toConnectError } from "./errors";

/** This phone's key: its authorized_keys line, the comment that ends it, and its fingerprint. */
export type PhoneKey = { line: string; comment: string; fingerprint: string };

type PairTarget = { host: string; port: number; user: string };

/** This phone's key. The native module makes it the first time. */
export async function getPhoneKey(): Promise<PhoneKey> {
  const key = await Ssh.getPhoneKey();
  const model = (Platform.constants as { Model?: string }).Model;
  const comment = makePhoneKeyComment(model, key.createdAt);
  return { line: `${key.publicKey} ${comment}`, comment, fingerprint: key.fingerprint };
}

/**
 * Gives the phone key to the machine in a pairing code and proves it logs in. The person may
 * have changed the address, port or user the code gave, so those come from `target`.
 * Resolves with the machine's host key fingerprint. Rejects with a ConnectError.
 */
export async function pairMachine(code: PairingCode, target: PairTarget): Promise<string> {
  try {
    const phoneKey = await getPhoneKey();
    return await Ssh.pair({
      host: target.host,
      port: target.port,
      user: target.user,
      hostKeyFingerprints: code.hostKeyFingerprints,
      oneTimeKeySeed: code.oneTimeKeySeed,
      phoneKeyLine: phoneKey.line,
    });
  } catch (error) {
    throw toConnectError(error);
  }
}
