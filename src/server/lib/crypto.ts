import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Generate a cryptographically secure random session ID (base64url, 32 bytes).
 */
export function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}

function getSigningKey(): string {
  return process.env.HANARE_SESSION_SECRET ?? "hanare-dev-secret-change-me";
}

/**
 * Sign a value with HMAC-SHA256. Returns `value.signature` (both base64url).
 */
export function sign(value: string): string {
  const sig = createHmac("sha256", getSigningKey()).update(value).digest("base64url");
  return `${value}.${sig}`;
}

/**
 * Verify a signed value. Returns the original value if valid, null otherwise.
 */
export function unsign(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx < 0) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = createHmac("sha256", getSigningKey()).update(value).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return value;
}
