import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { UserPayload } from "@/types/api";

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

/**
 * Create a single-use password reset token.
 *
 * The raw token is what goes in the emailed link; only its hash is persisted,
 * so a leaked database dump cannot be used to reset anyone's password.
 */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Hash a reset token for storage/lookup. Plain SHA-256 is appropriate here
 * (unlike for passwords) because the token is 256 bits of random data and is
 * therefore not brute-forceable.
 */
export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateToken(user: UserPayload): string {
  const secret = process.env.JWT_SECRET || "your-secret-key";
  return jwt.sign(user, secret, { expiresIn: "7d" });
}

export function verifyToken(token: string): UserPayload | null {
  try {
    const secret = process.env.JWT_SECRET || "your-secret-key";
    return jwt.verify(token, secret) as UserPayload;
  } catch {
    return null;
  }
}

export function getTokenFromHeader(authHeader?: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length === 2 && parts[0] === "Bearer") {
    return parts[1];
  }
  return null;
}
