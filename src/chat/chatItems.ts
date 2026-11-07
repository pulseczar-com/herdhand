/**
 * What a chat view shows, with no knowledge of the agent that wrote it. Each agent's adapter turns
 * its own records into these four kinds.
 */
export type ChatItem = PromptItem | ReplyItem | ToolItem | NoteItem;

/** What the person typed. */
type PromptItem = { kind: "prompt"; id: string; text: string };

/** The agent's answer, in Markdown. */
type ReplyItem = { kind: "reply"; id: string; text: string };

/** What a tool call asks the person: the question, whether several options can be picked, and the options' labels. */
export type AskedQuestion = { question: string; multiSelect: boolean; options: string[] };

/** One tool call. `result` is null while the tool runs. `questions` is set on a call that asks the person. */
export type ToolItem = {
  kind: "tool";
  id: string;
  name: string;
  summary: string;
  input: string;
  result: ToolResult | null;
  questions?: AskedQuestion[];
};

export type ToolResult = { text: string; isError: boolean };

/** One small line about the conversation itself, such as a compaction. */
type NoteItem = { kind: "note"; id: string; text: string };

/** The items by id, in the order the agent wrote them. A later record can replace an item in place. */
export type Chat = ReadonlyMap<string, ChatItem>;

/** What the chat's header says about the session. A field the transcript does not carry is left out. */
export type ChatInfo = { model?: string; folder?: string; branch?: string };
