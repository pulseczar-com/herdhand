import { getToolInputText, getToolSummary } from "./toolInput";

describe("getToolSummary", () => {
  it.each([
    { where: "a description before a command", input: { command: "ls", description: "List files" }, expected: "List files" },
    { where: "a command", input: { command: "ls -la" }, expected: "ls -la" },
    { where: "a command given as a list of words", input: { command: ["bash", "-lc", "ls"] }, expected: "bash -lc ls" },
    { where: "a path", input: { path: "src/app.ts" }, expected: "src/app.ts" },
    { where: "a command that is neither text nor a list, then a path", input: { command: 5, path: "src/app.ts" }, expected: "src/app.ts" },
    { where: "no field it knows", input: { other: 1 }, expected: "" },
  ])("gives the summary for $where", ({ input, expected }) => {
    expect(getToolSummary(input)).toBe(expected);
  });
});

describe("getToolInputText", () => {
  it.each([
    { where: "a command", input: { command: "ls -la", workdir: "/work" }, expected: "ls -la" },
    { where: "a command given as a list of words", input: { command: ["bash", "-lc", "ls"] }, expected: "bash -lc ls" },
    { where: "any other input", input: { path: "a.ts" }, expected: '{\n  "path": "a.ts"\n}' },
  ])("shows $where", ({ input, expected }) => {
    expect(getToolInputText(input)).toBe(expected);
  });
});
