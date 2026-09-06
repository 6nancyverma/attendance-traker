import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

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
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US");
}

/**
 * GET /api/reports/generate?year=YYYY&type=monthly|yearly[&month=M]
 * Returns the user's attendance as a downloadable CSV file.
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

    const query: Record<string, unknown> = { userId: user._id };

    if (type === "monthly" && monthNum) {
      const startDate = new Date(yearNum, monthNum - 1, 1)
        .toISOString()
        .split("T")[0];
      const endDate = new Date(yearNum, monthNum, 0).toISOString().split("T")[0];
      query.date = { $gte: startDate, $lte: endDate };
    } else {
      const startDate = new Date(yearNum, 0, 1).toISOString().split("T")[0];
      const endDate = new Date(yearNum, 11, 31).toISOString().split("T")[0];
      query.date = { $gte: startDate, $lte: endDate };
    }

    const records = await attendanceCollection
      .find(query)
      .sort({ date: 1 })
      .toArray();

    // Build CSV
    const header = [
      "Date",
      "Check In",
      "Check Out",
      "Break (min)",
      "Hours Worked",
      "Status",
      "Overtime",
    ];

    const rows = records.map((r) => [
      r.date ?? "",
      formatTime(r.checkInTime),
      formatTime(r.checkOutTime),
      r.breakMinutes ?? 0,
      r.hoursWorked ?? 0,
      r.status ?? "",
      r.isOvertime ? "Yes" : "No",
    ]);

    // Summary totals appended to the bottom of the report.
    const totalHours = records.reduce(
      (sum, r) => sum + (r.hoursWorked || 0),
      0
    );
    const summary = [
      [],
      ["Summary"],
      ["Total Days", String(records.length)],
      [
        "Present",
        String(records.filter((r) => r.status === "present").length),
      ],
      ["Late", String(records.filter((r) => r.status === "late").length)],
      ["Absent", String(records.filter((r) => r.status === "absent").length)],
      ["Overtime Days", String(records.filter((r) => r.isOvertime).length)],
      ["Total Hours", String(Math.round(totalHours * 100) / 100)],
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
