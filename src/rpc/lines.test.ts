import { JsonLineReader } from "./lines";

describe("JsonLineReader", () => {
  it.each([
    {
      name: "a JSON line split across two chunks",
      chunks: ['{"id":"1","res', 'ult":{}}\n'],
      expected: [{ id: "1", result: {} }],
    },
    {
      name: "noise lines before the first JSON",
      chunks: ["Welcome to Ubuntu\nlast login: today\n$ ", '{"id":"1"}\n'],
      expected: [{ id: "1" }],
    },
    {
      name: "a \\r\\n line end",
      chunks: ['{"id":"1"}\r\n{"id":"2"}\r\n'],
      expected: [{ id: "1" }, { id: "2" }],
    },
    {
      name: "JSON that is not an object",
      chunks: ['42\n"text"\n[1]\nnull\n{"id":"1"}\n'],
      expected: [{ id: "1" }],
    },
    {
      name: "a broken JSON object",
      chunks: ['{"id":\n{"id":"2"}\n'],
      expected: [{ id: "2" }],
    },
    {
      name: "a line with no end yet",
      chunks: ['{"id":"1"}'],
      expected: [],
    },
  ])("handles $name", ({ chunks, expected }) => {
    const reader = new JsonLineReader();

    const objects = chunks.flatMap((chunk) => reader.push(chunk));

    expect(objects).toEqual(expected);
  });
});
