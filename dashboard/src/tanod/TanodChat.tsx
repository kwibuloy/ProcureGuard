/**
 * The Tanod helper: a mascot in the bottom-left corner that opens a chat.
 * Answers come from brain.ts (written replies and live lookups, no AI service).
 * The 3D mascot loads after the page settles; until then, and without WebGL,
 * a still image stands in.
 */
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRuns } from '../run';
import { answer, resolve, STARTERS, type Fetcher, type Link, type Mood, type Reply } from './brain';
import type { StageState } from './TanodStage';

const TanodStage = lazy(() => import('./TanodStage'));

interface Message {
  id: number;
  from: 'tanod' | 'you';
  text: string[];
  links?: Link[];
  suggestions?: string[];
}

const fetchJson: Fetcher = async <T,>(path: string) => {
  const response = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!response.ok)
    throw new Error(response.status === 404 ? 'Not found' : `Request failed (${response.status})`);
  return (await response.json()) as T;
};

const TEASERS = [
  'Questions about a flag? Ask me!',
  'Psst, I can explain any score.',
  'Magandang araw! Need help?',
  'Want the top flagged contracts?',
];

const GREETING: Reply = {
  mood: 'wave',
  text: [
    'Magandang araw! I’m Tanod. I can explain flags and scores, the four indicators, and how to use ProcureGuard.',
    'Ask me anything, or pick a question below.',
  ],
  suggestions: STARTERS,
};

/** Scroll to an element once it exists (a lazily loaded page can take a moment). */
function scrollToWhenReady(id: string, tries = 30) {
  window.setTimeout(() => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    } else if (tries > 0) {
      scrollToWhenReady(id, tries - 1);
    }
  }, 120);
}

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Which contract is open, from the address: /contracts/123. */
const openContract = (pathname: string) => {
  const match = /^\/contracts\/(\d+)/.exec(pathname);
  return match ? Number(match[1]) : null;
};

export function TanodChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typing, setTyping] = useState<{ id: number; shown: number } | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState<Mood | 'idle'>('idle');
  const [hover, setHover] = useState(false);
  const [greet, setGreet] = useState(0);
  const [stage, setStage] = useState<'still' | 'loading' | 'ready' | 'failed'>('still');
  const [teaser, setTeaser] = useState<string | null>(null);
  const nextId = useRef(1);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const moodTimer = useRef<number | undefined>(undefined);
  const { selected } = useRuns();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const panelId = useId();

  // Load the 3D mascot once the page has settled, so it never slows the first view.
  useEffect(() => {
    const start = () => setStage((s) => (s === 'still' ? 'loading' : s));
    const idle = window.requestIdleCallback?.(start, { timeout: 4000 });
    const timer = idle === undefined ? window.setTimeout(start, 1500) : undefined;
    return () => {
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
      window.clearTimeout(timer);
    };
  }, []);

  // While closed, he says hello now and then (at most a few times a visit).
  useEffect(() => {
    if (open) return;
    let shown = 0;
    let hide: number | undefined;
    const show = () => {
      if (shown >= 3 || document.hidden) return;
      setTeaser(TEASERS[shown % TEASERS.length]);
      setGreet((g) => g + 1);
      shown += 1;
      hide = window.setTimeout(() => setTeaser(null), 5000);
    };
    const first = window.setTimeout(show, 6000);
    const every = window.setInterval(show, 45000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
      window.clearTimeout(hide);
    };
  }, [open]);

  /** Show a mood for a while, then settle back to idle. */
  const act = useCallback((next: Mood | 'idle', ms = 3200) => {
    window.clearTimeout(moodTimer.current);
    setMood(next);
    if (next !== 'idle' && next !== 'think') {
      moodTimer.current = window.setTimeout(() => setMood('idle'), ms);
    }
  }, []);

  const say = useCallback(
    (reply: Reply) => {
      const id = nextId.current++;
      setMessages((all) => [...all, { id, from: 'tanod', ...reply }]);
      const length = reply.text.join(' ').length;
      if (reducedMotion()) {
        setTyping(null);
      } else {
        setTyping({ id, shown: 0 });
      }
      act(reply.mood, Math.max(2600, Math.min(length * 28, 7000)));
    },
    [act],
  );

  // Type the newest reply out a few letters at a time; the mouth moves meanwhile.
  useEffect(() => {
    if (!typing) return;
    const message = messages.find((m) => m.id === typing.id);
    const total = message ? message.text.join(' ').length : 0;
    const timer = window.setTimeout(
      () =>
        setTyping((current) =>
          !current || current.shown + 3 >= total
            ? null
            : { id: current.id, shown: current.shown + 3 },
        ),
      18,
    );
    return () => window.clearTimeout(timer);
  }, [typing, messages]);

  useEffect(() => {
    log.current?.scrollTo({
      top: log.current.scrollHeight,
      behavior: reducedMotion() ? 'auto' : 'smooth',
    });
  }, [messages, typing, busy]);

  function openChat() {
    setOpen(true);
    setTeaser(null);
    setGreet((g) => g + 1);
    if (!messages.length) say(GREETING);
    window.setTimeout(() => input.current?.focus(), 50);
  }

  function closeChat() {
    setOpen(false);
    act('idle');
    launcher.current?.focus();
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setDraft('');
    setTyping(null);
    setMessages((all) => [...all, { id: nextId.current++, from: 'you', text: [text] }]);
    const result = answer(text, { contractId: openContract(pathname) });
    if ('reply' in result) {
      say(result.reply);
      return;
    }
    setBusy(true);
    act('think');
    const reply = await resolve(result.lookup, fetchJson, selected);
    setBusy(false);
    say(reply);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  function follow(link: Link) {
    const url = new URL(link.to, window.location.origin);
    navigate(link.to);
    // On a phone the panel covers the page; close it so the page shows.
    if (window.matchMedia?.('(max-width: 859px)').matches) setOpen(false);
    // Bring what the link points at into view, even when it is on the page
    // already open: a section of About, or the contract list below the summary.
    const target = url.hash ? url.hash.slice(1) : url.pathname === '/' ? 'queue-title' : null;
    if (target) scrollToWhenReady(target);
  }

  // Esc closes the chat.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeChat();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // closeChat only touches state setters and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stageState: StageState = {
    mood: busy ? 'think' : mood,
    talking: typing !== null,
    hover: hover && !open,
    greet,
  };

  const last = messages[messages.length - 1];

  return (
    <div className={`tanod${open ? ' is-open' : ''}`}>
      {open && (
        <section className="tanod-panel" id={panelId} aria-label="Ask Tanod">
          <header className="tanod-head">
            <div>
              <h2>Tanod</h2>
              <p>ProcureGuard’s helper · answers from this site’s data</p>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={closeChat}
              aria-label="Close the chat"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </header>

          <div className="tanod-log" ref={log} aria-live="polite" aria-relevant="additions">
            {messages.map((message) => {
              const isTyping = typing?.id === message.id;
              let budget = isTyping ? typing.shown : Infinity;
              return (
                <div key={message.id} className={`tanod-msg from-${message.from}`}>
                  <div className="tanod-bubble">
                    {message.text.map((paragraph, index) => {
                      const shown = paragraph.slice(0, Math.max(0, budget));
                      budget -= paragraph.length + 1;
                      if (!shown) return null;
                      return <p key={index}>{shown}</p>;
                    })}
                  </div>
                  {!isTyping && message.links && message.links.length > 0 && (
                    <div className="tanod-links">
                      {message.links.map((link) => (
                        <button
                          key={link.to + link.label}
                          type="button"
                          className="tanod-link"
                          onClick={() => follow(link)}
                        >
                          {link.label} →
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {busy && (
              <div className="tanod-msg from-tanod">
                <div className="tanod-bubble tanod-dots" aria-label="Tanod is checking">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          {last?.from === 'tanod' && !typing && !busy && last.suggestions && (
            <div className="tanod-suggest" aria-label="Suggested questions">
              {last.suggestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  className="tanod-chip"
                  onClick={() => void ask(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          )}

          <form className="tanod-form" onSubmit={submit}>
            <label className="visually-hidden" htmlFor={`${panelId}-q`}>
              Your question for Tanod
            </label>
            <input
              id={`${panelId}-q`}
              ref={input}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about a flag, a score, the data…"
              maxLength={200}
              autoComplete="off"
            />
            <button
              type="submit"
              className="button button-primary"
              disabled={!draft.trim() || busy}
            >
              Ask
            </button>
          </form>
        </section>
      )}

      {teaser && !open && (
        <button type="button" className="tanod-teaser" onClick={openChat}>
          {teaser}
        </button>
      )}

      <button
        ref={launcher}
        type="button"
        className="tanod-launcher"
        onClick={() => (open ? closeChat() : openChat())}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? 'Close the chat with Tanod' : 'Ask Tanod, ProcureGuard’s helper'}
        title={open ? 'Close the chat' : 'Ask Tanod'}
      >
        {stage !== 'ready' && <img className="tanod-still" src="/mascot/tanod.png" alt="" />}
        {(stage === 'loading' || stage === 'ready') && (
          <Suspense fallback={null}>
            <TanodStage
              state={stageState}
              onReady={() => setStage('ready')}
              onFail={() => setStage('failed')}
            />
          </Suspense>
        )}
      </button>
    </div>
  );
}
