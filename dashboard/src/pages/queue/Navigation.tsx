import { useEffect, useState } from 'react';
import type { ContractList } from '../../api';
import { Icon } from '../../components/Icon';
import { formatCount } from '../../format';

/** A button back to the top, shown on phones once the page has been scrolled a way. */
export function BackToTop() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setShown(window.scrollY > window.innerHeight * 1.5));
    };
    window.addEventListener('scroll', check, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', check);
    };
  }, []);
  if (!shown) return null;
  return (
    <button
      type="button"
      className="back-to-top phone-only"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
    >
      <Icon name="chevronUp" size={20} />
    </button>
  );
}

/** Rows a page can show; the first is the default. */
export const ROW_CHOICES = [15, 30, 50, 100] as const;

export function Pagination({
  list,
  onPage,
  onSize,
}: {
  list: ContractList;
  onPage: (page: number) => void;
  /** When given, the reader can choose how many rows a page shows. */
  onSize?: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const first = list.total === 0 ? 0 : (list.page - 1) * list.pageSize + 1;
  const last = Math.min(list.total, list.page * list.pageSize);
  return (
    <div className="pagination">
      <p>
        {first} to {last} of {formatCount(list.total)}
      </p>
      {onSize && (
        <label className="field rows-picker">
          <span>Rows per page</span>
          <select value={list.pageSize} onChange={(event) => onSize(Number(event.target.value))}>
            {ROW_CHOICES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="pagination-buttons">
        <button
          type="button"
          className="icon-button"
          disabled={list.page <= 1}
          onClick={() => onPage(list.page - 1)}
          aria-label="Previous page"
        >
          <Icon name="chevronLeft" />
        </button>
        <span>
          Page {list.page} of {pages}
        </span>
        <button
          type="button"
          className="icon-button"
          disabled={list.page >= pages}
          onClick={() => onPage(list.page + 1)}
          aria-label="Next page"
        >
          <Icon name="chevronRight" />
        </button>
      </div>
    </div>
  );
}
