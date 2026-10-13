import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const MIN_WIDTH = 240;

/** Track an element's width so SVG charts can lay out in real pixels. */
export function useWidth<T extends HTMLElement>(initial = 600) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);

  // Measure before the first paint, so the chart never renders wider than its card.
  useLayoutEffect(() => {
    const measured = ref.current?.getBoundingClientRect().width;
    if (measured) setWidth(Math.max(MIN_WIDTH, Math.floor(measured)));
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(MIN_WIDTH, Math.floor(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
