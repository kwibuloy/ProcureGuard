import { useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { useApi, type Overview } from './api';
import { Icon } from './components/Icon';
import { formatDate } from './format';
import type { OverviewContext } from './overview';
import { ContractPanel } from './pages/ContractPanel';
import { MethodPage } from './pages/MethodPage';
import { QueuePage } from './pages/QueuePage';

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
  return (
    <button
      type="button"
      className="icon-button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
    </button>
  );
}

function Layout() {
  const overview = useApi<Overview>('/api/overview');
  const run = overview.data?.run ?? null;

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
            <NavLink to="/" className={({ isActive }) => (isActive ? 'is-active' : '')}>
              Review queue
            </NavLink>
            <NavLink to="/method" className={({ isActive }) => (isActive ? 'is-active' : '')}>
              Method and limits
            </NavLink>
          </nav>
          <div className="topbar-end">
            {run && (
              <span className="run-chip" title={run.modelName}>
                Run {run.id} · {formatDate(run.createdAt)}
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {run?.isDemo && (
        <div className="demo-banner" role="note">
          <div className="demo-banner-inner">
            <Icon name="info" />
            <p>
              <strong>Demonstration data.</strong> Every organization, contract and score shown here
              is generated. Nothing on this page describes a real contract.
            </p>
          </div>
        </div>
      )}

      <main id="main" className="page">
        <Outlet context={overview satisfies OverviewContext} />
      </main>

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
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<QueuePage />}>
            <Route path="contracts/:id" element={<ContractPanel />} />
          </Route>
          <Route path="/method" element={<MethodPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
