import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Read PING_MESSAGE at request time rather than baking it in at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  const ping = process.env.PING_MESSAGE ?? "ping";
  return NextResponse.json({ message: ping });
}
