import { createHash } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';

/**
 * Headers for every API response. The API serves JSON and CSV only, never a
 * page, so nothing it returns may be framed, sniffed as HTML or run as script.
 */
export function securityHeaders(options: { hsts: boolean }): RequestHandler {
  return (_req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    // Only over HTTPS (Vercel); locally the API is plain HTTP on 127.0.0.1.
    if (options.hsts) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

export interface RateLimit {
  /** Requests allowed per window, per client address. */
  limit: number;
  windowMs: number;
}

/** Where the request came from. Behind Vercel the platform sets x-forwarded-for itself. */
export function clientAddress(req: Request, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * A fixed-window limit per client address, kept in memory.
 *
 * On Vercel each function instance counts on its own, so the real ceiling is
 * this limit times the number of warm instances. That is enough to stop one
 * client from looping over the search or export; a platform firewall rule is
 * the stronger control if one is ever needed.
 */
export function rateLimit(
  { limit, windowMs }: RateLimit,
  options: { trustProxy: boolean; now?: () => number; maxClients?: number },
): RequestHandler {
  const now = options.now ?? Date.now;
  const maxClients = options.maxClients ?? 10_000;
  const windows = new Map<string, { start: number; count: number }>();

  return (req, res, next) => {
    const time = now();
    const key = clientAddress(req, options.trustProxy);
    let entry = windows.get(key);
    if (!entry || time - entry.start >= windowMs) {
      // Keep memory bounded: drop expired windows, and if that is not enough, the oldest.
      if (!entry && windows.size >= maxClients) {
        for (const [other, value] of windows) {
          if (time - value.start >= windowMs) windows.delete(other);
        }
        if (windows.size >= maxClients) windows.delete(windows.keys().next().value!);
      }
      entry = { start: time, count: 0 };
      windows.set(key, entry);
    }
    entry.count += 1;
    const resetSeconds = Math.max(1, Math.ceil((entry.start + windowMs - time) / 1000));
    res.set({
      'RateLimit-Limit': String(limit),
      'RateLimit-Remaining': String(Math.max(0, limit - entry.count)),
      'RateLimit-Reset': String(resetSeconds),
    });
    if (entry.count > limit) {
      res.set('Retry-After', String(resetSeconds));
      res.status(429).json({ error: 'Too many requests. Wait a moment and try again.' });
      return;
    }
    next();
  };
}

// Responses for a run named in the URL describe a stored run, which ml/ never
// changes once written. The CDN keeps them for a day; browsers revalidate after
// ten minutes with the ETag. A day bounds how stale a cached copy can get if
// contracts or document request counts are reloaded (a redeploy clears the CDN).
export const CACHE_PINNED_RUN = 'public, max-age=600, s-maxage=86400, stale-while-revalidate=86400';
// "The latest run" moves when a new run is stored, so keep those short.
export const CACHE_LATEST = 'public, max-age=30, s-maxage=30, stale-while-revalidate=60';

/**
 * Cache headers for a response tied to a scoring run, and an early 304.
 *
 * `pinned` is true when the URL names the run that was served. The ETag is
 * derived from the URL, the run and a data version (see dataVersion), so a
 * browser holding a current copy gets 304 before any list query runs.
 * Returns true when the 304 has been sent and the handler should stop.
 */
export function cacheForRun(
  req: Request,
  res: Response,
  { pinned, version }: { pinned: boolean; version: string },
): boolean {
  res.set('Cache-Control', pinned ? CACHE_PINNED_RUN : CACHE_LATEST);
  // Shared caches must keep apart responses that differ only in this header.
  res.vary('Accept-Encoding');
  const tag = `W/"${createHash('sha1').update(`${version}\n${req.originalUrl}`).digest('base64url').slice(0, 27)}"`;
  res.set('ETag', tag);
  const sent = req.headers['if-none-match'];
  if (sent && sent.split(',').some((value) => value.trim() === tag)) {
    res.status(304).end();
    return true;
  }
  return false;
}
