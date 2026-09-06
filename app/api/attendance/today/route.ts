import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { toLocalDateKey } from "@/lib/date";
import { ObjectId } from "mongodb";
import { normalizeSchedule } from "@/lib/work-schedule";
import { isWeeklyOff } from "@/lib/attendance";
import { findHoliday, normalizeHolidays } from "@/lib/holidays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Get today's attendance
export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (auth.response) return auth.response;
    const user = auth.user;

    const { db } = await connectToDatabase();
    const attendanceCollection = db.collection("attendance");

    const today = toLocalDateKey();
    const record = await attendanceCollection.findOne({
      userId: user._id,
      date: today,
    });

    // Is today one of the user's working days? Sundays (or whatever is not
    // in workingDays) are weekly offs and shouldn't read as "absent".
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
      // Defaults are fine for a label.
    }
    const weeklyOff = isWeeklyOff(today, normalizeSchedule(scheduleSource));
    const holiday = findHoliday(today, normalizeHolidays(holidaysSource));

    if (!record) {
      return NextResponse.json({
        date: today,
        checkInTime: null,
        checkOutTime: null,
        status: "absent",
        hoursWorked: 0,
        weeklyOff,
        holiday: holiday?.name ?? null,
      });
    }

    return NextResponse.json({
      date: record.date,
      checkInTime: record.checkInTime,
      checkOutTime: record.checkOutTime,
      status: record.status,
      hoursWorked: record.hoursWorked || 0,
      breaks: record.breaks,
      breakMinutes: record.breakMinutes,
      weeklyOff,
      holiday: holiday?.name ?? null,
    });
  } catch (error) {
    console.error("Get today attendance error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
