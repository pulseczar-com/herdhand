import type { NewMachine } from "./store";

export type MachineFormValues = {
  name: string;
  host: string;
  port: string;
  user: string;
  password: string;
};

export type ParsedMachine = { machine: NewMachine; password: string };

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
  if (!values.password) return { error: "Enter the password." };
  if (!isPort(port)) return { error: `Enter a port from ${MIN_PORT} to ${MAX_PORT}.` };

  const name = values.name.trim() || host;
  return { machine: { name, host, port, user }, password: values.password };
}

function isPort(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_PORT && value <= MAX_PORT;
}
