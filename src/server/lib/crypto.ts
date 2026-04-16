import { randomBytes } from "node:crypto";

/**
 * Generate a cryptographically secure random session ID (base64url, 32 bytes).
 */
export function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}
