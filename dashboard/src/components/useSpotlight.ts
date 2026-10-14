import { useEffect } from 'react';

/**
 * Tell the card under the pointer where the pointer is, so its surface can
 * catch a soft highlight there (styles.css, ".card::before").
 */
export function useSpotlight() {
  useEffect(() => {
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const card = (event.target as Element | null)?.closest?.<HTMLElement>('.card');
        if (!card) return;
        const box = card.getBoundingClientRect();
        card.style.setProperty('--spot-x', `${event.clientX - box.left}px`);
        card.style.setProperty('--spot-y', `${event.clientY - box.top}px`);
      });
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', onMove);
    };
  }, []);
}
