import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import {
  isValidTime,
  MAX_BREAK_MINUTES,
  normalizeSchedule,
  type WorkSchedule,
} from "@/lib/work-schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toObjectId(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

/** GET /api/settings/schedule — the caller's work schedule (defaults if unset). */
export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (auth.response) return auth.response;

    const userId = toObjectId(auth.user._id);
    if (!userId) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const record = await db
      .collection("users")
      .findOne({ _id: userId }, { projection: { workSchedule: 1 } });

    if (!record) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(normalizeSchedule(record.workSchedule));
  } catch (error) {
    console.error("Get schedule error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** PUT /api/settings/schedule — replace the caller's work schedule. */
export async function PUT(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (auth.response) return auth.response;

    const userId = toObjectId(auth.user._id);
    if (!userId) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = (await req.json()) as Partial<WorkSchedule>;

    // Validate explicitly rather than leaning on normalizeSchedule, so a typo
    // is reported instead of being silently replaced by a default.
    if (!body.startTime || !isValidTime(body.startTime)) {
      return NextResponse.json(
        { error: "startTime must be in 24-hour HH:MM format" },
        { status: 400 }
      );
    }
    if (!body.endTime || !isValidTime(body.endTime)) {
      return NextResponse.json(
        { error: "endTime must be in 24-hour HH:MM format" },
        { status: 400 }
      );
    }
    if (body.startTime === body.endTime) {
      return NextResponse.json(
        { error: "Start and end time cannot be the same" },
        { status: 400 }
      );
    }
    if (
      body.graceMinutes !== undefined &&
      (!Number.isFinite(body.graceMinutes) ||
        body.graceMinutes < 0 ||
        body.graceMinutes > 240)
    ) {
      return NextResponse.json(
        { error: "graceMinutes must be between 0 and 240" },
        { status: 400 }
      );
    }
    if (
      body.breakMinutes !== undefined &&
      (!Number.isFinite(body.breakMinutes) ||
        body.breakMinutes < 0 ||
        body.breakMinutes > MAX_BREAK_MINUTES)
    ) {
      return NextResponse.json(
        { error: `breakMinutes must be between 0 and ${MAX_BREAK_MINUTES}` },
        { status: 400 }
      );
    }
    if (
      body.workingDays !== undefined &&
      (!Array.isArray(body.workingDays) ||
        body.workingDays.length === 0 ||
        !body.workingDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))
    ) {
      return NextResponse.json(
        { error: "Select at least one working day" },
        { status: 400 }
      );
    }

    const schedule = normalizeSchedule(body);

    const { db } = await connectToDatabase();
    const result = await db
      .collection("users")
      .updateOne(
        { _id: userId },
        { $set: { workSchedule: schedule, updatedAt: new Date() } }
      );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(schedule);
  } catch (error) {
    console.error("Update schedule error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
