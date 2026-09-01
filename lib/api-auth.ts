import { NextRequest, NextResponse } from "next/server";
import { getTokenFromHeader, verifyToken } from "@/lib/auth";
import type { UserPayload } from "@/types/api";

/**
 * Extract and verify the Bearer token from an incoming API request.
 * Returns the decoded user payload, or null when missing/invalid.
 */
export function getAuthUser(req: NextRequest): UserPayload | null {
  const token = getTokenFromHeader(req.headers.get("authorization"));
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Convenience guard for route handlers. Returns either the authenticated
 * user, or a ready-to-return 401 response.
 */
export function requireAuth(
  req: NextRequest
): { user: UserPayload; response?: never } | { user?: never; response: NextResponse } {
  const user = getAuthUser(req);
  if (!user) {
    return {
      response: NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      ),
    };
  }
  return { user };
}
