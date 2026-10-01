import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { getDateRange, istYearMonth } from "@/lib/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Get attendance history
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
      : istYearMonth().year;
    const month = searchParams.get("month")
      ? parseInt(searchParams.get("month") as string)
      : undefined;

    const { startDate, endDate } = getDateRange(year, month);
    const query: Record<string, unknown> = {
      userId: user._id,
      date: { $gte: startDate, $lte: endDate },
    };

    const records = await attendanceCollection
      .find(query)
      .sort({ date: -1 })
      .toArray();

    return NextResponse.json(records);
  } catch (error) {
    console.error("Get attendance history error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
