import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of the owner-key header both re-engagement sending routes
 * are gated on: `Authorization: Bearer <CRON_SECRET>`, which is what Vercel Cron
 * sends. One function rather than a copy per route, because a comparison that has
 * to be constant-time is exactly the kind that must not drift between two call
 * sites — `/api/reengage/run` and `/api/reengage` each carried their own
 * byte-identical `authorized()` until 2026-09-24.
 *
 * Both sides are hashed to a fixed 32-byte digest before the compare. Node's own
 * documentation for `crypto.timingSafeEqual` says of its two arguments: "they must
 * have the same byte length. An error is thrown if `a` and `b` have different byte
 * lengths."
 * (raw.githubusercontent.com/nodejs/node/v22.11.0/doc/api/crypto.md, lines 5449-5451.)
 * So feeding it the raw header would turn any wrong-length header into a thrown
 * error instead of a 401, and pre-checking the lengths to avoid that would leak the
 * secret's length through the branch. Hashing first removes both problems: the
 * digests are always 32 bytes whatever the header was.
 */
export function cronAuthorized(request: Request, env: Record<string, string | undefined> = process.env) {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const supplied = createHash("sha256").update(request.headers.get("authorization") || "", "utf8").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`, "utf8").digest();
  return timingSafeEqual(supplied, expected);
}
