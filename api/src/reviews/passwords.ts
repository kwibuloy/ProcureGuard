/** Reviewer passwords, hashed with scrypt (built into Node, no extra dependency). */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const KEY_LENGTH = 64;
// Cost parameters: OWASP's recommended minimum for scrypt (N = 2^17, r = 8,
// p = 1). About 470 ms per hash on a laptop. It needs 128 * N * r = 128 MiB of
// memory, above Node's 32 MiB default, so maxmem is raised with some headroom.
const OPTIONS = { N: 131_072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

export const MIN_PASSWORD_LENGTH = 12;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

/** "scrypt$N$r$p$salt$hash", salt and hash in base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, OPTIONS);
  return [
    'scrypt',
    OPTIONS.N,
    OPTIONS.r,
    OPTIONS.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await derive(password, Buffer.from(salt, 'base64url'), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: OPTIONS.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/**
 * True when a stored hash was made with different cost parameters than the
 * current ones, so it should be replaced after the next successful sign-in.
 * Until then an old, cheaper hash answers faster than an unknown username does.
 */
export function needsRehash(stored: string): boolean {
  const [scheme, n, r, p] = stored.split('$');
  return (
    scheme !== 'scrypt' ||
    Number(n) !== OPTIONS.N ||
    Number(r) !== OPTIONS.r ||
    Number(p) !== OPTIONS.p
  );
}

// Spent on an unknown username too, so a login answers in the same time
// whether or not the account exists.
let dummyHash: Promise<string> | null = null;
export async function spendDummyHash(password: string): Promise<void> {
  dummyHash ??= hashPassword('not-a-real-password-placeholder');
  await verifyPassword(password, await dummyHash);
}
