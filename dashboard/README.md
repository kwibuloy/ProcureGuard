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

| Route                                             | Screen                                                                                                                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                               | Contracts: summary, score histogram, main reasons, map by place, filterable ranked table, CSV export                                                                                |
| `/contracts/:id`                                  | Side panel over the queue explaining one contract's score; prints as a one-page summary                                                                                             |
| `/profile/entity?name=`, `/profile/awardee?name=` | Everything one procuring entity awarded, or one awardee won                                                                                                                         |
| `/about`                                          | Common questions, how ProcureGuard works (what a flag means, the three indicators, the score, limits), and the data quality figures. `/data` and `/method` redirect to its sections |

Filters, sort order and page live in the URL, so a filtered view can be shared as a link. View settings (grouping lots by notice, hidden columns, compact rows) also live in the URL and are saved in the browser; a link that carries settings wins over the saved ones. The scoring run on screen is chosen in the header and lasts for the browser session.

## Working the queue

- Select a histogram bar or a main-reason bar to filter the list; active filters appear as removable chips.
- `J` and `K` (or the arrow keys) move through the list, `Enter` opens a contract, `Esc` closes it, `/` jumps to search. With a contract open, `J` and `K` go to the next and previous one.
- "Mark as reviewed" is saved in the browser only (`localStorage`). The API is read-only, so nothing about a review reaches the server or other reviewers.

## Phones

Below 860px wide the Contracts page is rebuilt for scrolling less (desktop is unchanged):

- A one-line summary strip, then **List · Map · Charts** tabs (`tab` in the URL). The map loads only when its tab is opened.
- Contracts are cards (about 140px), not a table, so nothing scrolls sideways. Cards leave out the rank (the order shows it) and the awardee; the contract panel shows both.
- Search and a **Filters** button stay pinned while the list scrolls; the other filters open as a sheet from the bottom.
- 10 contracts at a time with **Show more** (up to 100, then pages), and a back-to-top button.
- The page tabs (Contracts, About) move to a bar at the bottom of the screen; the top bar is one 56px row.

Unknown addresses, including the removed `/compare` page, redirect to `/`.

## Map

The map card shows flagged contracts by where the procuring entity is based (PhilGEPS publishes no project sites): regions, then a region's provinces, then a province's cities and municipalities. Choosing a place filters the list.

- Boundaries are in `public/maps/`: PSGC (December 2023) from [faeldon/philippines-json-maps](https://github.com/faeldon/philippines-json-maps), MIT (`public/maps/LICENSE.txt`), low resolution. About 950 KB in all, but a viewer loads only the country file (137 KB) when the card scrolls into view, then about 10 KB per region or province opened.
- `src/map/places.ts` matches PhilGEPS names to PSGC codes. On the 2024 data, 99.9% of contracts match a province and about 90% a city. Most of the rest are highly urbanized cities (Iloilo City, Cebu City and others), which the boundary files do not draw; they are listed by name beside their province.
- The Negros Island Region (2024) does not exist in the 2023 boundaries; its provinces are drawn in their former regions.
- After replacing the boundary files, rebuild the name index: `node scripts/build-map-index.mjs`.

## Design rules

- **No alarm colors.** Scores and flags are drawn in ink on paper tones. A flag is a prompt to review, so nothing is styled as a warning or an error.
- **Color means one thing, and nothing else.** Red and blue mean an indicator raised or lowered a score. The pair passes the colorblind checks in light and dark themes, and is also written out in a legend or label. Maps and charts use ink shades.
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
