/**
 * Human review: who is signed in, each contract's review status, and saving
 * a review. Anyone can read reviews; only signed-in reviewers can write them.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export type ReviewStatus = 'not_reviewed' | 'explained' | 'needs_follow_up';

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  not_reviewed: 'Not reviewed',
  explained: 'Reviewed: explained',
  needs_follow_up: 'Reviewed: needs follow-up',
};

/** What each status means, shown where a reviewer chooses one. */
export const REVIEW_HELP: Record<ReviewStatus, string> = {
  not_reviewed: 'No one has checked this contract yet, or a review was withdrawn.',
  explained: 'A reviewer checked the records and found an ordinary reason for the pattern.',
  needs_follow_up:
    'A reviewer could not explain the pattern from the public records. This is not a finding of wrongdoing.',
};

export interface Reviewer {
  id: number;
  username: string;
  displayName: string;
}

export interface ReviewEntry {
  id: number;
  status: ReviewStatus;
  note: string | null;
  reviewer: string;
  runId: number | null;
  createdAt: string;
}

export interface ResponseEntry {
  id: number;
  organization: string;
  summary: string;
  receivedOn: string;
  verifiedBy: string;
  createdAt: string;
}

/** Sent on every write; the API refuses writes without it (a cross-site form cannot add it). */
const WRITE_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'X-ProcureGuard-Request': '1',
};

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: WRITE_HEADERS,
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data as T;
}

// Bumped after every saved review, so open lists and panels fetch again.
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export function reviewsChanged() {
  version += 1;
  listeners.forEach((listener) => listener());
}
const useReviewsVersion = () => useSyncExternalStore(subscribe, () => version);

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    signal,
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

/** The latest review status of each contract shown. */
export function useReviewStatuses(ids: number[]): ReadonlyMap<number, ReviewStatus> {
  const changed = useReviewsVersion();
  const key = ids.slice(0, 200).join(',');
  const [statuses, setStatuses] = useState<ReadonlyMap<number, ReviewStatus>>(new Map());
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    getJson<{ statuses: Record<string, ReviewStatus> }>(
      `/api/review-status?ids=${key}`,
      controller.signal,
    )
      .then(({ statuses: found }) => {
        if (!controller.signal.aborted) {
          setStatuses(new Map(Object.entries(found).map(([id, status]) => [Number(id), status])));
        }
      })
      .catch(() => {
        // Review marks are extra: the list still works without them.
      });
    return () => controller.abort();
  }, [key, changed]);
  return key ? statuses : new Map();
}

/** Every review and verified reply for one contract, newest first. */
export function useContractReviews(contractId: number) {
  const changed = useReviewsVersion();
  const [state, setState] = useState<{
    reviews: ReviewEntry[];
    responses: ResponseEntry[];
    loaded: boolean;
    failed: boolean;
  }>({ reviews: [], responses: [], loaded: false, failed: false });
  useEffect(() => {
    const controller = new AbortController();
    getJson<{ reviews: ReviewEntry[]; responses: ResponseEntry[] }>(
      `/api/reviews/${contractId}`,
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setState({ ...data, loaded: true, failed: false });
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError' && !controller.signal.aborted) {
          setState({ reviews: [], responses: [], loaded: true, failed: true });
        }
      });
    return () => controller.abort();
  }, [contractId, changed]);
  return state;
}

interface ReviewerState {
  reviewer: Reviewer | null;
  checked: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const ReviewerContext = createContext<ReviewerState>({
  reviewer: null,
  checked: false,
  signIn: async () => {},
  signOut: async () => {},
});

export function ReviewerProvider({ children }: { children: ReactNode }) {
  const [reviewer, setReviewer] = useState<Reviewer | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getJson<Reviewer>('/api/auth/me', controller.signal)
      .then((found) => setReviewer(found))
      .catch(() => setReviewer(null))
      .finally(() => {
        if (!controller.signal.aborted) setChecked(true);
      });
    return () => controller.abort();
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    setReviewer(await postJson<Reviewer>('/api/auth/login', { username, password }));
  }, []);
  const signOut = useCallback(async () => {
    await postJson('/api/auth/logout', {}).catch(() => {});
    setReviewer(null);
  }, []);

  const value = useMemo(
    () => ({ reviewer, checked, signIn, signOut }),
    [reviewer, checked, signIn, signOut],
  );
  return <ReviewerContext.Provider value={value}>{children}</ReviewerContext.Provider>;
}

export const useReviewer = () => useContext(ReviewerContext);
