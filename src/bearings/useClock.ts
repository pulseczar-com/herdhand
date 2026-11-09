import { useEffect, useState } from "react";

const TICK_MS = 1_000;

/** The time now in milliseconds, renewed every second, so "12 s ago" counts up. */
export function useClock(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}
