# dashboard

React interface for reviewing flagged contracts (Objective 5).

## Run

Start the API first (`api/README.md`), then:

```
cd dashboard
npm install
npm run dev
```

Open `http://localhost:5173`. The dev server forwards `/api` to the API on port 3001, so the browser never talks to the database or holds credentials.

With no real data yet, load and score demonstration contracts from the repo root: `python -m pipeline.demo` then `python -m ml.score` (remove them with `python -m pipeline.demo --clear`). The dashboard shows a banner whenever the run on screen is demonstration data.

## Screens

| Route                                             | Screen                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/`                                               | Review queue: summary, score histogram, main reasons, filterable ranked table, CSV export  |
| `/contracts/:id`                                  | Side panel over the queue explaining one contract's score; prints as a one-page summary    |
| `/profile/entity?name=`, `/profile/awardee?name=` | Everything one procuring entity awarded, or one awardee won                                |
| `/compare`                                        | Two models side by side: shared flags, rank agreement, scatter plot, largest disagreements |
| `/data`                                           | Data quality: rows read and left out, field completeness, impossible values                |
| `/method`                                         | What a flag means, the three indicators, and the system's limits                           |

Filters, sort order and page live in the URL, so a filtered view can be shared as a link. The scoring run on screen is chosen in the header and lasts for the browser session.

## Working the queue

- Select a histogram bar or a main-reason bar to filter the list; active filters appear as removable chips.
- `J` and `K` (or the arrow keys) move through the list, `Enter` opens a contract, `Esc` closes it, `/` jumps to search. With a contract open, `J` and `K` go to the next and previous one.
- "Mark as reviewed" is saved in the browser only (`localStorage`). The API is read-only, so nothing about a review reaches the server or other reviewers.

## Design rules

- **No alarm colors.** Scores and flags are drawn in ink on paper tones. A flag is a prompt to review, so nothing is styled as a warning or an error.
- **Color means two things, and nothing else.** Red and blue mean an indicator raised or lowered a score. On the compare page, blue and orange mean which model flagged a contract. Every pair passes the colorblind checks in light and dark themes, and each is also written out in a legend or label.
- **Every score shows its reasons.** A score never appears in the detail view without the three indicators, their points and a sentence stating the figures behind each. The queue's Why column says the same in short: the indicator that raised the score most, its points, the figures behind it, and any other indicator that also raised it.
- **Wording.** "Flagged for review" and "statistically unusual" only. Document requests are never called bids or bidders. Indicator names and sentences live in `src/indicators.ts`.
- **Depth comes from light, not color.** Cards sit on layered shadows with a lit top edge and rise slightly under the pointer; a soft highlight follows the pointer across a card (`useSpotlight.ts`).
- **Motion shows where something came from.** Bars grow from their baseline, figures count up (`CountUp.tsx`), rows arrive in order. All of it is off under `prefers-reduced-motion`, and in print.
- Colors, shadows, spacing and both themes are tokens at the top of `src/styles.css`.

## Checks

```
npm test          # Vitest with Testing Library
npm run lint
npm run typecheck
npm run build
```
