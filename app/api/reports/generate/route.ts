import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import {
  APP_TIME_ZONE_LABEL,
  addDays,
  formatDateKey,
  formatIstDateTime,
  formatIstTime,
  getDateRange,
  toLocalDateKey,
} from "@/lib/date";
import {
  DAY_LABELS,
  formatTimeLabel,
  getStandardHours,
  normalizeSchedule,
} from "@/lib/work-schedule";
import { findHoliday, normalizeHolidays } from "@/lib/holidays";
import {
  DAY_TYPE_LABELS,
  isWeeklyOff,
  splitHoursForDate,
  type DayType,
} from "@/lib/attendance";
import type {
  ReportData,
  ReportMonth,
  ReportRow,
  ReportTotals,
} from "@/types/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const round2 = (n: number) => Math.round(n * 100) / 100;

function emptyTotals(): ReportTotals {
  return {
    paidDays: 0,
    workedDays: 0,
    offDays: 0,
    leaveDays: 0,
    lateDays: 0,
    overtimeDays: 0,
    breakMinutes: 0,
    regularHours: 0,
    overtimeHours: 0,
    totalHours: 0,
  };
}

/** Fold one row into running totals. */
function addRow(totals: ReportTotals, row: ReportRow) {
  if (row.kind === "off") totals.offDays += 1;
  else if (row.kind === "leave") totals.leaveDays += 1;
  else if (row.kind !== "absent") totals.workedDays += 1;
  if (row.kind === "late") totals.lateDays += 1;
  if ((row.overtime ?? 0) > 0) totals.overtimeDays += 1;
  totals.breakMinutes += row.breakMinutes ?? 0;
  totals.regularHours += row.regular ?? 0;
  totals.overtimeHours += row.overtime ?? 0;
  totals.totalHours += row.total ?? 0;
  totals.paidDays = totals.workedDays + totals.offDays + totals.leaveDays;
}

function finishTotals<T extends ReportTotals>(totals: T): T {
  totals.regularHours = round2(totals.regularHours);
  totals.overtimeHours = round2(totals.overtimeHours);
  totals.totalHours = round2(totals.totalHours);
  return totals;
}

/**
 * GET /api/reports/generate?year=YYYY&type=monthly|yearly[&month=M]
 *
 * Returns the user's attendance as JSON, laid out like the history page: one
 * row per calendar day up to today (IST), with working, overtime and total
 * hours split out, plus totals and — for yearly reports — a month-by-month
 * breakdown. The browser turns it into a PDF.
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

    if (!year || (type !== "monthly" && type !== "yearly")) {
      return NextResponse.json(
        { error: "Year and type (monthly or yearly) are required" },
        { status: 400 }
      );
    }

    const yearNum = parseInt(year);
    const monthNum = month ? parseInt(month) : undefined;
    if (
      !Number.isInteger(yearNum) ||
      (type === "monthly" &&
        (!monthNum || !Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12))
    ) {
      return NextResponse.json(
        { error: "Invalid year or month" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const { startDate, endDate } =
      type === "monthly"
        ? getDateRange(yearNum, monthNum)
        : getDateRange(yearNum);

    const records = await db
      .collection("attendance")
      .find({ userId: user._id, date: { $gte: startDate, $lte: endDate } })
      .sort({ date: 1 })
      .toArray();

    // The user's schedule and holiday list decide the working/overtime split
    // and which days are paid days off.
    let userRecord: Record<string, unknown> | null = null;
    try {
      userRecord = await db
        .collection("users")
        .findOne(
          { _id: new ObjectId(user._id) },
          {
            projection: {
              name: 1,
              email: 1,
              avatar: 1,
              workSchedule: 1,
              holidays: 1,
            },
          }
        );
    } catch {
      // Defaults still produce a sensible report.
    }
    const schedule = normalizeSchedule(userRecord?.workSchedule ?? null);
    const holidays = normalizeHolidays(userRecord?.holidays ?? null);

    const byDate = new Map(records.map((r) => [r.date as string, r]));
    const todayKey = toLocalDateKey();
    const lastDay = endDate < todayKey ? endDate : todayKey;

    const rows: ReportRow[] = [];

    // One row per calendar day so Sundays and holidays show up as paid days
    // rather than silently missing, exactly like the history page.
    for (let dateKey = startDate; dateKey <= lastDay; dateKey = addDays(dateKey, 1)) {
      const record = byDate.get(dateKey);
      const holiday = findHoliday(dateKey, holidays);
      const weeklyOff = isWeeklyOff(dateKey, schedule);
      const offLabel = holiday
        ? `Holiday - ${holiday.name}`
        : weeklyOff
          ? "Weekly off"
          : "";
      const day = formatDateKey(dateKey, { weekday: "short" });

      const blank = {
        date: dateKey,
        day,
        checkIn: "",
        checkOut: "",
        breakMinutes: null,
        regular: null,
        overtime: null,
        total: null,
        note: "",
      };

      if (!record) {
        if (!offLabel) continue; // a working day with nothing recorded
        rows.push({ ...blank, status: offLabel, kind: "off" });
        continue;
      }

      const dayType = (record.dayType as DayType | undefined) ?? "work";
      const isMarkedOff = dayType !== "work" && dayType !== "wfh";
      const hours =
        typeof record.hoursWorked === "number" ? record.hoursWorked : undefined;
      const split =
        hours !== undefined
          ? splitHoursForDate(hours, dateKey, schedule, holidays)
          : null;

      let status: string;
      let kind: ReportRow["kind"];
      if (isMarkedOff) {
        status = DAY_TYPE_LABELS[dayType];
        kind = "leave";
      } else if (record.checkInTime && !record.checkOutTime) {
        status = "No check-out";
        kind = "open";
      } else if (record.checkInTime) {
        const late = record.status === "late";
        status = late ? "Late" : "Present";
        if (dayType === "wfh") status += " (WFH)";
        if (offLabel) status += ` (${offLabel.toLowerCase()})`;
        kind = late ? "late" : "present";
      } else if (offLabel) {
        status = offLabel;
        kind = "off";
      } else {
        status = "Absent";
        kind = "absent";
      }

      rows.push({
        ...blank,
        checkIn: formatIstTime(record.checkInTime),
        checkOut: formatIstTime(record.checkOutTime),
        breakMinutes: split ? Math.round(record.breakMinutes ?? 0) : null,
        regular: split && split.regular > 0 ? split.regular : null,
        overtime: split && split.overtime > 0 ? split.overtime : null,
        total: split && hours! > 0 ? hours! : null,
        status,
        kind,
        note: (record.note as string) ?? "",
      });
    }

    const totals = emptyTotals();
    const monthTotals = new Map<number, ReportMonth>();
    for (const row of rows) {
      addRow(totals, row);
      if (type === "yearly") {
        const m = parseInt(row.date.slice(5, 7));
        if (!monthTotals.has(m)) {
          monthTotals.set(m, { ...emptyTotals(), month: m, label: MONTH_NAMES[m - 1] });
        }
        addRow(monthTotals.get(m)!, row);
      }
    }

    const data: ReportData = {
      type,
      year: yearNum,
      month: type === "monthly" ? monthNum! : null,
      periodLabel:
        type === "monthly"
          ? `${MONTH_NAMES[monthNum! - 1]} ${yearNum}`
          : String(yearNum),
      startDate,
      endDate,
      user: {
        name: (userRecord?.name as string) || "",
        email: (userRecord?.email as string) || "",
        avatar: (userRecord?.avatar as string) || null,
      },
      schedule: {
        start: formatTimeLabel(schedule.startTime),
        end: formatTimeLabel(schedule.endTime),
        standardHours: getStandardHours(schedule),
        breakMinutes: schedule.breakMinutes,
        workingDays: schedule.workingDays.map((d) => DAY_LABELS[d].slice(0, 3)),
      },
      rows,
      totals: finishTotals(totals),
      months: Array.from(monthTotals.values())
        .sort((a, b) => a.month - b.month)
        .map(finishTotals),
      generatedAt: formatIstDateTime(),
      timeZone: `${APP_TIME_ZONE_LABEL} (UTC+05:30)`,
    };

    return NextResponse.json(data);
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
