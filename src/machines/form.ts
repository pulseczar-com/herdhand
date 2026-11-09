import type { PairingCode } from "@/pairing/code";

import type { NewMachine } from "./store";

export type MachineFormValues = {
  name: string;
  host: string;
  port: string;
  user: string;
  /** Null for a machine paired by code, which logs in with the phone key. */
  password: string | null;
};

export type ParsedMachine = { machine: NewMachine; password: string | null };

type ParsedMachineForm = ParsedMachine | { error: string };

const MIN_PORT = 1;
const MAX_PORT = 65535;

/** Checks the "Add a machine" form and returns the machine to save, or the first problem. */
export function parseMachineForm(values: MachineFormValues): ParsedMachineForm {
  const host = values.host.trim();
  const user = values.user.trim();
  const port = Number(values.port.trim());
  if (!host) return { error: "Enter the address." };
  if (!user) return { error: "Enter the user name." };
  if (values.password === "") return { error: "Enter the password." };
  if (!isPort(port)) return { error: `Enter a port from ${MIN_PORT} to ${MAX_PORT}.` };

  const name = values.name.trim() || host;
  return { machine: { name, host, port, user }, password: values.password };
}

export function isPort(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_PORT && value <= MAX_PORT;
}

/**
 * The form after a pairing code is scanned. A name or address the person already typed stays;
 * only an empty one is filled from the code. The user and port always come from the code, and the
 * password goes, because the phone key replaces it.
 */
export function fillFormFromCode(values: MachineFormValues, code: PairingCode): MachineFormValues {
  return {
    name: values.name.trim() ? values.name : code.name,
    host: values.host.trim() ? values.host : code.host,
    port: String(code.port),
    user: code.user,
    password: null,
  };
}
