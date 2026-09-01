/**
 * Password rules shared by the server routes and the client forms.
 *
 * Kept free of Node-only imports (unlike lib/auth.ts, which pulls in `crypto`
 * and `jsonwebtoken`) so client components can import it safely.
 */
export const MIN_PASSWORD_LENGTH = 8;
