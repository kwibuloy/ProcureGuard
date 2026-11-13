import { useEffect, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);

/**
 * Keyboard: J and K (or the arrow keys) move through the list, Enter opens the
 * row under the cursor, slash jumps to search. With a contract open, moving
 * opens the next one instead.
 */
export function useListKeys({
  idKey,
  cursor,
  setCursor,
  openId,
  search,
  searchBox,
}: {
  /** The ids of the rows shown, joined with commas. */
  idKey: string;
  cursor: number | null;
  setCursor: (id: number) => void;
  openId: number | null;
  search: string;
  searchBox: RefObject<HTMLInputElement | null>;
}) {
  const navigate = useNavigate();
  useEffect(() => {
    const order = idKey ? idKey.split(',').map(Number) : [];
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (event.key === '/') {
        event.preventDefault();
        searchBox.current?.focus();
        return;
      }
      const step = { j: 1, ArrowDown: 1, k: -1, ArrowUp: -1 }[event.key];
      if (step && order.length) {
        event.preventDefault();
        const current = order.indexOf(openId ?? cursor ?? -1);
        const next = order[Math.min(order.length - 1, Math.max(0, current + step))]!;
        if (openId) navigate({ pathname: `/contracts/${next}`, search }, { replace: true });
        else setCursor(next);
        document
          .querySelector(`[data-row="${next}"]`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (event.key === 'Enter' && cursor && !openId) {
        navigate({ pathname: `/contracts/${cursor}`, search });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [idKey, cursor, openId, search, navigate, setCursor, searchBox]);
}
