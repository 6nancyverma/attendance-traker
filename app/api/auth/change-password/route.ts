import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";
import type { ChangePasswordRequest, MessageResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (auth.response) return auth.response;

    const { currentPassword, newPassword } =
      (await req.json()) as ChangePasswordRequest;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current and new password are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "New password must be different from the current one" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const users = db.collection("users");

    let userId: ObjectId;
    try {
      userId = new ObjectId(auth.user._id);
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const record = await users.findOne({ _id: userId });
    if (!record) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!verifyPassword(currentPassword, record.password)) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 }
      );
    }

    await users.updateOne(
      { _id: userId },
      { $set: { password: hashPassword(newPassword), updatedAt: new Date() } }
    );

    // Any outstanding reset links are stale now that the password changed.
    await db.collection("password_resets").deleteMany({ userId });

    const response: MessageResponse = {
      message: "Your password has been updated.",
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
