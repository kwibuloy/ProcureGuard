import { useCallback, useSyncExternalStore } from 'react';

/**
 * Which contracts this reviewer has marked as reviewed. Kept in this browser
 * only: the API is read-only, so nothing about a review is stored on the server.
 */
const STORAGE_KEY = 'procureguard-reviewed';
const listeners = new Set<() => void>();
let cache: ReadonlySet<number> | null = null;

function read(): ReadonlySet<number> {
  if (cache) return cache;
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    cache = new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === 'number') : []);
  } catch {
    cache = new Set();
  }
  return cache;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useReviewed() {
  const reviewed = useSyncExternalStore(subscribe, read);
  const toggle = useCallback((id: number) => {
    const next = new Set(read());
    if (!next.delete(id)) next.add(id);
    cache = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // Storage can be unavailable; the mark still holds until the page reloads.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return { reviewed, toggle };
}
