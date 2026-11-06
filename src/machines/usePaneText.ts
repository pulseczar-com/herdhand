import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import { getErrorMessage } from "@/errorMessage";
import type { Backend } from "@/herdr/backend";
import { parseStyledText } from "@/pane/ansi";

/** How long the pane screen waits after one read ends before the next starts. */
export const REFRESH_INTERVAL_MS = 2_000;

/**
 * A pane's text, read on open and again every REFRESH_INTERVAL_MS until the screen closes.
 * One read runs at a time, so slow replies never pile up. A failed read keeps the last text.
 * No read runs while the app is in the background. The text has its style codes removed; the
 * dim lines say which of its lines the program dimmed.
 */
export function usePaneText(backend: Backend, paneId: string) {
  // The raw text, so a read that returns the same text does not render the screen again.
  const [rawText, setRawText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isOpen = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function read() {
      if (AppState.currentState === "background") {
        timer = setTimeout(read, REFRESH_INTERVAL_MS);
        return;
      }
      try {
        const loaded = await backend.readPane(paneId);
        if (!isOpen) return;
        setRawText(loaded);
        setError(null);
      } catch (failure) {
        if (isOpen) setError(`Could not read the pane: ${getErrorMessage(failure)}`);
      }
      if (isOpen) timer = setTimeout(read, REFRESH_INTERVAL_MS);
    }

    void read();
    return () => {
      isOpen = false;
      clearTimeout(timer);
    };
  }, [backend, paneId]);

  const styled = useMemo(() => (rawText === null ? null : parseStyledText(rawText)), [rawText]);
  return { text: styled?.text ?? null, dimLines: styled?.dimLines, error };
}
