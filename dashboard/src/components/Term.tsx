import { useId, useState, type ReactNode } from 'react';
import { GLOSSARY, type GlossaryTerm } from '../glossary';

/**
 * A word with its meaning one hover, focus or tap away. The meaning is also the
 * button's description, so screen readers announce it without opening anything.
 */
export function Term({ term, children }: { term: GlossaryTerm; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className={`term ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="term-word"
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}
      >
        {children}
      </button>
      <span role="tooltip" id={id} className="term-tip">
        {GLOSSARY[term]}
      </span>
    </span>
  );
}
