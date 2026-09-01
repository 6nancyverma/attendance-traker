import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { normalizeSchedule } from "@/lib/work-schedule";
import {
  computeHoursWorked,
  isDayType,
  isOvertimeFor,
  totalBreakMinutes,
  type BreakEntry,
  type DayType,
} from "@/lib/attendance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface UpsertBody {
  date?: string;
  dayType?: DayType;
  /** Local "HH:MM"; empty string clears the time. */
  checkIn?: string;
  checkOut?: string;
  note?: string;
}

/** Combine a YYYY-MM-DD key and local HH:MM into an ISO timestamp. */
function toIso(dateKey: string, time: string): string | null {
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) return null;
  const d = new Date(`${dateKey}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function loadSchedule(db: Awaited<ReturnType<typeof connectToDatabase>>["db"], userId: string) {
  try {
    const rec = await db
      .collection("users")
      .findOne({ _id: new ObjectId(userId) }, { projection: { workSchedule: 1 } });
    return normalizeSchedule(rec?.workSchedule ?? null);
  } catch {
    return normalizeSchedule(null);
  }
}

/**
 * PUT /api/attendance/record
 *
 * Create or correct a single day: fix a forgotten check-out, or mark the date
 * as leave/sick/holiday/WFH. Marked days are excluded from the absent count.
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (auth.response) return auth.response;
    const user = auth.user;

    const body = (await req.json()) as UpsertBody;
    const date = body.date;

    if (!date || !DATE_PATTERN.test(date)) {
      return NextResponse.json(
        { error: "date must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }
    if (body.dayType !== undefined && !isDayType(body.dayType)) {
      return NextResponse.json({ error: "Invalid day type" }, { status: 400 });
    }
    if (body.note !== undefined && body.note.length > 500) {
      return NextResponse.json(
        { error: "Note must be 500 characters or fewer" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const attendance = db.collection("attendance");

    const existing = await attendance.findOne({ userId: user._id, date });
    const dayType: DayType = body.dayType ?? (existing?.dayType as DayType) ?? "work";

    // Non-working days carry no times.
    if (dayType !== "work" && dayType !== "wfh") {
      await attendance.updateOne(
        { userId: user._id, date },
        {
          $set: {
            userId: user._id,
            date,
            dayType,
            note: body.note ?? existing?.note ?? "",
            status: "absent",
            updatedAt: new Date(),
          },
          $unset: {
            checkInTime: "",
            checkOutTime: "",
            hoursWorked: "",
            isOvertime: "",
            breaks: "",
            breakMinutes: "",
          },
        },
        { upsert: true }
      );
      const saved = await attendance.findOne({ userId: user._id, date });
      return NextResponse.json(saved);
    }

    // Working day: resolve the times.
    let checkInTime: string | undefined =
      (existing?.checkInTime as string) ?? undefined;
    let checkOutTime: string | undefined =
      (existing?.checkOutTime as string) ?? undefined;

    if (body.checkIn !== undefined) {
      if (body.checkIn === "") {
        checkInTime = undefined;
      } else {
        const iso = toIso(date, body.checkIn);
        if (!iso) {
          return NextResponse.json(
            { error: "checkIn must be in 24-hour HH:MM format" },
            { status: 400 }
          );
        }
        checkInTime = iso;
      }
    }

    if (body.checkOut !== undefined) {
      if (body.checkOut === "") {
        checkOutTime = undefined;
      } else {
        const iso = toIso(date, body.checkOut);
        if (!iso) {
          return NextResponse.json(
            { error: "checkOut must be in 24-hour HH:MM format" },
            { status: 400 }
          );
        }
        checkOutTime = iso;
      }
    }

    if (checkOutTime && !checkInTime) {
      return NextResponse.json(
        { error: "A check-out needs a check-in time" },
        { status: 400 }
      );
    }
    if (
      checkInTime &&
      checkOutTime &&
      new Date(checkOutTime) <= new Date(checkInTime)
    ) {
      return NextResponse.json(
        { error: "Check-out must be after check-in" },
        { status: 400 }
      );
    }

    const breaks: BreakEntry[] = Array.isArray(existing?.breaks)
      ? (existing!.breaks as BreakEntry[])
      : [];
    const schedule = await loadSchedule(db, user._id);

    const set: Record<string, unknown> = {
      userId: user._id,
      date,
      dayType,
      note: body.note ?? existing?.note ?? "",
      updatedAt: new Date(),
      correctedManually: true,
    };
    const unset: Record<string, ""> = {};

    if (checkInTime) {
      set.checkInTime = checkInTime;
      const arrived = new Date(checkInTime);
      const minutes = arrived.getHours() * 60 + arrived.getMinutes();
      const [sh, sm] = schedule.startTime.split(":").map(Number);
      const late = minutes > sh * 60 + sm + schedule.graceMinutes;
      set.status = late ? "late" : "present";
    } else {
      unset.checkInTime = "";
      set.status = "absent";
    }

    if (checkInTime && checkOutTime) {
      const hoursWorked = computeHoursWorked(checkInTime, checkOutTime, breaks);
      set.checkOutTime = checkOutTime;
      set.hoursWorked = hoursWorked;
      set.isOvertime = isOvertimeFor(hoursWorked, schedule);
      set.breakMinutes = Math.round(totalBreakMinutes(breaks));
    } else {
      unset.checkOutTime = "";
      unset.hoursWorked = "";
      unset.isOvertime = "";
    }

    await attendance.updateOne(
      { userId: user._id, date },
      Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set },
      { upsert: true }
    );

    const saved = await attendance.findOne({ userId: user._id, date });
    return NextResponse.json(saved);
  } catch (error) {
    console.error("Update record error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** DELETE /api/attendance/record?date=YYYY-MM-DD — remove a day entirely. */
export async function DELETE(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (auth.response) return auth.response;

    const date = new URL(req.url).searchParams.get("date");
    if (!date || !DATE_PATTERN.test(date)) {
      return NextResponse.json(
        { error: "date must be in YYYY-MM-DD format" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const result = await db
      .collection("attendance")
      .deleteOne({ userId: auth.user._id, date });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "No record for that date" }, { status: 404 });
    }
    return NextResponse.json({ message: "Record removed" });
  } catch (error) {
    console.error("Delete record error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
