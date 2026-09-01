import { NextResponse } from "next/server";
import { verifyMailer } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Development-only diagnostic: confirms the SMTP credentials can authenticate,
 * without sending an email or touching the database.
 *
 *   curl http://localhost:3000/api/auth/mail-check
 *
 * Hidden in production because the response reveals configuration state.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await verifyMailer();

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        hint: "Set SMTP_USER and SMTP_PASS in .env.local, then restart the dev server. SMTP_PASS must be a Google App Password, not your account password.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "SMTP credentials verified — password reset emails will be sent.",
  });
}
