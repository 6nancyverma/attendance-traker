import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { hashPassword, hashResetToken } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";
import type { MessageResponse, ResetPasswordRequest } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = (await req.json()) as ResetPasswordRequest;

    if (!token || !password) {
      return NextResponse.json(
        { error: "Token and password are required" },
        { status: 400 }
      );
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const resets = db.collection("password_resets");

    const record = await resets.findOne({ tokenHash: hashResetToken(token) });

    // Same message for unknown and expired tokens — no reason to distinguish.
    if (!record || record.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired" },
        { status: 400 }
      );
    }

    const result = await db
      .collection("users")
      .updateOne(
        { _id: record.userId },
        { $set: { password: hashPassword(password), updatedAt: new Date() } }
      );

    if (result.matchedCount === 0) {
      // Account removed between requesting and using the link.
      await resets.deleteMany({ userId: record.userId });
      return NextResponse.json(
        { error: "This reset link is invalid or has expired" },
        { status: 400 }
      );
    }

    // Burn the token (and any siblings) so the link cannot be replayed.
    await resets.deleteMany({ userId: record.userId });

    const response: MessageResponse = {
      message: "Your password has been reset. You can now sign in.",
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
