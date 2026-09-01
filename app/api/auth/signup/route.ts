import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { hashPassword, generateToken } from "@/lib/auth";
import type { SignupRequest, AuthResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = (await req.json()) as SignupRequest;

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "Email, password, and name are required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const usersCollection = db.collection("users");

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return NextResponse.json({ error: "User already exists" }, { status: 400 });
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
