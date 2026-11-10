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

  it("uses port 22 when the port is empty", () => {
    expect(parseMachineForm({ ...filled, port: " " })).toMatchObject({ machine: { port: 22 } });
  });

  it("uses the address as the name when the name is empty", () => {
    expect(parseMachineForm({ ...filled, name: "" })).toMatchObject({ machine: { name: "test-box.example.com" } });
  });

  it.each([
    { field: "host", value: "", error: "Enter the host." },
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
  const typed = { name: "", host: "", port: "", user: "", password: null };

  it.each([
    { case: "an empty form", values: typed, name: "code-box", host: "code-box.example.com" },
    { case: "a typed address", values: { ...typed, host: "typed.example.com" }, name: "code-box", host: "typed.example.com" },
    { case: "a typed name", values: { ...typed, name: "My box" }, name: "My box", host: "code-box.example.com" },
    { case: "a typed name and address", values: { ...typed, name: "My box", host: "typed.example.com" }, name: "My box", host: "typed.example.com" },
    { case: "only spaces", values: { ...typed, name: " ", host: " " }, name: "code-box", host: "code-box.example.com" },
  ])("keeps what was typed and fills the rest: $case", ({ values, name, host }) => {
    expect(fillFormFromCode(values, code, null)).toMatchObject({ name, host });
  });

  it("always takes the user from the code and drops the password", () => {
    const values = { ...typed, user: "typed-user", password: "secret" };

    expect(fillFormFromCode(values, code, null)).toMatchObject({ user: "code-user", password: null });
  });

  it.each([
    { case: "an empty port", port: "", previous: null, expected: "2222" },
    { case: "only spaces", port: " ", previous: null, expected: "2222" },
    { case: "a typed port", port: "2200", previous: null, expected: "2200" },
    { case: "a port copied from the earlier code", port: "22", previous: { ...code, port: 22 }, expected: "2222" },
    { case: "a port edited after the scan", port: "2200", previous: { ...code, port: 22 }, expected: "2200" },
  ])("keeps a typed port and fills the rest: $case", ({ port, previous, expected }) => {
    expect(fillFormFromCode({ ...typed, port }, code, previous)).toMatchObject({ port: expected });
  });

  describe("after an earlier scan", () => {
    const previous: PairingCode = { ...code, name: "old-box", host: "old-box.example.com" };

    it.each([
      { case: "values copied from the earlier code", values: { ...typed, name: "old-box", host: "old-box.example.com" }, name: "code-box", host: "code-box.example.com" },
      { case: "an address edited after the scan", values: { ...typed, name: "old-box", host: "typed.example.com" }, name: "code-box", host: "typed.example.com" },
      { case: "a name edited after the scan", values: { ...typed, name: "My box", host: "old-box.example.com" }, name: "My box", host: "code-box.example.com" },
    ])("replaces only what the earlier code filled: $case", ({ values, name, host }) => {
      expect(fillFormFromCode(values, code, previous)).toMatchObject({ name, host });
    });
  });
});
