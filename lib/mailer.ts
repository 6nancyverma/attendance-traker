/**
 * Outbound email over SMTP (Gmail by default).
 *
 * Required environment variables — see .env.example:
 *   SMTP_USER  your Gmail address
 *   SMTP_PASS  a Google *App Password* (NOT your normal account password)
 *   SMTP_FROM  optional display sender, defaults to SMTP_USER
 *
 * Gmail rejects plain account passwords over SMTP. Create an App Password at
 * https://myaccount.google.com/apppasswords (requires 2-Step Verification).
 *
 * When the variables are absent, delivery falls back to logging the message so
 * local development still works without credentials.
 */
import nodemailer, { type Transporter } from "nodemailer";

type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // 465 = implicit TLS, 587 = STARTTLS
      auth: { user, pass },
    });
  }
  return cachedTransporter;
}

function logInstead(email: Email, reason: string): void {
  // eslint-disable-next-line no-console
  console.warn(
    [
      "",
      "──────────────────────────────────────────────────────────────",
      ` EMAIL NOT SENT — ${reason}`,
      ` To:      ${email.to}`,
      ` Subject: ${email.subject}`,
      "",
      email.text,
      "──────────────────────────────────────────────────────────────",
      "",
    ].join("\n")
  );
}

async function deliver(email: Email): Promise<void> {
  const transporter = getTransporter();

  if (!transporter) {
    logInstead(email, "SMTP_USER / SMTP_PASS are not set (lib/mailer.ts)");
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

/**
 * Verifies the SMTP credentials without sending anything.
 * Used by the /api/auth/mail-check diagnostic route.
 */
export async function verifyMailer(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const transporter = getTransporter();
  if (!transporter) {
    return { ok: false, error: "SMTP_USER / SMTP_PASS are not set" };
  }
  try {
    await transporter.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  expiresInMinutes: number
): Promise<void> {
  const subject = "Reset your AttendanceApp password";

  const text = [
    "We received a request to reset your AttendanceApp password.",
    "",
    `Reset link (valid for ${expiresInMinutes} minutes, single use):`,
    resetUrl,
    "",
    "If you did not request this, you can safely ignore this email —",
    "your password will not change.",
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111827">
      <h1 style="font-size:20px;margin:0 0 16px">Reset your password</h1>
      <p style="font-size:14px;line-height:22px;margin:0 0 20px">
        We received a request to reset your AttendanceApp password. This link is
        valid for ${expiresInMinutes} minutes and can only be used once.
      </p>
      <p style="margin:0 0 24px">
        <a href="${resetUrl}"
           style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px">
          Reset password
        </a>
      </p>
      <p style="font-size:12px;line-height:20px;color:#6b7280;margin:0">
        If you did not request this, you can safely ignore this email — your
        password will not change.
      </p>
    </div>
  `;

  await deliver({ to, subject, html, text });
}
