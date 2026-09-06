import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { verifyPassword, generateToken } from "@/lib/auth";
import { findUserByEmail } from "@/lib/users";
import type { LoginRequest, AuthResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = (await req.json()) as LoginRequest;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    // Case-insensitive, so "Nancy@x.com" typed on a phone still finds the
    // account that signed up as "nancy@x.com".
    const user = await findUserByEmail(db, email);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Verify password
    if (!verifyPassword(password, user.password)) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const userPayload = {
      _id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = generateToken(userPayload);

    const response: AuthResponse = { token, user: userPayload };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
