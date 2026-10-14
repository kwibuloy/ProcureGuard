import { useEffect, useRef, useState } from 'react';

const DURATION = 900;

const canAnimate = () =>
  typeof window.matchMedia === 'function' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Props {
  value: number;
  format: (value: number) => string;
}

/**
 * A figure that counts up to its value when it appears or changes. Screen readers
 * get the final figure only; with reduced motion it does not animate.
 */
export function CountUp({ value, format }: Props) {
  const [shown, setShown] = useState(() => (canAnimate() ? 0 : value));
  const from = useRef(shown);

  useEffect(() => {
    if (!canAnimate()) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const began = performance.now();
    let frame = requestAnimationFrame(function step(now: number) {
      const progress = Math.min(1, (now - began) / DURATION);
      const eased = 1 - (1 - progress) ** 4;
      const current = start + (value - start) * eased;
      from.current = current;
      setShown(progress === 1 ? value : current);
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="visually-hidden">{format(value)}</span>
    </>
  );
}
