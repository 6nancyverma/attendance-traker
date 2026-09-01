import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { toLocalDateKey } from "@/lib/date";
import { ObjectId } from "mongodb";
import { isLateArrival, normalizeSchedule } from "@/lib/work-schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Check in for the day
export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (auth.response) return auth.response;
    const user = auth.user;

    const { db } = await connectToDatabase();
    const attendanceCollection = db.collection("attendance");

    const now = new Date();
    const today = toLocalDateKey(now);
    const checkInTime = now.toISOString();

    // Check if already checked in today
    const existing = await attendanceCollection.findOne({
      userId: user._id,
      date: today,
    });

    if (existing && existing.checkInTime) {
      return NextResponse.json(
        { error: "Already checked in today" },
        { status: 400 }
      );
    }

    // "Late" comes from the user's own schedule, not a hardcoded 9 AM.
    let scheduleSource: unknown = null;
    try {
      const userRecord = await db
        .collection("users")
        .findOne(
          { _id: new ObjectId(user._id) },
          { projection: { workSchedule: 1 } }
        );
      scheduleSource = userRecord?.workSchedule ?? null;
    } catch {
      // Fall through to defaults — never block a check-in over settings.
    }
    const schedule = normalizeSchedule(scheduleSource);
    const isLate = isLateArrival(new Date(checkInTime), schedule);

    if (existing) {
      // Update existing record with check-in
      await attendanceCollection.updateOne(
        { _id: existing._id },
        {
          $set: {
            checkInTime,
            status: isLate ? "late" : "present",
          },
        }
      );
    } else {
      // Create new record
      await attendanceCollection.insertOne({
        userId: user._id,
        date: today,
        checkInTime,
        status: isLate ? "late" : "present",
      });
    }

    return NextResponse.json({
      success: true,
      message: "Checked in successfully",
      checkInTime,
      isLate,
      expectedStartTime: schedule.startTime,
      graceMinutes: schedule.graceMinutes,
    });
  } catch (error) {
    console.error("Check in error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
