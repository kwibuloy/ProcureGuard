import { lazy, Suspense, useEffect, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import {
  BrowserRouter,
  Navigate,
  NavLink,
  useNavigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { useApi, useOnline, withRun, type Overview } from './api';
import { Icon, type IconName } from './components/Icon';
import { SkeletonCard } from './components/States';
import { ToastProvider } from './components/Toast';
import { CompareTray } from './components/CompareTray';
import { openShortcuts, Shortcuts } from './components/Shortcuts';
import { startTour } from './components/Tour';
import { formatDate } from './format';
import type { OverviewContext } from './overview';
import { ContractPanel } from './pages/ContractPanel';
import { QueuePage } from './pages/QueuePage';
import { ReviewerProvider, useReviewer } from './reviews';
import { RunProvider, useRuns } from './run';

// The Contracts page loads first; the others load when they are opened.
const AboutPage = lazy(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })));
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const SignInPage = lazy(() =>
  import('./pages/SignInPage').then((m) => ({ default: m.SignInPage })),
);
const TermsPage = lazy(() => import('./pages/LegalPages').then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() =>
  import('./pages/LegalPages').then((m) => ({ default: m.PrivacyPage })),
);

const ComparePage = lazy(() =>
  import('./pages/ComparePage').then((m) => ({ default: m.ComparePage })),
);
const PatternsPage = lazy(() =>
  import('./pages/PatternsPage').then((m) => ({ default: m.PatternsPage })),
);
const StabilityPage = lazy(() =>
  import('./pages/StabilityPage').then((m) => ({ default: m.StabilityPage })),
);
const StyleguidePage = lazy(() =>
  import('./pages/StyleguidePage').then((m) => ({ default: m.StyleguidePage })),
);

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

/** Chooses which scoring run every page shows; earlier runs are kept for the record. */
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

const NAV: { to: string; label: string; icon: IconName; also: string[] }[] = [
  { to: '/', label: 'Contracts', icon: 'flag', also: ['/contracts', '/profile', '/compare'] },
  { to: '/patterns', label: 'Patterns', icon: 'map', also: [] },
  { to: '/about', label: 'About', icon: 'info', also: [] },
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
        <span className="nav-icon" aria-hidden="true">
          <Icon name={item.icon} size={17} />
        </span>
        <span className="nav-label">{item.label}</span>
      </NavLink>
    );
  });
}

/** Shown only while a reviewer is signed in. */
function ReviewerChip() {
  const { reviewer, signOut } = useReviewer();
  if (!reviewer) return null;
  return (
    <span className="reviewer-chip">
      <span title="Signed in as a reviewer">{reviewer.displayName}</span>
      <button type="button" className="button button-quiet" onClick={() => signOut()}>
        Sign out
      </button>
    </span>
  );
}

function Layout() {
  const { selected } = useRuns();
  const overview = useApi<Overview>(withRun('/api/overview', selected));
  const run = overview.data?.run ?? null;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const online = useOnline();

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
            <span className="brand-logo" aria-hidden="true">
              <span className="brand-mark" />
            </span>
            <span>ProcureGuard</span>
          </NavLink>
          <nav className="nav" aria-label="Main">
            <NavLinks pathname={pathname} />
          </nav>
          <div className="topbar-end">
            <ReviewerChip />
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

      {!online && (
        <div className="demo-banner offline-banner" role="status">
          <div className="demo-banner-inner">
            <Icon name="info" />
            <p>
              <strong>You are offline.</strong> Figures already loaded stay on screen; new ones load
              when the connection returns.
            </p>
          </div>
        </div>
      )}

      <main id="main" className="page">
        <Suspense fallback={<SkeletonCard lines={4} block />}>
          <Outlet context={overview satisfies OverviewContext} />
        </Suspense>
      </main>

      <CompareTray />
      <Shortcuts />

      {/* Phones: the same links in a bar at the bottom of the screen, within thumb reach. */}
      <nav className="bottom-nav phone-only" aria-label="Main">
        <NavLinks pathname={pathname} />
      </nav>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <NavLink to="/" className="brand" aria-label="ProcureGuard home">
              <span className="brand-logo" aria-hidden="true">
                <span className="brand-mark" />
              </span>
              <span>ProcureGuard</span>
            </NavLink>
            <p>
              ProcureGuard screens published PhilGEPS data to help reviewers decide where to look
              first. A flag marks a contract as statistically unusual. It is not a finding of
              wrongdoing by any person or organization.
            </p>
          </div>
          <div className="footer-links">
            <div>
              <h2>Use</h2>
              <ul>
                <li>
                  <NavLink to="/" className="text-link">
                    Contracts
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/patterns" className="text-link">
                    Patterns
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/about" className="text-link">
                    How scores work
                  </NavLink>
                </li>
                <li>
                  <a href="/api/feed.xml" className="text-link">
                    New flags (RSS feed)
                  </a>
                </li>
                <li>
                  <NavLink to="/stability" className="text-link">
                    How stable the ranking is
                  </NavLink>
                </li>
                <li>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      navigate('/');
                      window.setTimeout(startTour, 400);
                    }}
                  >
                    Take the tour
                  </button>
                </li>
                <li>
                  <button type="button" className="text-button" onClick={openShortcuts}>
                    Keyboard shortcuts
                  </button>
                </li>
                <li>
                  <NavLink to="/signin" className="text-link">
                    Team sign-in
                  </NavLink>
                </li>
              </ul>
            </div>
            <div>
              <h2>Legal</h2>
              <ul>
                <li>
                  <NavLink to="/terms" className="text-link">
                    Terms of Use
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/privacy" className="text-link">
                    Privacy Policy
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/styleguide" className="text-link">
                    Design system
                  </NavLink>
                </li>
              </ul>
            </div>
          </div>
          <p className="footer-base">
            Data: PhilGEPS Open Data Portal, 2024 civil works. A research prototype.
          </p>
        </div>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <RunProvider>
        <ToastProvider>
          <ReviewerProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<QueuePage />}>
                  <Route path="contracts/:id" element={<ContractPanel />} />
                </Route>
                <Route path="/profile/:kind" element={<ProfilePage />} />
                <Route path="/patterns" element={<PatternsPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/signin" element={<SignInPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/compare" element={<ComparePage />} />
                <Route path="/stability" element={<StabilityPage />} />
                <Route path="/styleguide" element={<StyleguidePage />} />
                {/* The data quality and method pages became sections of the About page. */}
                <Route
                  path="/data"
                  element={<Navigate to={{ pathname: '/about', hash: '#data' }} replace />}
                />
                <Route
                  path="/method"
                  element={<Navigate to={{ pathname: '/about', hash: '#method' }} replace />}
                />
                {/* Typos and retired addresses land on the contract list. */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </ReviewerProvider>
        </ToastProvider>
      </RunProvider>
    </BrowserRouter>
  );
}
