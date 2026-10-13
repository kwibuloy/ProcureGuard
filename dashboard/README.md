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

With no real scores yet, load demonstration data from the repo root: `python -m pipeline.demo` (remove it with `python -m pipeline.demo --clear`). The dashboard shows a banner whenever the latest run is demonstration data.

## Screens

| Route            | Screen                                                                        |
| ---------------- | ----------------------------------------------------------------------------- |
| `/`              | Review queue: summary, score histogram, main reasons, filterable ranked table |
| `/contracts/:id` | Side panel over the queue explaining one contract's score                     |
| `/method`        | What a flag means, the three indicators, and the system's limits              |

Filters, sort order and page live in the URL, so a filtered view can be shared as a link.

## Design rules

- **No alarm colors.** Scores and flags are drawn in ink on paper tones. A flag is a prompt to review, so nothing is styled as a warning or an error.
- **Color means one thing.** Red and blue appear only in the contribution chart, for "raises the score" and "lowers the score". Both pass the colorblind checks in light and dark themes.
- **Every score shows its reasons.** A score never appears in the detail view without the three indicators, their points and a sentence stating the figures behind each.
- **Wording.** "Flagged for review" and "statistically unusual" only. Document requests are never called bids or bidders. Indicator names and sentences live in `src/indicators.ts`.
- Colors, spacing and both themes are tokens at the top of `src/styles.css`.

## Checks

```
npm test          # Vitest with Testing Library
npm run lint
npm run typecheck
npm run build
```
