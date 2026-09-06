/**
 * Email address helpers shared by the client and the API routes.
 *
 * No Node-only imports — safe to import from client components.
 *
 * Addresses are compared case-insensitively and without surrounding
 * whitespace. Before this, "Nancy@x.com" and "nancy@x.com" were two different
 * accounts: phone keyboards auto-capitalise the first letter, so logging in
 * from a phone could fail and a second signup would silently create a fresh,
 * empty account — the same person then saw different data on each device.
 */

/** Canonical form for storage and lookup: trimmed and lowercased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

/** Escape a string for use inside a RegExp source. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
