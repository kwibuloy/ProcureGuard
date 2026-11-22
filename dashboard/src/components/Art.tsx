import type { ReactNode } from 'react';

/**
 * Line drawings for empty, error and offline states, in the neubrutalist style:
 * thick ink lines, one accent fill. Decorative only; the text beside them says
 * what happened.
 */
export type ArtName = 'search' | 'folder' | 'unplugged' | 'checklist';

const DRAWINGS: Record<ArtName, ReactNode> = {
  search: (
    <>
      <rect x="18" y="14" width="64" height="80" rx="6" className="art-paper" />
      <path d="M30 34h40M30 46h40M30 58h24" />
      <circle cx="78" cy="70" r="20" className="art-accent" />
      <path d="M92 84l16 16" strokeWidth="8" />
    </>
  ),
  folder: (
    <>
      <path d="M14 34h34l8 10h50v52H14Z" className="art-paper" />
      <path d="M14 52h92" />
      <rect x="36" y="22" width="44" height="22" rx="3" className="art-accent" />
    </>
  ),
  unplugged: (
    <>
      <rect x="14" y="44" width="38" height="30" rx="6" className="art-accent" />
      <path d="M52 52h10M52 66h10M14 59H4" />
      <rect x="72" y="44" width="38" height="30" rx="6" className="art-paper" />
      <path d="M72 59H64M110 59h8M62 30l-6 10M66 26l6-10M60 88l-4 10" />
    </>
  ),
  checklist: (
    <>
      <rect x="22" y="12" width="76" height="92" rx="6" className="art-paper" />
      <rect x="32" y="28" width="12" height="12" rx="2" className="art-accent" />
      <path d="M52 34h34M52 56h34M52 78h24" />
      <rect x="32" y="50" width="12" height="12" rx="2" />
      <rect x="32" y="72" width="12" height="12" rx="2" />
    </>
  ),
};

export function Art({ name }: { name: ArtName }) {
  return (
    <svg className="art" viewBox="0 0 120 112" aria-hidden="true">
      {DRAWINGS[name]}
    </svg>
  );
}
