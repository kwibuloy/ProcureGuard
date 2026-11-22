import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { Trap } from '../components/Trap';
import { useReviewer } from '../reviews';
import { useSpamGuard } from '../spam';

/** Sign-in for the review team. Viewing the site never needs an account. */
export function SignInPage() {
  const { reviewer, signIn, signOut } = useReviewer();
  const navigate = useNavigate();
  const toast = useToast();
  const guard = useSpamGuard();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const held = guard.check();
    if (held) {
      setError(held);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
      setPassword('');
      toast('Signed in');
      navigate('/');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      guard.attempted();
      setBusy(false);
    }
  };

  return (
    <div className="signin">
      <div className="signin-intro">
        <p className="eyebrow">Review team</p>
        <h1>Team sign-in</h1>
        <p className="lede">
          For the ProcureGuard review team, to record review outcomes and notes. Anyone can view
          contracts, scores and reviews without an account.
        </p>
        <p>
          <Link to="/" className="text-link">
            Go to the contracts without signing in
          </Link>
        </p>
      </div>
      {reviewer ? (
        <div className="card signin-card">
          <p>
            Signed in as <strong>{reviewer.displayName}</strong>.
          </p>
          <div className="review-actions">
            <Link to="/" className="button button-primary">
              Go to contracts
            </Link>
            <button type="button" className="button" onClick={() => signOut()}>
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <form className="card signin-card" onSubmit={submit} noValidate={false}>
          <label className="field field-block">
            <span>Username</span>
            <input
              autoComplete="username"
              value={username}
              required
              maxLength={100}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="field field-block">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              required
              maxLength={200}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <Trap value={guard.trap} onChange={guard.setTrap} />
          {error && (
            <p className="form-error" role="alert" key={error}>
              <Icon name="info" size={18} />
              {error}
            </p>
          )}
          <button
            type="submit"
            className={`button button-primary button-lg ${busy ? 'is-busy' : ''}`}
            disabled={busy}
          >
            {busy ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Signing in
              </>
            ) : (
              <>
                <Icon name="lock" size={18} />
                Sign in
              </>
            )}
          </button>
          <p className="field-hint">
            Repeated failed attempts lock sign-in for a few minutes. By signing in you agree to the{' '}
            <Link to="/terms" className="text-link">
              Terms of Use
            </Link>
            .
          </p>
        </form>
      )}
    </div>
  );
}
