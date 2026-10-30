import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Offline-friendly fetch: shows the last cached value immediately, then refreshes from the network.
 * If the network fails the cached value stays on screen and `stale` is true.
 * `pollMs` re-fetches quietly on a timer (used by the demo build, where there is no push service to tell the app something changed).
 */
export function useCached<T>(key: string, fetcher: () => Promise<T>, deps: unknown[] = [], opts: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  const run = useCallback(
    async (quiet: boolean) => {
      if (!quiet) setLoading(true);
      try {
        const fresh = await fetchRef.current();
        setData((prev) => (JSON.stringify(prev) === JSON.stringify(fresh) ? prev : fresh));
        setStale(false);
        setError(null);
        AsyncStorage.setItem(`cache:${key}`, JSON.stringify(fresh)).catch(() => {});
      } catch (e) {
        setStale(true);
        setError(e instanceof Error ? e.message : "Couldn't refresh");
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [key],
  );
  const refresh = useCallback(() => run(false), [run]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(`cache:${key}`)
      .then((raw) => alive && raw && setData((prev) => prev ?? (JSON.parse(raw) as T)))
      .catch(() => {});
    void run(false);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);

  useEffect(() => {
    if (!opts.pollMs) return;
    const t = setInterval(() => void run(true), opts.pollMs);
    return () => clearInterval(t);
  }, [opts.pollMs, run]);

  return { data, loading, stale, error, refresh };
}
