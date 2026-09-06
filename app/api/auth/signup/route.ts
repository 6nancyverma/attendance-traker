import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { hashPassword, generateToken } from "@/lib/auth";
import { isValidEmail, normalizeEmail } from "@/lib/email";
import { findUserByEmail } from "@/lib/users";
import type { SignupRequest, AuthResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SignupRequest;
    const password = body.password;
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!body.email || !password || !name) {
      return NextResponse.json(
        { error: "Email, password, and name are required" },
        { status: 400 }
      );
    }

    // Stored in canonical form so every later lookup is an exact match.
    const email = normalizeEmail(String(body.email));
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const usersCollection = db.collection("users");

    // Check if user already exists (ignoring case)
    const existingUser = await findUserByEmail(db, email);
    if (existingUser) {
      return NextResponse.json(
        {
          error:
            "An account with this email already exists. Sign in instead, or use “Forgot password?”.",
        },
        { status: 400 }
      );
    }

    // Create new user
    const hashedPassword = hashPassword(password);
    const result = await usersCollection.insertOne({
      email,
      password: hashedPassword,
      name,
      role: "employee",
      createdAt: new Date(),
    });

    const user = {
      _id: result.insertedId.toString(),
      email,
      name,
      role: "employee" as const,
    };

    const token = generateToken(user);

    const response: AuthResponse = { token, user };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
