import { useCallback, useEffect, useRef, useState } from "react";

import { getErrorMessage } from "@/errorMessage";
import type { Backend, Space } from "@/herdr/backend";

export type SpacesState = ReturnType<typeof useSpaces>;

/** The last load's result, with the connection it came from. */
type LoadResult = { backend: Backend; spaces: Space[] | null; error: string | null };

/**
 * The machine's spaces: loaded once connected, and again on `refresh` (pull to refresh).
 * A failed load keeps the last list, so the person still sees it next to the error.
 * With no backend (not connected) there is nothing to load.
 */
export function useSpaces(backend: Backend | null) {
  const [result, setResult] = useState<LoadResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const isOpen = useRef(true);
  // A new connection, or another Herdr kind, starts from an empty list.
  const currentResult = result?.backend === backend ? result : null;

  const load = useCallback(async () => {
    if (!backend) return;
    await backend.listSpaces().then(
      (spaces) => {
        if (isOpen.current) setResult({ backend, spaces, error: null });
      },
      (failure: unknown) => {
        const error = `Could not load the list: ${getErrorMessage(failure)}`;
        if (isOpen.current) setResult((last) => makeFailedResult(last, backend, error));
      },
    );
  }, [backend]);

  useEffect(() => {
    isOpen.current = true;
    void load();
    return () => {
      isOpen.current = false;
    };
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    if (isOpen.current) setRefreshing(false);
  }, [load]);

  return { spaces: currentResult?.spaces ?? null, error: currentResult?.error ?? null, refreshing, refresh };
}

/** The error, next to the last list when it came from the same connection. */
function makeFailedResult(last: LoadResult | null, backend: Backend, error: string): LoadResult {
  const spaces = last?.backend === backend ? last.spaces : null;
  return { backend, spaces, error };
}
