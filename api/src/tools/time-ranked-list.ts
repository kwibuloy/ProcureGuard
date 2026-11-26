/**
 * Performance test for NFR-02: the ranked list loads within 3 seconds for 95% of
 * requests (methodology Section 3.12).
 *
 * Run: npm run time:list -- [base URL] [requests]
 *   base URL  default http://127.0.0.1:3001 (or API_URL)
 *   requests  default 100
 *
 * Sends the same list requests the dashboard sends for the review queue (25 rows a
 * page; flagged contracts by rank, then other pages, sorts and filters), one at a
 * time, and times each from sending the request to reading the whole body. Requests
 * are spaced to stay under the API's list rate limit (120 a minute), so a run of 100
 * takes about a minute. Exits with code 1 if fewer than 95% finish within 3 seconds
 * or any request fails.
 */

const LIMIT_MS = 3000;
const TARGET_SHARE = 0.95;
const SPACING_MS = 550; // about 109 requests a minute, under the limit of 120

/** The list requests a reviewer makes, cycled through in order. */
const QUERIES = [
  'flagged=true&page=1&pageSize=25',
  'flagged=true&page=2&pageSize=25',
  'flagged=true&page=10&pageSize=25',
  'flagged=true&page=1&pageSize=25&sort=amount',
  'flagged=true&page=1&pageSize=25&sort=recent',
  'flagged=true&page=1&pageSize=25&reason=price_deviation',
  'flagged=true&page=1&pageSize=25&reason=repeated_winner',
  'flagged=true&page=1&pageSize=25&scoreFrom=0.8',
  'flagged=true&page=1&pageSize=25&q=road',
  'page=1&pageSize=25',
];

export interface Summary {
  requests: number;
  failed: number;
  withinLimit: number;
  share: number;
  p50: number;
  p95: number;
  max: number;
  passed: boolean;
}

/** The value at or below which `share` of the sorted times fall (nearest rank). */
export function percentile(sorted: number[], share: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)] ?? 0;
}

export function summarize(times: number[], failed: number): Summary {
  const sorted = [...times].sort((a, b) => a - b);
  const requests = times.length + failed;
  const withinLimit = sorted.filter((ms) => ms <= LIMIT_MS).length;
  const share = requests ? withinLimit / requests : 0;
  return {
    requests,
    failed,
    withinLimit,
    share,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? 0,
    passed: failed === 0 && share >= TARGET_SHARE,
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const base = (process.argv[2] ?? process.env.API_URL ?? 'http://127.0.0.1:3001').replace(
    /\/$/,
    '',
  );
  const count = Number(process.argv[3] ?? 100);
  if (!Number.isInteger(count) || count < 1)
    throw new Error('requests must be a positive whole number');

  const times: number[] = [];
  let failed = 0;
  for (let i = 0; i < count; i++) {
    const url = `${base}/api/contracts?${QUERIES[i % QUERIES.length]}`;
    const started = performance.now();
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      await response.text();
      if (response.ok) times.push(performance.now() - started);
      else {
        failed += 1;
        console.error(`HTTP ${response.status} for ${url}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`Request failed for ${url}: ${(error as Error).message}`);
    }
    if (i < count - 1) await wait(SPACING_MS);
  }

  const s = summarize(times, failed);
  console.log(`Ranked list timing against ${base}`);
  console.log(`  requests          ${s.requests} (${s.failed} failed)`);
  console.log(`  median            ${s.p50.toFixed(0)} ms`);
  console.log(`  95th percentile   ${s.p95.toFixed(0)} ms`);
  console.log(`  slowest           ${s.max.toFixed(0)} ms`);
  console.log(
    `  within ${LIMIT_MS / 1000} s        ${s.withinLimit} of ${s.requests} (${(s.share * 100).toFixed(1)}%)`,
  );
  console.log(`NFR-02 (95% within 3 s): ${s.passed ? 'met' : 'NOT met'}`);
  process.exitCode = s.passed ? 0 : 1;
}

// Run only as a script, not when a test imports the helpers.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/time-ranked-list.ts')) {
  await main();
}
