import { parseMachineForm } from "./form";

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
