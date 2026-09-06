import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { generateToken, verifyPassword } from "@/lib/auth";
import { isValidEmail, normalizeEmail } from "@/lib/email";
import { findUserByEmail } from "@/lib/users";
import type { AuthResponse, UserPayload } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Not exported: Next only allows route handlers and config as route exports.
const MAX_NAME_LENGTH = 80;

interface UpdateProfileBody {
  name?: string;
  email?: string;
  /** Required only when the email is changing. */
  currentPassword?: string;
}

/**
 * PUT /api/settings/profile  { name, email, currentPassword? }
 *
 * Renames the account and/or changes its email. The name and email live
 * inside the JWT too, so a fresh token is returned and the client must store
 * it — otherwise the old name keeps showing until the next login.
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (auth.response) return auth.response;

    let userId: ObjectId;
    try {
      userId = new ObjectId(auth.user._id);
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = (await req.json()) as UpdateProfileBody;

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` },
        { status: 400 }
      );
    }

    const email =
      typeof body.email === "string" ? normalizeEmail(body.email) : "";
    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const users = db.collection("users");

    const current = await users.findOne({ _id: userId });
    if (!current) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const emailChanged = normalizeEmail(current.email) !== email;
    if (emailChanged) {
      // Changing the login identity needs the password, so a forgotten
      // unlocked screen can't hijack the account.
      if (!body.currentPassword) {
        return NextResponse.json(
          { error: "Enter your current password to change your email" },
          { status: 400 }
        );
      }
      if (!verifyPassword(body.currentPassword, current.password)) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 401 }
        );
      }
      const taken = await findUserByEmail(db, email);
      if (taken && !taken._id.equals(userId)) {
        return NextResponse.json(
          { error: "That email is already used by another account" },
          { status: 400 }
        );
      }
    }

    await users.updateOne(
      { _id: userId },
      { $set: { name, email, updatedAt: new Date() } }
    );

    const userPayload: UserPayload = {
      _id: userId.toString(),
      email,
      name,
      role: current.role,
    };
    const response: AuthResponse = {
      token: generateToken(userPayload),
      user: userPayload,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
