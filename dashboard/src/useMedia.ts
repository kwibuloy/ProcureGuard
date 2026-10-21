import { useSyncExternalStore } from 'react';

/** Phone layout: matches the 860px breakpoint in styles.css. */
export const PHONE = '(max-width: 860px)';

/** Whether a CSS media query matches, kept current as the window changes. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia?.(query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}
