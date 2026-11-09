import type { PairingCode } from "@/pairing/code";

import { fillFormFromCode, parseMachineForm } from "./form";

const filled = { name: "test-box", host: "test-box.example.com", port: "22", user: "tester", password: "secret" };

describe("parseMachineForm", () => {
  it("returns the machine and password from a full form", () => {
    expect(parseMachineForm(filled)).toEqual({
      machine: { name: "test-box", host: "test-box.example.com", port: 22, user: "tester" },
      password: "secret",
    });
  });

  it("trims spaces around the text fields but not the password", () => {
    const parsed = parseMachineForm({ ...filled, name: " test-box ", host: " test-box.example.com ", password: " pw " });

    expect(parsed).toMatchObject({ machine: { name: "test-box", host: "test-box.example.com" }, password: " pw " });
  });

  it("needs no password for a machine paired by code", () => {
    expect(parseMachineForm({ ...filled, password: null })).toMatchObject({ password: null });
  });

  it("uses the address as the name when the name is empty", () => {
    expect(parseMachineForm({ ...filled, name: "" })).toMatchObject({ machine: { name: "test-box.example.com" } });
  });

  it.each([
    { field: "host", value: "", error: "Enter the address." },
    { field: "user", value: " ", error: "Enter the user name." },
    { field: "password", value: "", error: "Enter the password." },
    { field: "port", value: "0", error: "Enter a port from 1 to 65535." },
    { field: "port", value: "65536", error: "Enter a port from 1 to 65535." },
    { field: "port", value: "22a", error: "Enter a port from 1 to 65535." },
  ])("refuses $field '$value'", ({ field, value, error }) => {
    expect(parseMachineForm({ ...filled, [field]: value })).toEqual({ error });
  });
});

describe("fillFormFromCode", () => {
  const code: PairingCode = {
    name: "code-box",
    user: "code-user",
    host: "code-box.example.com",
    port: 2222,
    hostKeyFingerprints: ["SHA256:a"],
    oneTimeKeySeed: "seed",
  };
  const typed = { name: "", host: "", port: "22", user: "", password: null };

  it.each([
    { case: "an empty form", values: typed, name: "code-box", host: "code-box.example.com" },
    { case: "a typed address", values: { ...typed, host: "typed.example.com" }, name: "code-box", host: "typed.example.com" },
    { case: "a typed name", values: { ...typed, name: "My box" }, name: "My box", host: "code-box.example.com" },
    { case: "a typed name and address", values: { ...typed, name: "My box", host: "typed.example.com" }, name: "My box", host: "typed.example.com" },
    { case: "only spaces", values: { ...typed, name: " ", host: " " }, name: "code-box", host: "code-box.example.com" },
  ])("keeps what was typed and fills the rest: $case", ({ values, name, host }) => {
    expect(fillFormFromCode(values, code)).toMatchObject({ name, host });
  });

  it("always takes the user and port from the code and drops the password", () => {
    const values = { ...typed, user: "typed-user", port: "2200", password: "secret" };

    expect(fillFormFromCode(values, code)).toMatchObject({ user: "code-user", port: "2222", password: null });
  });
});
