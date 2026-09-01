import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { toLocalDateKey } from "@/lib/date";
import {
  getOpenBreak,
  totalBreakMinutes,
  type BreakEntry,
} from "@/lib/attendance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/attendance/break  { action: "start" | "end" }
 *
 * Breaks are stored on today's attendance record. Only one may be open at a
 * time, and hours worked are recalculated net of them at check-out.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (auth.response) return auth.response;
    const user = auth.user;

    const { action } = (await req.json()) as { action?: string };
    if (action !== "start" && action !== "end") {
      return NextResponse.json(
        { error: 'action must be "start" or "end"' },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const attendance = db.collection("attendance");

    const today = toLocalDateKey();
    const record = await attendance.findOne({ userId: user._id, date: today });

    if (!record || !record.checkInTime) {
      return NextResponse.json(
        { error: "Check in before taking a break" },
        { status: 400 }
      );
    }
    if (record.checkOutTime) {
      return NextResponse.json(
        { error: "You have already checked out for today" },
        { status: 400 }
      );
    }

    const breaks: BreakEntry[] = Array.isArray(record.breaks)
      ? (record.breaks as BreakEntry[])
      : [];
    const open = getOpenBreak(breaks);
    const now = new Date().toISOString();

    if (action === "start") {
      if (open) {
        return NextResponse.json(
          { error: "A break is already in progress" },
          { status: 400 }
        );
      }
      breaks.push({ start: now });
    } else {
      if (!open) {
        return NextResponse.json(
          { error: "No break is in progress" },
          { status: 400 }
        );
      }
      open.end = now;
    }

    await attendance.updateOne({ _id: record._id }, { $set: { breaks } });

    return NextResponse.json({
      success: true,
      message: action === "start" ? "Break started" : "Break ended",
      breaks,
      onBreak: action === "start",
      breakMinutes: Math.round(totalBreakMinutes(breaks)),
    });
  } catch (error) {
    console.error("Break error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
