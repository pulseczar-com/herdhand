import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import type { Chat, ChatInfo } from "@/chat/chatItems";
import { getSessionPath, getTranscriptPath, isClaudePane, parseSession } from "@/claude/paths";
import { addEarlierLines, addTranscriptLines, getChatInfo, type Transcribed } from "@/claude/transcript";
import { getErrorMessage } from "@/errorMessage";
import { type Backend, FileReadError, type FileLines, type Pane } from "@/herdr/backend";

/** How long the chat waits after one poll ends before the next starts. */
export const REFRESH_INTERVAL_MS = 2_000;

/** How many lines of the transcript the chat reads when it opens. */
export const FIRST_READ_LINES = 100;

/** How many lines of the transcript one read of earlier lines takes. */
const PAGE_LINES = 100;

/** A backend that can read a pane and its files: the desktop app's. */
export type ChatBackend = Backend & Required<Pick<Backend, "getPane" | "readFile">>;

export function canReadChat(backend: Backend): backend is ChatBackend {
  return backend.getPane !== undefined && backend.readFile !== undefined;
}

/** What the chat knows of the transcript, with the chat so far and its waiting results. */
type Transcript = Transcribed & {
  path: string | null;
  /** The first line the chat holds. */
  firstLine: number | null;
  /** The next line to read on a poll. */
  nextLine: number | null;
  /** The chat's header. */
  info: ChatInfo;
};

const NO_TRANSCRIPT: Transcript = { path: null, firstLine: null, nextLine: null, chat: new Map(), orphans: new Map(), info: {} };

/**
 * A Claude pane's chat, from Claude Code's transcript, and the pane as Herdr has it now. It polls
 * on open and every REFRESH_INTERVAL_MS until the screen closes, one poll at a time and none while
 * the app is in the background. `loadEarlier` reads the page of lines before the first one shown.
 * Polls and page reads run one at a time. When a file is missing or names no session, the chat is
 * empty; a failed connection keeps the last chat and shows the error.
 */
export function useClaudeChat(backend: ChatBackend, paneId: string) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [info, setInfo] = useState<ChatInfo>({});
  const [hasEarlier, setHasEarlier] = useState(false);
  const [pane, setPane] = useState<Pane | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadEarlierRef = useRef(() => {});
  const loadEarlier = useCallback(() => loadEarlierRef.current(), []);

  useEffect(() => {
    let isOpen = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let transcript = NO_TRANSCRIPT;
    let isLoadingEarlier = false;
    // Every read waits for the one before it, so a poll never writes over a page read.
    let queue: Promise<void> = Promise.resolve();

    function inOrder(task: () => Promise<void>): Promise<void> {
      queue = queue.then(task);
      return queue;
    }

    function show(read: Transcript) {
      transcript = read;
      setChat(read.chat);
      setInfo(read.info);
      setHasEarlier(hasLinesBefore(read.firstLine));
      setError(null);
    }

    async function poll() {
      if (AppState.currentState !== "background") await inOrder(readChat);
      if (isOpen) timer = setTimeout(poll, REFRESH_INTERVAL_MS);
    }

    async function readChat() {
      try {
        const polled = await backend.getPane(paneId);
        const read = isClaudePane(polled) ? await readNewLines(backend, polled.pid, transcript) : null;
        if (!isOpen) return;
        setPane(polled);
        show(read ?? NO_TRANSCRIPT);
      } catch (failure) {
        if (isOpen) setError(`Could not read the chat: ${getErrorMessage(failure)}`);
      }
    }

    async function readEarlier() {
      const { firstLine } = transcript;
      try {
        if (!transcript.path || firstLine === null || !hasLinesBefore(firstLine)) return;
        const read = await readEarlierLines(backend, transcript.path, firstLine);
        if (!isOpen) return;
        const { chat, orphans } = addEarlierLines(transcript, read.lines);
        // What the newer lines already said about the chat wins over the earlier lines.
        const info = { ...getChatInfo({}, read.lines), ...transcript.info };
        show({ ...transcript, chat, orphans, info, firstLine: read.first });
      } catch (failure) {
        if (isOpen && !(failure instanceof FileReadError)) setError(`Could not read the chat: ${getErrorMessage(failure)}`);
      } finally {
        isLoadingEarlier = false;
      }
    }

    loadEarlierRef.current = () => {
      if (isLoadingEarlier) return;
      isLoadingEarlier = true;
      void inOrder(readEarlier);
    };

    void poll();
    return () => {
      isOpen = false;
      clearTimeout(timer);
    };
  }, [backend, paneId]);

  return { chat, info, hasEarlier, loadEarlier, pane, error };
}

/**
 * The transcript with the lines Claude wrote since the last poll, or null when Herdr cannot read
 * a file or the session file names no session. The session file is read on each poll, because
 * `/clear` and a resume start a new transcript.
 */
async function readNewLines(backend: ChatBackend, pid: number, transcript: Transcript): Promise<Transcript | null> {
  try {
    const sessionFile = await backend.readFile(getSessionPath(pid));
    const session = parseSession(sessionFile.text);
    if (!session) return null;
    const path = getTranscriptPath(session);
    const current = path === transcript.path ? transcript : { ...NO_TRANSCRIPT, path };
    // A read of no lines still gives the file's line count.
    const { lines: lineCount } = await backend.readFile(path, { limit: 0 });
    const offset = getReadOffset(lineCount, current.nextLine);
    if (offset === null) return current;
    const newRead = await backend.readFile(path, { offset });
    const { lines, nextLine } = getCompleteLines(newRead);
    const { chat, orphans } = addTranscriptLines(current, lines);
    return {
      path,
      firstLine: current.firstLine ?? offset,
      nextLine,
      chat,
      orphans,
      info: getChatInfo(current.info, lines),
    };
  } catch (failure) {
    if (failure instanceof FileReadError) return null;
    throw failure;
  }
}

/** Whether lines come before `firstLine`, the first line the chat holds. */
function hasLinesBefore(firstLine: number | null): boolean {
  return firstLine !== null && firstLine > 1;
}

/** The page of up to PAGE_LINES lines before `firstLine`, and the number of its first line. */
async function readEarlierLines(backend: ChatBackend, path: string, firstLine: number) {
  const offset = Math.max(1, firstLine - PAGE_LINES);
  const read = await backend.readFile(path, { offset, limit: firstLine - offset });
  return { lines: getCompleteLines(read).lines, first: offset };
}

/** The first line to read, or null when there is nothing new. On open, the last FIRST_READ_LINES. */
export function getReadOffset(lineCount: number, nextLine: number | null): number | null {
  if (nextLine !== null) return lineCount >= nextLine ? nextLine : null;
  if (lineCount === 0) return null;
  const firstOfLastLines = lineCount - FIRST_READ_LINES + 1;
  return Math.max(1, firstOfLastLines);
}

/** The complete lines of a read, and the next line to read. A last line with no newline is read again. */
export function getCompleteLines(read: FileLines): { lines: string[]; nextLine: number } {
  if (read.last < read.first) return { lines: [], nextLine: read.first };
  const lines = read.text.split("\n");
  // After the last newline: "" when the read ends on a complete line, else a line still being written.
  const partial = lines.pop();
  const nextLine = partial === "" ? read.last + 1 : read.last;
  return { lines, nextLine };
}
