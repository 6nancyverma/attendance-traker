import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import {
  isValidTime,
  normalizeSchedule,
  timeToMinutes,
} from "@/lib/work-schedule";
import { normalizeHolidays } from "@/lib/holidays";
import {
  computeHoursWorked,
  effectiveBreakMinutes,
  isDayType,
  splitHoursForDate,
  type BreakEntry,
  type DayType,
} from "@/lib/attendance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface UpsertBody {
  date?: string;
  dayType?: DayType;
  /** The user's local "HH:MM"; empty string clears the time. */
  checkIn?: string;
  checkOut?: string;
  /**
   * The same times as exact ISO instants, computed in the browser.
   *
   * The server can't do that conversion itself: it may run in a different
   * timezone (UTC on Vercel/Docker), so "10:00" typed in India used to be
   * saved as 10:00 UTC and shown back as 3:30 PM. Empty string clears.
   */
  checkInAt?: string;
  checkOutAt?: string;
  note?: string;
}

/**
 * Fallback for callers that only send HH:MM: combine it with the date in the
 * server's own timezone. Only correct when server and user share a timezone.
 */
function toIso(dateKey: string, time: string): string | null {
  if (!isValidTime(time)) return null;
  const d = new Date(`${dateKey}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Work out the stored timestamp for one of the two times.
 * Precedence: exact instant from the browser → HH:MM (server-local fallback)
 * → whatever is already stored.
 */
function resolveTime(
  dateKey: string,
  label: "checkIn" | "checkOut",
  instant: string | undefined,
  wallClock: string | undefined,
  current: string | undefined
): { value: string | undefined; error?: string } {
  if (instant !== undefined) {
    if (instant === "") return { value: undefined };
    const d = new Date(instant);
    if (Number.isNaN(d.getTime())) {
      return { value: undefined, error: `${label}At must be an ISO timestamp` };
    }
    return { value: d.toISOString() };
  }
  if (wallClock !== undefined) {
    if (wallClock === "") return { value: undefined };
    const iso = toIso(dateKey, wallClock);
    if (!iso) {
      return {
        value: undefined,
        error: `${label} must be in 24-hour HH:MM format`,
      };
    }
    return { value: iso };
  }
  return { value: current };
}

async function loadSchedule(
  db: Awaited<ReturnType<typeof connectToDatabase>>["db"],
  userId: string
) {
  try {
    const rec = await db
      .collection("users")
      .findOne(
        { _id: new ObjectId(userId) },
        { projection: { workSchedule: 1, holidays: 1 } }
      );
    return {
      schedule: normalizeSchedule(rec?.workSchedule ?? null),
      holidays: normalizeHolidays(rec?.holidays ?? null),
    };
  } catch {
    return { schedule: normalizeSchedule(null), holidays: normalizeHolidays(null) };
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
    const resolvedIn = resolveTime(
      date,
      "checkIn",
      body.checkInAt,
      body.checkIn,
      (existing?.checkInTime as string) ?? undefined
    );
    if (resolvedIn.error) {
      return NextResponse.json({ error: resolvedIn.error }, { status: 400 });
    }
    const resolvedOut = resolveTime(
      date,
      "checkOut",
      body.checkOutAt,
      body.checkOut,
      (existing?.checkOutTime as string) ?? undefined
    );
    if (resolvedOut.error) {
      return NextResponse.json({ error: resolvedOut.error }, { status: 400 });
    }
    const checkInTime = resolvedIn.value;
    const checkOutTime = resolvedOut.value;

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
    const { schedule, holidays } = await loadSchedule(db, user._id);

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
      // "Late" is about the user's wall clock, so prefer the HH:MM they typed
      // over reading hours off the instant in the server's timezone.
      let arrivedMinutes: number | null = null;
      if (body.checkIn && isValidTime(body.checkIn)) {
        arrivedMinutes = timeToMinutes(body.checkIn);
      } else if (checkInTime !== existing?.checkInTime) {
        const arrived = new Date(checkInTime);
        arrivedMinutes = arrived.getHours() * 60 + arrived.getMinutes();
      }
      if (arrivedMinutes !== null) {
        const late =
          arrivedMinutes >
          timeToMinutes(schedule.startTime) + schedule.graceMinutes;
        set.status = late ? "late" : "present";
      } else {
        // Check-in unchanged and no wall-clock time given: keep the status.
        set.status = existing?.status ?? "present";
      }
    } else {
      unset.checkInTime = "";
      set.status = "absent";
    }

    if (checkInTime && checkOutTime) {
      const hoursWorked = computeHoursWorked(
        checkInTime,
        checkOutTime,
        breaks,
        schedule.breakMinutes
      );
      set.checkOutTime = checkOutTime;
      set.hoursWorked = hoursWorked;
      set.isOvertime =
        splitHoursForDate(hoursWorked, date, schedule, holidays).overtime > 0;
      set.breakMinutes = Math.round(
        effectiveBreakMinutes(breaks, schedule.breakMinutes)
      );
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
