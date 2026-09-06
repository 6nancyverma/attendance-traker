import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import {
  isValidHolidayDate,
  MAX_HOLIDAYS,
  MAX_HOLIDAY_NAME,
  normalizeHolidays,
  type Holiday,
} from "@/lib/holidays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toObjectId(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

/** GET /api/settings/holidays — the caller's holiday list, date-sorted. */
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
      .findOne({ _id: userId }, { projection: { holidays: 1 } });

    if (!record) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(normalizeHolidays(record.holidays));
  } catch (error) {
    console.error("Get holidays error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** PUT /api/settings/holidays  { holidays: [{ date, name }] } — replace the list. */
export async function PUT(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (auth.response) return auth.response;

    const userId = toObjectId(auth.user._id);
    if (!userId) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = (await req.json()) as { holidays?: unknown };
    if (!Array.isArray(body.holidays)) {
      return NextResponse.json(
        { error: "holidays must be a list" },
        { status: 400 }
      );
    }
    if (body.holidays.length > MAX_HOLIDAYS) {
      return NextResponse.json(
        { error: `You can keep at most ${MAX_HOLIDAYS} holidays` },
        { status: 400 }
      );
    }

    // Validate explicitly so a typo is reported rather than silently dropped.
    for (const item of body.holidays as Partial<Holiday>[]) {
      if (!item || !isValidHolidayDate(item.date)) {
        return NextResponse.json(
          { error: "Every holiday needs a date in YYYY-MM-DD format" },
          { status: 400 }
        );
      }
      if (item.name !== undefined && typeof item.name !== "string") {
        return NextResponse.json(
          { error: "Holiday names must be text" },
          { status: 400 }
        );
      }
      if (item.name && item.name.length > MAX_HOLIDAY_NAME) {
        return NextResponse.json(
          { error: `Holiday names must be ${MAX_HOLIDAY_NAME} characters or fewer` },
          { status: 400 }
        );
      }
    }

    const holidays = normalizeHolidays(body.holidays);

    const { db } = await connectToDatabase();
    const result = await db
      .collection("users")
      .updateOne({ _id: userId }, { $set: { holidays, updatedAt: new Date() } });

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(holidays);
  } catch (error) {
    console.error("Update holidays error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
