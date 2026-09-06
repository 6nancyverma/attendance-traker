import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import {
  countWorkingDaysElapsed,
  getDateRange,
  toLocalDateKey,
} from "@/lib/date";
import { ObjectId } from "mongodb";
import { getStandardHours, normalizeSchedule } from "@/lib/work-schedule";
import { normalizeHolidays } from "@/lib/holidays";
import { splitHours, standardHoursForDate } from "@/lib/attendance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Get attendance stats
export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (auth.response) return auth.response;
    const user = auth.user;

    const { db } = await connectToDatabase();
    const attendanceCollection = db.collection("attendance");

    const { searchParams } = new URL(req.url);
    const year = searchParams.get("year")
      ? parseInt(searchParams.get("year") as string)
      : new Date().getFullYear();
    const month = searchParams.get("month")
      ? parseInt(searchParams.get("month") as string)
      : undefined;

    const { startDate, endDate } = getDateRange(year, month);
    const query: Record<string, unknown> = {
      userId: user._id,
      date: { $gte: startDate, $lte: endDate },
    };

    const records = await attendanceCollection.find(query).toArray();

    // A record only exists once you check in, so "absent" is never stored —
    // it is derived: working days already elapsed that have no record at all.
    let scheduleSource: unknown = null;
    let holidaysSource: unknown = null;
    let userCreatedAt: Date | null = null;
    try {
      const userRecord = await db
        .collection("users")
        .findOne(
          { _id: new ObjectId(user._id) },
          { projection: { workSchedule: 1, holidays: 1, createdAt: 1 } },
        );
      scheduleSource = userRecord?.workSchedule ?? null;
      holidaysSource = userRecord?.holidays ?? null;
      userCreatedAt = userRecord?.createdAt ?? null;
    } catch {
      // Fall through to defaults.
    }
    const schedule = normalizeSchedule(scheduleSource);
    const holidays = normalizeHolidays(holidaysSource);

    // Days marked leave/sick/holiday are neither worked nor absent — they are
    // accounted for, so they must not inflate the absence count.
    const leaveRecords = records.filter(
      (r) => r.dayType && r.dayType !== "work" && r.dayType !== "wfh",
    );
    const totalLeave = leaveRecords.length;

    let effectiveStartDate = startDate;
    if (userCreatedAt) {
      const createdAtStr = toLocalDateKey(userCreatedAt);
      if (createdAtStr > effectiveStartDate) {
        effectiveStartDate = createdAtStr;
      }
    }

    const daysAttended = new Set(records.map((r) => r.date)).size;
    const workingDaysElapsed = countWorkingDaysElapsed(
      effectiveStartDate,
      endDate,
      new Date(),
      schedule.workingDays,
      holidays.map((h) => h.date),
    );
    const totalAbsent = Math.max(0, workingDaysElapsed - daysAttended);

    const withHours = records.filter((r) => typeof r.hoursWorked === "number");
    const totalHoursWorked = withHours.reduce(
      (sum, r) => sum + (r.hoursWorked || 0),
      0,
    );

    // Overtime hours: whatever each day ran past its expected length (all of
    // it on weekly offs and holidays), the same split the history page shows.
    const totalOvertimeHours = withHours.reduce(
      (sum, r) =>
        sum +
        splitHours(
          r.hoursWorked || 0,
          standardHoursForDate(r.date, schedule, holidays),
        ).overtime,
      0,
    );

    const stats = {
      totalPresent: records.filter((r) => r.status === "present").length,
      totalAbsent,
      totalLate: records.filter((r) => r.status === "late").length,
      totalOvertime: records.filter((r) => r.isOvertime).length,
      // Averaged over days that were actually completed (checked out), so an
      // in-progress day doesn't drag the average toward zero.
      averageHoursWorked: withHours.length
        ? totalHoursWorked / withHours.length
        : 0,
      totalHoursWorked: Math.round(totalHoursWorked * 100) / 100,
      totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
      totalLeave,
      totalBreakMinutes: Math.round(
        records.reduce((sum, r) => sum + (r.breakMinutes || 0), 0),
      ),
      workingDaysElapsed,
      daysAttended,
      standardHours: getStandardHours(schedule),
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Get attendance stats error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
