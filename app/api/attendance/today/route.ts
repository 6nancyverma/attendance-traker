import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { toLocalDateKey } from "@/lib/date";

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

    if (!record) {
      return NextResponse.json({
        date: today,
        checkInTime: null,
        checkOutTime: null,
        status: "absent",
        hoursWorked: 0,
      });
    }

    return NextResponse.json({
      date: record.date,
      checkInTime: record.checkInTime,
      checkOutTime: record.checkOutTime,
      status: record.status,
      hoursWorked: record.hoursWorked || 0,
    });
  } catch (error) {
    console.error("Get today attendance error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
