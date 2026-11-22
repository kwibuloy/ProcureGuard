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

  // Mark the section nearest the top of the panel.
  useEffect(() => {
    const root = body.current;
    if (!root || !tabs.length || typeof IntersectionObserver === 'undefined') return;
    const watcher = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length) setActive(visible[0]!.target.id);
      },
      { root, rootMargin: '-64px 0px -60% 0px' },
    );
    tabs.forEach((tab) => {
      const section = document.getElementById(tab.id);
      if (section) watcher.observe(section);
    });
    return () => watcher.disconnect();
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
            document.getElementById(tab.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActive(tab.id);
          }}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
