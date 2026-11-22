import { useEffect, useState, type RefObject } from 'react';

interface Tab {
  id: string;
  label: string;
}

/**
 * Index tabs along the top of the contract panel, like tabs on a case file.
 * Each jumps to its section; the tab for the section being read is marked.
 * Sections mark themselves with data-case="Label", so a section that does not
 * appear (no price comparison, say) gets no tab.
 */
export function CaseTabs({ body }: { body: RefObject<HTMLElement | null> }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);

  // Find the sections, and find them again when one arrives later.
  useEffect(() => {
    const root = body.current;
    if (!root) return;
    const collect = () => {
      const found = [...root.querySelectorAll<HTMLElement>('[data-case]')].map((section) => ({
        id: section.id,
        label: section.dataset.case ?? '',
      }));
      setTabs((current) =>
        current.map((tab) => tab.id).join() === found.map((tab) => tab.id).join() ? current : found,
      );
    };
    collect();
    const watcher = new MutationObserver(collect);
    watcher.observe(root, { childList: true, subtree: true });
    return () => watcher.disconnect();
  }, [body]);

  // Mark the section being read: the last one whose top has passed under the tabs,
  // or the last section once the panel is scrolled to the bottom.
  useEffect(() => {
    const root = body.current;
    if (!root || !tabs.length) return;
    let frame = 0;
    const mark = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 4;
        if (atBottom && root.scrollTop > 0) {
          setActive(tabs.at(-1)!.id);
          return;
        }
        const line = root.getBoundingClientRect().top + 120;
        let current = tabs[0]!.id;
        for (const tab of tabs) {
          const section = document.getElementById(tab.id);
          if (section && section.getBoundingClientRect().top <= line) current = tab.id;
        }
        setActive(current);
      });
    };
    mark();
    root.addEventListener('scroll', mark, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener('scroll', mark);
    };
  }, [body, tabs]);

  if (tabs.length < 2) return null;
  return (
    <nav className="case-tabs" aria-label="Sections of this contract">
      {tabs.map((tab) => (
        <a
          key={tab.id}
          href={`#${tab.id}`}
          className={active === tab.id ? 'is-active' : ''}
          aria-current={active === tab.id ? 'true' : undefined}
          onClick={(event) => {
            event.preventDefault();
            // Scroll only the panel body. scrollIntoView would also scroll the panel
            // frame and the page, pushing the header and these tabs out of reach.
            const root = body.current;
            const section = document.getElementById(tab.id);
            if (root && section && tab.id === tabs[0]!.id) {
              root.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (root && section) {
              const tabsHeight = event.currentTarget.parentElement?.offsetHeight ?? 0;
              const top =
                section.getBoundingClientRect().top -
                root.getBoundingClientRect().top +
                root.scrollTop -
                tabsHeight -
                12;
              root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
            }
            setActive(tab.id);
          }}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
