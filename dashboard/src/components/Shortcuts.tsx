import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

const KEYS: [string[], string][] = [
  [['/'], 'Search contracts'],
  [['J'], 'Next contract (or move down the list)'],
  [['K'], 'Previous contract (or move up the list)'],
  [['Enter'], 'Open the highlighted contract'],
  [['Esc'], 'Close the contract or this list'],
  [['?'], 'Show these shortcuts'],
];

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));

/** The keyboard shortcuts, in a dialog that "?" opens anywhere outside a text field. */
export function Shortcuts() {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const question = event.key === '?' || (event.code === 'Slash' && event.shiftKey);
      if (!question || typing(event.target) || event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      const element = dialog.current;
      if (element && !element.open) element.showModal?.();
    };
    const open = () => dialog.current?.showModal?.();
    document.addEventListener('keydown', onKey);
    window.addEventListener('procureguard:shortcuts', open);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('procureguard:shortcuts', open);
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby="shortcuts-title"
      onClick={(event) => event.target === dialog.current && dialog.current?.close()}
    >
      <div className="dialog-head">
        <h2 id="shortcuts-title">Keyboard shortcuts</h2>
        <button
          type="button"
          className="icon-button"
          onClick={() => dialog.current?.close()}
          aria-label="Close keyboard shortcuts"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      <dl className="shortcut-list">
        {KEYS.map(([keys, label]) => (
          <div key={label}>
            <dt>
              {keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </dialog>
  );
}

/** Opens the shortcuts dialog from a button or link. */
export const openShortcuts = () => window.dispatchEvent(new Event('procureguard:shortcuts'));
