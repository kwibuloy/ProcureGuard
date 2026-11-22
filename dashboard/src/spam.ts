/**
 * Light spam protection for the forms. The API is the real gate (sign-in is
 * rate-limited and locks after repeated failures; writes need a session and a
 * same-site header). These checks stop the cheap cases before a request is sent:
 *
 * - a hidden "website" field that people never see but form-filling bots fill in;
 * - a minimum time between the form appearing and being sent;
 * - a short pause after each attempt, so a held Enter key cannot flood the API.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_FILL_MS = 1200;

export function useSpamGuard(cooldownMs = 3000) {
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = Date.now();
  }, []);
  const [trap, setTrap] = useState('');
  const [waitUntil, setWaitUntil] = useState(0);

  /** Null when the submission may go ahead; otherwise why it was held back. */
  const check = useCallback((): string | null => {
    const now = Date.now();
    if (trap) return 'This form could not be sent.';
    if (now - shownAt.current < MIN_FILL_MS)
      return 'That was quick. Check the form and send it again.';
    if (now < waitUntil) return 'Wait a moment before trying again.';
    return null;
  }, [trap, waitUntil]);

  /** Call after each attempt that reached the API. */
  const attempted = useCallback(() => setWaitUntil(Date.now() + cooldownMs), [cooldownMs]);

  return { trap, setTrap, check, attempted };
}
