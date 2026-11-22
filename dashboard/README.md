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

| Route                                             | Screen                                                                                                                                                                                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                               | Contracts: summary, score histogram, main reasons, map by place, filterable ranked table (award period, new flags only), review marks, "New" badges, CSV export                                                                                       |
| `/contracts/:id`                                  | Side panel over the queue explaining one contract's score: indicators, price compared with similar contracts, review status and history, the scoring run, links to PhilGEPS and to respond by email; prints as a one-page summary with the disclaimer |
| `/profile/entity?name=`, `/profile/awardee?name=` | Everything one procuring entity awarded, or one awardee won, with contracts by award month; entities link to a search for their COA audit reports                                                                                                     |
| `/about`                                          | Common questions, how ProcureGuard works (what a flag means, the four indicators, the score, limits), and the data quality figures. `/data` and `/method` redirect to its sections                                                                    |
| `/signin`                                         | Sign-in for the review team. Viewing never needs an account                                                                                                                                                                                           |
| `/compare?ids=`                                   | Two contracts side by side: score, key facts and the indicators behind each score                                                                                                                                                                     |
| `/stability`                                      | How two scoring runs rank the same contracts; a slider moves the top contracts between the two orders                                                                                                                                                 |
| `/styleguide`                                     | The design system: every component with the rule for using it. Linked from the footer only                                                                                                                                                            |
| `/terms`, `/privacy`                              | Terms of Use and Privacy Policy                                                                                                                                                                                                                       |

Filters, sort order and page live in the URL, so a filtered view can be shared as a link. View settings (grouping lots by notice, hidden columns, compact rows) also live in the URL and are saved in the browser; a link that carries settings wins over the saved ones. The scoring run on screen is chosen in the header and lasts for the browser session.

## Working the queue

- Select a histogram bar or a main-reason bar to filter the list; active filters appear as removable chips.
- `J` and `K` (or the arrow keys) move through the list, `Enter` opens a contract, `Esc` closes it, `/` jumps to search. With a contract open, `J` and `K` go to the next and previous one.
- Typing two or more letters in search suggests contracts, procuring entities, awardees and places.
- **Saved views** keep a named set of filters in this browser. **Compare** in a contract's panel adds it to a tray; two make a side-by-side page.
- The ring beside the list title shows how many of the run's 50 highest-ranked flags have a review. Reviews are written by signed-in team members and are public.
- `?` lists the keyboard shortcuts. First-time visitors get a three-step tour; "Take the tour" in the footer replays it.

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

The design system lives in `src/styles/`: `tokens.css` (every colour, border, shadow, radius, space, type size and timing, for light and dark), then `base.css`, `components.css`, `layout.css` and `pages.css`. Components use tokens only.

- **Neubrutalist.** Warm paper, 2px ink outlines, hard offset shadows, no blur and no gradients. Display type is Space Grotesk; text is Inter; mono only for keys and code. Nothing lighter than regular weight, nothing italic.
- **One accent, used for action.** Cyan marks the action to take (one primary button per view), the selected item and keyboard focus. It never appears in score explanations.
- **No alarm colours.** Scores and flags are drawn in ink. A flag is a prompt to review, so nothing is styled as a warning or an error.
- **Red and blue mean one thing.** An indicator raised or lowered a score. They appear only in score explanations, always with a legend or label.
- **Every score shows its reasons.** A score never appears in the detail view without the four indicators, their points and a sentence stating the figures behind each.
- **Wording.** "Flagged for review" and "statistically unusual" only. Document requests are never called bids or bidders. Indicator names and sentences live in `src/indicators.ts`.
- **Motion gives feedback.** The contract panel swings in from the edge, menus drop in 3D, bars grow from their baseline, figures count up, and a toast confirms actions that change something out of view (filtering from a chart or the map, copying a link, saving a review). Loading shows skeletons shaped like the content. All motion is cut to an instant under `prefers-reduced-motion`.
- **Component rules.** One primary button per view. The cyan highlight appears once per headline. A number always says what it counts and what it is out of. Any term a newcomer might not know gets a tip (`src/glossary.ts`). Confirm any action whose result is out of view with a toast. Every empty state says what happened and offers the most likely next step. `/styleguide` shows each of these.
- **Trust.** The hero shows where the data comes from, when it was scored and the run. The contract panel keeps a one-line disclaimer in view, so a screenshot of it carries the caveat.
- **Accessibility.** The contract panel keeps keyboard focus inside it. Histogram bars and map places can be reached with Tab and moved between with the arrow keys. Every chart has a text or table alternative.
- **Spam protection.** The API rate-limits and locks sign-in. The forms add a hidden field, a minimum fill time and a pause between attempts (`src/spam.ts`).
- **Nothing secret in the bundle.** The only build variable is `VITE_RESPONSE_EMAIL`, a public address.

## Checks

```
npm test          # Vitest with Testing Library
npm run lint
npm run typecheck
npm run build
```

## Build settings

`VITE_RESPONSE_EMAIL`: the address "Respond to this flag" opens an email to. Read at build time, so set it in the Vercel project settings and redeploy; the link is hidden while it is unset.
