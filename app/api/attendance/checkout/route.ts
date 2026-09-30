import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { toLocalDateKey } from "@/lib/date";
import { ObjectId } from "mongodb";
import { getStandardHours, normalizeSchedule } from "@/lib/work-schedule";
import { normalizeHolidays } from "@/lib/holidays";
import {
  computeHoursWorked,
  effectiveBreakMinutes,
  getOpenBreak,
  splitHoursForDate,
  type BreakEntry,
} from "@/lib/attendance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Check out for the day
export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (auth.response) return auth.response;
    const user = auth.user;

    const { db } = await connectToDatabase();
    const attendanceCollection = db.collection("attendance");

    const today = toLocalDateKey();
    const checkOutTime = new Date().toISOString();

    const record = await attendanceCollection.findOne({
      userId: user._id,
      date: today,
    });

    if (!record) {
      return NextResponse.json(
        { error: "No check-in record found for today" },
        { status: 400 }
      );
    }

    if (record.checkOutTime) {
      return NextResponse.json(
        { error: "Already checked out today" },
        { status: 400 }
      );
    }

    // Close any break still running, so it can't silently inflate the day.
    const breaks: BreakEntry[] = Array.isArray(record.breaks)
      ? (record.breaks as BreakEntry[])
      : [];
    const open = getOpenBreak(breaks);
    if (open) open.end = checkOutTime;

    // Overtime is measured against the user's own day length, not a fixed 8h,
    // and the standard break comes from the same schedule.
    let scheduleSource: unknown = null;
    let holidaysSource: unknown = null;
    try {
      const userRecord = await db
        .collection("users")
        .findOne(
          { _id: new ObjectId(user._id) },
          { projection: { workSchedule: 1, holidays: 1 } }
        );
      scheduleSource = userRecord?.workSchedule ?? null;
      holidaysSource = userRecord?.holidays ?? null;
    } catch {
      // Fall through to defaults — never block a check-out over settings.
    }
    const schedule = normalizeSchedule(scheduleSource);
    const holidays = normalizeHolidays(holidaysSource);

    // Hours worked is elapsed time minus the break deduction, not raw
    // check-out − check-in.
    const hoursWorked = computeHoursWorked(
      record.checkInTime,
      checkOutTime,
      breaks,
      schedule.breakMinutes
    );
    const breakMinutes = Math.round(
      effectiveBreakMinutes(breaks, schedule.breakMinutes)
    );
    // On a weekly off the expected hours are zero, so it is all overtime.
    const isOvertime =
      splitHoursForDate(hoursWorked, today, schedule, holidays).overtime > 0;

    await attendanceCollection.updateOne(
      { _id: record._id },
      {
        $set: {
          checkOutTime,
          hoursWorked: Math.round(hoursWorked * 100) / 100,
          isOvertime,
          breaks,
          breakMinutes,
        },
      }
    );

    return NextResponse.json({
      success: true,
      message: "Checked out successfully",
      checkOutTime,
      hoursWorked: Math.round(hoursWorked * 100) / 100,
      isOvertime,
      breakMinutes,
      standardHours: getStandardHours(schedule),
    });
  } catch (error) {
    console.error("Check out error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
