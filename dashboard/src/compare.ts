/** Up to two contracts picked for a side-by-side comparison, kept for this browser tab. */
import { useSyncExternalStore } from 'react';

export interface Picked {
  id: number;
  title: string;
}

const KEY = 'procureguard-compare';
export const COMPARE_LIMIT = 2;

function read(): Picked[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.slice(0, COMPARE_LIMIT) : [];
  } catch {
    return [];
  }
}

let picked: Picked[] = typeof window === 'undefined' ? [] : read();
const listeners = new Set<() => void>();

function set(next: Picked[]) {
  picked = next;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable; the comparison still works until the tab closes.
  }
  listeners.forEach((listener) => listener());
}

/** Add a contract; with two already picked, the older one makes room. */
export function pick(contract: Picked) {
  if (picked.some((item) => item.id === contract.id)) return;
  set([...picked, contract].slice(-COMPARE_LIMIT));
}

export const unpick = (id: number) => set(picked.filter((item) => item.id !== id));
export const clearPicked = () => set([]);

export function usePicked(): Picked[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => picked,
    () => picked,
  );
}
