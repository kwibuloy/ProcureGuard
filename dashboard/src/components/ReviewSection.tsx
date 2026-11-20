import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '../format';
import {
  postJson,
  REVIEW_HELP,
  REVIEW_LABELS,
  reviewsChanged,
  useContractReviews,
  useReviewer,
  type ReviewStatus,
} from '../reviews';

const STATUSES = Object.keys(REVIEW_LABELS) as ReviewStatus[];
const NOTE_LIMIT = 2000;

/** Review status, its history and verified replies; a form for signed-in reviewers. */
export function ReviewSection({ contractId, runId }: { contractId: number; runId: number | null }) {
  const { reviews, responses, loaded, failed } = useContractReviews(contractId);
  const { reviewer } = useReviewer();
  const latest = reviews[0];

  return (
    <section className="review-section">
      <h3>Review</h3>
      <p className={`review-status is-${latest?.status ?? 'not_reviewed'}`}>
        {REVIEW_LABELS[latest?.status ?? 'not_reviewed']}
        {latest && (
          <span className="fact-sub">
            {latest.reviewer}, {formatDate(latest.createdAt)}
          </span>
        )}
      </p>
      {failed && <p className="section-note">Reviews could not be loaded.</p>}

      {responses.length > 0 && (
        <div className="responses">
          <h4>Replies received</h4>
          <ul>
            {responses.map((reply) => (
              <li key={reply.id}>
                <strong>{reply.organization}</strong>, received {formatDate(reply.receivedOn)}
                <p>{reply.summary}</p>
                <span className="fact-sub">Checked by {reply.verifiedBy} before it was shown</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {reviewer ? (
        <ReviewForm contractId={contractId} runId={runId} current={latest?.status} />
      ) : (
        loaded && (
          <p className="section-note">
            Reviews are written by the ProcureGuard team.{' '}
            <Link to="/signin" className="text-link">
              Team sign-in
            </Link>
          </p>
        )
      )}

      {reviews.length > 0 && (
        <details className="review-history">
          <summary>History ({reviews.length})</summary>
          <ol>
            {reviews.map((entry) => (
              <li key={entry.id}>
                <span className="review-history-head">
                  {REVIEW_LABELS[entry.status]} · {entry.reviewer} · {formatDate(entry.createdAt)}
                  {entry.runId && ` · run ${entry.runId}`}
                </span>
                {entry.note && <p>{entry.note}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function ReviewForm({
  contractId,
  runId,
  current,
}: {
  contractId: number;
  runId: number | null;
  current: ReviewStatus | undefined;
}) {
  const [status, setStatus] = useState<ReviewStatus>(current ?? 'explained');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reply, setReply] = useState({ organization: '', summary: '', receivedOn: '' });
  const [showReply, setShowReply] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await postJson('/api/reviews', { contractId, status, note, runId });
      setNote('');
      setMessage('Saved.');
      reviewsChanged();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveReply = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await postJson('/api/responses', { contractId, ...reply });
      setReply({ organization: '', summary: '', receivedOn: '' });
      setShowReply(false);
      setMessage('Reply added.');
      reviewsChanged();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="review-form">
      <form onSubmit={save}>
        <fieldset>
          <legend>Your review</legend>
          {STATUSES.map((value) => (
            <label key={value} className="review-choice">
              <input
                type="radio"
                name="review-status"
                value={value}
                checked={status === value}
                onChange={() => setStatus(value)}
              />
              <span>
                {REVIEW_LABELS[value]}
                <span className="fact-sub">{REVIEW_HELP[value]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="field field-block">
          <span>Note (public)</span>
          <textarea
            value={note}
            maxLength={NOTE_LIMIT}
            rows={3}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What you checked and what you found in the records. Describe the records, not the people."
          />
        </label>
        <div className="review-actions">
          <button type="submit" className="button" disabled={saving}>
            {saving ? 'Saving…' : 'Save review'}
          </button>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => setShowReply((open) => !open)}
          >
            {showReply ? 'Cancel reply' : 'Add a verified reply'}
          </button>
          {message && (
            <span className="review-message" role="status">
              {message}
            </span>
          )}
        </div>
      </form>

      {showReply && (
        <form onSubmit={saveReply} className="reply-form">
          <p className="section-note">
            Only add a reply after confirming it came from the organization, for example by
            answering its email at the organization’s official address.
          </p>
          <label className="field field-block">
            <span>Organization</span>
            <input
              value={reply.organization}
              maxLength={200}
              required
              onChange={(event) => setReply({ ...reply, organization: event.target.value })}
            />
          </label>
          <label className="field field-block">
            <span>Date received</span>
            <input
              type="date"
              value={reply.receivedOn}
              required
              onChange={(event) => setReply({ ...reply, receivedOn: event.target.value })}
            />
          </label>
          <label className="field field-block">
            <span>Summary of the reply</span>
            <textarea
              value={reply.summary}
              maxLength={NOTE_LIMIT}
              rows={3}
              required
              onChange={(event) => setReply({ ...reply, summary: event.target.value })}
            />
          </label>
          <button type="submit" className="button" disabled={saving}>
            Add reply
          </button>
        </form>
      )}
    </div>
  );
}
