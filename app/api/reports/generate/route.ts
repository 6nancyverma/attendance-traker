import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { getDateRange, toLocalDateKey } from "@/lib/date";
import { getStandardHours, normalizeSchedule } from "@/lib/work-schedule";
import { findHoliday, normalizeHolidays } from "@/lib/holidays";
import {
  DAY_TYPE_LABELS,
  isWeeklyOff,
  splitHours,
  standardHoursForDate,
  type DayType,
} from "@/lib/attendance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Wrap a CSV cell, escaping quotes/commas/newlines per RFC 4180. */
function csvCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Decimal hours → "H:MM" so the sheet reads the way people think ("8:30",
 * not "8.5"). Spreadsheets parse this as a time and can sum it with an
 * [h]:mm cell format.
 */
function formatHoursCell(hours: number | undefined): string {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) {
    return "";
  }
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function weekdayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { weekday: "short" });
}

/**
 * GET /api/reports/generate?year=YYYY&type=monthly|yearly[&month=M]
 * Returns the user's attendance as a downloadable CSV file, laid out like the
 * history page: one row per calendar day up to today, with working hours,
 * overtime hours and total hours split out, then a summary.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (auth.response) return auth.response;
    const user = auth.user;

    const { searchParams } = new URL(req.url);
    const year = searchParams.get("year");
    const type = searchParams.get("type");
    const month = searchParams.get("month");

    if (!year || !type) {
      return NextResponse.json(
        { error: "Year and type are required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const attendanceCollection = db.collection("attendance");

    const yearNum = parseInt(year);
    const monthNum = month ? parseInt(month) : undefined;

    // Local calendar bounds (the old UTC conversion shifted the range by a day
    // for anyone east of UTC).
    const { startDate, endDate } =
      type === "monthly" && monthNum
        ? getDateRange(yearNum, monthNum)
        : getDateRange(yearNum);

    const records = await attendanceCollection
      .find({ userId: user._id, date: { $gte: startDate, $lte: endDate } })
      .sort({ date: 1 })
      .toArray();

    // The user's schedule and holiday list decide the working/overtime split
    // and which days are paid days off.
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
      // Defaults still produce a sensible report.
    }
    const schedule = normalizeSchedule(scheduleSource);
    const holidays = normalizeHolidays(holidaysSource);

    const header = [
      "Date",
      "Day",
      "Check In",
      "Check Out",
      "Break (min)",
      "Working Hours",
      "Overtime Hours",
      "Total Hours",
      "Status",
      "Note",
    ];

    const byDate = new Map(records.map((r) => [r.date as string, r]));
    const todayKey = toLocalDateKey();
    const lastDay = endDate < todayKey ? endDate : todayKey;

    const rows: unknown[][] = [];
    let workedDays = 0;
    let offDays = 0;
    let leaveDays = 0;
    let lateDays = 0;
    let overtimeDays = 0;
    let totalRegular = 0;
    let totalOvertime = 0;
    let totalHours = 0;
    let totalBreak = 0;

    // One row per calendar day so Sundays and holidays show up as paid days
    // rather than silently missing, exactly like the history page.
    for (
      const cursor = new Date(`${startDate}T00:00:00`);
      toLocalDateKey(cursor) <= lastDay;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      const dateKey = toLocalDateKey(cursor);
      const record = byDate.get(dateKey);
      const holiday = findHoliday(dateKey, holidays);
      const weeklyOff = isWeeklyOff(dateKey, schedule);
      const offLabel = holiday
        ? `Holiday - ${holiday.name}`
        : weeklyOff
          ? "Weekly off"
          : "";

      if (!record) {
        if (!offLabel) continue; // a working day with nothing recorded
        offDays += 1;
        rows.push([dateKey, weekdayLabel(dateKey), "", "", "", "", "", "", offLabel, ""]);
        continue;
      }

      const dayType = (record.dayType as DayType | undefined) ?? "work";
      const isMarkedOff = dayType !== "work" && dayType !== "wfh";
      const hours =
        typeof record.hoursWorked === "number" ? record.hoursWorked : undefined;
      const split =
        hours !== undefined
          ? splitHours(hours, standardHoursForDate(dateKey, schedule, holidays))
          : null;

      let status: string;
      if (isMarkedOff) {
        status = DAY_TYPE_LABELS[dayType];
        leaveDays += 1;
      } else if (record.checkInTime && !record.checkOutTime) {
        status = "No check-out";
        workedDays += 1;
      } else if (record.checkInTime) {
        status = record.status === "late" ? "Late" : "Present";
        if (offLabel) status += ` (${offLabel.toLowerCase()})`;
        workedDays += 1;
      } else if (offLabel) {
        status = offLabel;
        offDays += 1;
      } else {
        status = "Absent";
      }

      if (record.status === "late") lateDays += 1;
      if (record.isOvertime) overtimeDays += 1;
      if (split) {
        totalRegular += split.regular;
        totalOvertime += split.overtime;
        totalHours += hours as number;
        totalBreak += record.breakMinutes || 0;
      }

      rows.push([
        dateKey,
        weekdayLabel(dateKey),
        formatTime(record.checkInTime),
        formatTime(record.checkOutTime),
        split ? record.breakMinutes ?? 0 : "",
        formatHoursCell(split?.regular),
        formatHoursCell(split?.overtime),
        formatHoursCell(hours),
        status,
        record.note ?? "",
      ]);
    }

    const summary: unknown[][] = [
      [],
      ["Summary"],
      ["Paid Days", workedDays + offDays + leaveDays],
      ["Days Worked", workedDays],
      ["Weekly Offs / Holidays", offDays],
      ["Leave", leaveDays],
      ["Late Days", lateDays],
      ["Overtime Days", overtimeDays],
      ["Standard Day (hours)", formatHoursCell(getStandardHours(schedule))],
      ["Break (min)", totalBreak],
      ["Working Hours", formatHoursCell(totalRegular)],
      ["Overtime Hours", formatHoursCell(totalOvertime)],
      ["Total Hours", formatHoursCell(totalHours)],
    ];

    const csv = [header, ...rows, ...summary]
      .map((row) => row.map(csvCell).join(","))
      .join("\n");

    const filename =
      type === "monthly" && monthNum
        ? `attendance-report-${yearNum}-${monthNum}.csv`
        : `attendance-report-${yearNum}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error generating report:", error);
    return NextResponse.json(
      {
        error: "Failed to generate report",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
