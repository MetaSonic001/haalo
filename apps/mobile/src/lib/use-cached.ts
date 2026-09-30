import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Offline-friendly fetch: shows the last cached value immediately, then refreshes from the network.
 * If the network fails the cached value stays on screen and `stale` is true.
 */
export function useCached<T>(key: string, fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await fetchRef.current();
      setData(fresh);
      setStale(false);
      setError(null);
      AsyncStorage.setItem(`cache:${key}`, JSON.stringify(fresh)).catch(() => {});
    } catch (e) {
      setStale(true);
      setError(e instanceof Error ? e.message : "Couldn't refresh");
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(`cache:${key}`)
      .then((raw) => alive && raw && setData((prev) => prev ?? (JSON.parse(raw) as T)))
      .catch(() => {});
    void refresh();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);

  return { data, loading, stale, error, refresh };
}
