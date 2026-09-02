import { useCallback, useEffect, useState } from "react";

/** Frontend-only recent searches, kept in this browser. No backend involved. */
const STORAGE_KEY = "transittrack.recentSearches.v1";
const MAX = 5;

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(read());
  }, []);

  const persist = useCallback((next: string[]) => {
    setRecent(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — recent searches just don't persist */
    }
  }, []);

  const remember = useCallback(
    (term: string) => {
      const value = term.trim();
      if (!value) return;
      persist([value, ...read().filter((r) => r.toLowerCase() !== value.toLowerCase())].slice(0, MAX));
    },
    [persist],
  );

  const clear = useCallback(() => persist([]), [persist]);

  return { recent, remember, clear };
}
