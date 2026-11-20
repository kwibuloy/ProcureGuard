import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useReviewer } from '../reviews';

/** Sign-in for the review team. Viewing the site never needs an account. */
export function SignInPage() {
  const { reviewer, signIn, signOut } = useReviewer();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
      setPassword('');
      navigate('/');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="signin">
      <h1>Team sign-in</h1>
      <p className="lede">
        For the ProcureGuard review team, to record review statuses and notes. Everyone can view
        contracts, scores and reviews without an account.
      </p>
      {reviewer ? (
        <div className="card signin-card">
          <p>
            Signed in as <strong>{reviewer.displayName}</strong>.
          </p>
          <div className="review-actions">
            <Link to="/" className="button">
              Go to contracts
            </Link>
            <button type="button" className="button button-outline" onClick={() => signOut()}>
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <form className="card signin-card" onSubmit={submit}>
          <label className="field field-block">
            <span>Username</span>
            <input
              autoComplete="username"
              value={username}
              required
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
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}
    </div>
  );
}
