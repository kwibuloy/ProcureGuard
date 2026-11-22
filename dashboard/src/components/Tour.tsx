import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

const DONE_KEY = 'procureguard-tour-done';
const START_EVENT = 'procureguard:tour';

interface Step {
  /** Elements to point at, first match wins (wide layout, then phone layout). */
  targets: string[];
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    targets: ['.hero-figure', '.summary-strip'],
    title: 'A flag is a prompt to look closer',
    body: 'These contracts are the most statistically unusual 5 percent of the year. Unusual is not wrongdoing: an ordinary reason often explains the pattern.',
  },
  {
    targets: ['.queue-table tbody tr:first-child'],
    title: 'Every score shows its reasons',
    body: 'Each row gives the score out of 100 and, under Why, the indicator that raised it most with the figures behind it.',
  },
  {
    targets: ['.hero-actions .button-primary', '.strip-actions .button-primary'],
    title: 'Start with the first contract',
    body: 'Open a contract to see how each indicator moved its score, how its price compares, and its timeline. Then press J and K to move through the list.',
  },
];

function findTarget(step: Step): HTMLElement | null {
  for (const selector of step.targets) {
    const found = [...document.querySelectorAll<HTMLElement>(selector)].find(
      (element) => element.offsetParent !== null,
    );
    if (found) return found;
  }
  return null;
}

const wasDone = () => {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return true;
  }
};

/** Starts the tour again, from a link anywhere on the site. */
export const startTour = () => window.dispatchEvent(new Event(START_EVENT));

/**
 * A three-step introduction for first-time visitors, pointing at the real parts
 * of the Contracts page. It can be skipped, is shown once, and can be replayed
 * from the footer.
 */
export function Tour({ ready }: { ready: boolean }) {
  const [step, setStep] = useState<number | null>(null);
  const [measured, setMeasured] = useState<{ step: number; rect: DOMRect } | null>(null);
  const box = measured && measured.step === step ? measured.rect : null;
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready) return;
    const start = () => setStep(0);
    window.addEventListener(START_EVENT, start);
    // First visit: begin once the page has settled.
    const timer = wasDone() ? 0 : window.setTimeout(start, 900);
    return () => {
      window.removeEventListener(START_EVENT, start);
      clearTimeout(timer);
    };
  }, [ready]);

  const finish = useCallback(() => {
    setStep(null);
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      // Without storage the tour may show again next visit; nothing else breaks.
    }
  }, []);

  // Point at the step's element, scrolled into view, and follow it on resize and scroll.
  useLayoutEffect(() => {
    if (step === null) return;
    const target = findTarget(STEPS[step]!);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setMeasured({ step, rect: target.getBoundingClientRect() }),
      );
    };
    measure();
    const settle = window.setTimeout(measure, 450);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
    };
  }, [step]);

  useEffect(() => {
    if (step === null || !ready) return;
    card.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
      // Keep Tab inside the card while it is open.
      const element = card.current;
      if (event.key !== 'Tab' || !element) return;
      const buttons = [...element.querySelectorAll<HTMLElement>('button')];
      const first = buttons[0];
      const last = buttons.at(-1);
      if (!first || !last) return;
      const inside = element.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [step, finish, ready]);

  // A contract opened over the page (J, a link) hides the tour until it closes.
  if (step === null || !ready) return null;
  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;
  const pad = 8;
  const below = box ? box.bottom + 240 < window.innerHeight || box.top < 260 : true;
  const cardTop = box
    ? below
      ? box.bottom + pad + 16
      : box.top - pad - 16
    : window.innerHeight / 2;
  const cardLeft = box
    ? Math.min(
        Math.max(16, box.left),
        window.innerWidth - Math.min(380, window.innerWidth - 32) - 16,
      )
    : 16;

  return (
    <div className="tour" role="presentation">
      <div className="tour-scrim" onClick={finish} />
      {box && (
        <div
          className="tour-spot"
          style={{
            top: box.top - pad,
            left: box.left - pad,
            width: box.width + pad * 2,
            height: box.height + pad * 2,
          }}
        />
      )}
      <div
        ref={card}
        key={step}
        className={`tour-card ${below ? 'is-below' : 'is-above'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        style={{ top: cardTop, left: cardLeft }}
      >
        <p className="tour-step">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 id="tour-title">{current.title}</h2>
        <p id="tour-body">{current.body}</p>
        <div className="tour-actions">
          <button type="button" className="button button-quiet" onClick={finish}>
            Skip tour
          </button>
          <span className="tour-nav">
            {step > 0 && (
              <button type="button" className="button" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            <button
              type="button"
              className="button button-primary"
              onClick={() => (last ? finish() : setStep(step + 1))}
            >
              {last ? 'Got it' : 'Next'}
              {!last && <Icon name="arrowRight" size={16} />}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
