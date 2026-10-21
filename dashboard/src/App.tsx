import { useEffect, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { useApi, withRun, type Overview } from './api';
import { Icon } from './components/Icon';
import { useSpotlight } from './components/useSpotlight';
import { formatDate } from './format';
import type { OverviewContext } from './overview';
import { AboutPage } from './pages/AboutPage';
import { ContractPanel } from './pages/ContractPanel';
import { ProfilePage } from './pages/ProfilePage';
import { QueuePage } from './pages/QueuePage';
import { RunProvider, useRuns } from './run';

type Theme = 'light' | 'dark';

function currentTheme(): Theme {
  const stamped = document.documentElement.dataset.theme;
  if (stamped === 'light' || stamped === 'dark') return stamped;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('procureguard-theme', theme);
    } catch {
      // Storage can be unavailable (private windows); the toggle still works for this visit.
    }
  }, [theme]);

  const next = theme === 'dark' ? 'light' : 'dark';

  /** The new theme spreads out from the button as a growing circle, where the browser can. */
  function toggle(event: MouseEvent<HTMLButtonElement>) {
    const root = document.documentElement;
    const apply = () => {
      root.dataset.theme = next;
      flushSync(() => setTheme(next));
    };
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reducedMotion) {
      apply();
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    root.style.setProperty('--theme-x', `${x}px`);
    root.style.setProperty('--theme-y', `${y}px`);
    root.style.setProperty('--theme-radius', `${radius}px`);
    root.classList.add('theme-switching');
    const done = () => root.classList.remove('theme-switching');
    document.startViewTransition(apply).finished.then(done, done);
  }

  return (
    <button
      type="button"
      className="icon-button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <span key={theme} className="theme-icon">
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
      </span>
    </button>
  );
}

/** Chooses which model's scoring run every page shows. */
function RunPicker({ shownId }: { shownId: number | null }) {
  const { runs, select } = useRuns();
  if (runs.length < 2 || shownId === null) return null;
  return (
    <label className="run-picker">
      <span>Scoring run</span>
      <select value={shownId} onChange={(event) => select(Number(event.target.value))}>
        {runs.map((run) => (
          <option key={run.id} value={run.id}>
            {run.modelName} · {formatDate(run.createdAt)} · run {run.id}
          </option>
        ))}
      </select>
    </label>
  );
}

const NAV = [
  { to: '/', label: 'Contracts', also: ['/contracts', '/profile'] },
  { to: '/about', label: 'About', also: [] },
];

function NavLinks({ pathname }: { pathname: string }) {
  return NAV.map((item) => {
    const active =
      item.to === '/'
        ? pathname === '/' || item.also.some((prefix) => pathname.startsWith(prefix))
        : pathname.startsWith(item.to);
    return (
      <NavLink
        key={item.to}
        to={item.to}
        className={active ? 'is-active' : ''}
        aria-current={active ? 'page' : undefined}
      >
        {item.label}
      </NavLink>
    );
  });
}

function Layout() {
  const { selected } = useRuns();
  const overview = useApi<Overview>(withRun('/api/overview', selected));
  const run = overview.data?.run ?? null;
  const { pathname } = useLocation();
  useSpotlight();

  // A new page starts at the top; opening a contract over the queue does not move it.
  const section = pathname.startsWith('/contracts') ? '/' : pathname;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [section]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand" aria-label="ProcureGuard home">
            <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
              <rect width="32" height="32" rx="8" className="brand-tile" />
              <path d="M9 22V10m7 12V14m7 8v-5" className="brand-bars" />
              <circle cx="23" cy="10.5" r="2.5" className="brand-dot" />
            </svg>
            <span>ProcureGuard</span>
          </NavLink>
          <nav className="nav" aria-label="Main">
            <NavLinks pathname={pathname} />
          </nav>
          <div className="topbar-end">
            <RunPicker shownId={run?.id ?? null} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {run?.isDemo && (
        <div className="demo-banner" role="note">
          <div className="demo-banner-inner">
            <Icon name="info" />
            <p>
              <strong>Demonstration data.</strong> Every organization and contract shown here is
              generated. Nothing on this page describes a real contract.
            </p>
          </div>
        </div>
      )}

      <main id="main" className="page">
        <Outlet context={overview satisfies OverviewContext} />
      </main>

      {/* Phones: the same links in a bar at the bottom of the screen, within thumb reach.
          It sits outside the header, whose blur would otherwise pin it to the header. */}
      <nav className="bottom-nav phone-only" aria-label="Main">
        <NavLinks pathname={pathname} />
      </nav>

      <footer className="footer">
        <p>
          ProcureGuard screens published PhilGEPS data to help reviewers decide where to look first.
          A flag marks a contract as statistically unusual. It is not a finding of wrongdoing by any
          person or organization.
        </p>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <RunProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<QueuePage />}>
              <Route path="contracts/:id" element={<ContractPanel />} />
            </Route>
            <Route path="/profile/:kind" element={<ProfilePage />} />
            <Route path="/about" element={<AboutPage />} />
            {/* The data quality and method pages became sections of the About page. */}
            <Route
              path="/data"
              element={<Navigate to={{ pathname: '/about', hash: '#data' }} replace />}
            />
            <Route
              path="/method"
              element={<Navigate to={{ pathname: '/about', hash: '#method' }} replace />}
            />
            {/* Old links (the removed compare page) and typos land on the contract list. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </RunProvider>
    </BrowserRouter>
  );
}
