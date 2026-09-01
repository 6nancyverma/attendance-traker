import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { generateResetToken, hashResetToken } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/mailer";
import type { ForgotPasswordRequest, MessageResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_TTL_MINUTES = 60;

/**
 * When true, an unknown email gets an explicit "no account found" 404.
 *
 * Trade-off: this lets anyone probe the endpoint to discover which addresses
 * are registered (account enumeration). Acceptable for a small internal tool,
 * but flip to `false` before exposing this publicly — the flow works either
 * way, only the response for unknown addresses changes.
 */
const REVEAL_UNKNOWN_ACCOUNTS = true;

const SUCCESS_RESPONSE: MessageResponse = {
  message: "A password reset link has been sent to your email.",
};

/** Used when REVEAL_UNKNOWN_ACCOUNTS is false — identical for every address. */
const GENERIC_RESPONSE: MessageResponse = {
  message:
    "If an account exists for that email, a password reset link has been sent.",
};

function resolveBaseUrl(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  return req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  try {
    const { email } = (await req.json()) as ForgotPasswordRequest;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Matched verbatim (bar surrounding whitespace) because signup stores the
    // address as typed and login compares it exactly — lowercasing here would
    // silently fail for anyone who signed up with capitals.
    const lookupEmail = email.trim();

    const { db } = await connectToDatabase();
    const user = await db.collection("users").findOne({ email: lookupEmail });

    if (!user) {
      if (REVEAL_UNKNOWN_ACCOUNTS) {
        return NextResponse.json(
          { error: "No account found with that email address." },
          { status: 404 }
        );
      }
      // Enumeration-safe mode: stop here, but still report success.
      return NextResponse.json(GENERIC_RESPONSE);
    }

    const resets = db.collection("password_resets");

    // Requesting a new link invalidates any earlier outstanding ones.
    await resets.deleteMany({ userId: user._id });

    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

    await resets.insertOne({
      userId: user._id,
      email: lookupEmail,
      tokenHash: hashResetToken(token),
      expiresAt,
      createdAt: new Date(),
    });

    const resetUrl = `${resolveBaseUrl(req)}/reset-password?token=${token}`;

    try {
      await sendPasswordResetEmail(lookupEmail, resetUrl, TOKEN_TTL_MINUTES);
    } catch (mailError) {
      console.error("Failed to send password reset email:", mailError);

      if (REVEAL_UNKNOWN_ACCOUNTS) {
        // Already revealing account existence, so there is nothing to protect
        // by pretending this succeeded — a silent "sent!" is just confusing.
        return NextResponse.json(
          {
            error:
              "We couldn't send the reset email. Please check the mail settings and try again.",
          },
          { status: 502 }
        );
      }
      // Enumeration-safe mode: never let delivery state leak to the caller.
    }

    return NextResponse.json(
      REVEAL_UNKNOWN_ACCOUNTS ? SUCCESS_RESPONSE : GENERIC_RESPONSE
    );
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
