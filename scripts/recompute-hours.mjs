/**
 * Recompute stored hours for every completed attendance record.
 *
 * Hours worked, the break deduction and the overtime flag are stored on each
 * record when it is checked out or edited. When the rules change (for
 * example the standard 30-minute break being introduced), records saved
 * under the old rules keep their old numbers until they are recomputed.
 *
 * This walks every record that has both a check-in and a check-out and
 * re-derives those three fields from the raw times, the tracked breaks and
 * the owner's current work schedule. Raw times are never touched, so it is
 * safe to run repeatedly.
 *
 * Dry run (prints what would change, changes nothing):
 *   node scripts/recompute-hours.mjs
 * Apply:
 *   node scripts/recompute-hours.mjs --yes
 * Reads MONGODB_URI from the environment or .env.local.
 */
import fs from "node:fs";
import { MongoClient, ObjectId } from "mongodb";

// Mirrors lib/work-schedule.ts and lib/attendance.ts. Kept inline because this
// script runs with plain node, outside the Next/TypeScript toolchain.
const DEFAULTS = {
  startTime: "09:00",
  endTime: "17:00",
  graceMinutes: 0,
  workingDays: [1, 2, 3, 4, 5],
  breakMinutes: 30,
  overtimeGraceMinutes: 10,
};
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMinutes = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
function normalizeSchedule(raw) {
  const v = raw ?? {};
  const startTime = TIME.test(v.startTime ?? "") ? v.startTime : DEFAULTS.startTime;
  const endTime = TIME.test(v.endTime ?? "") ? v.endTime : DEFAULTS.endTime;
  const breakMinutes =
    Number.isFinite(v.breakMinutes) && v.breakMinutes >= 0 && v.breakMinutes <= 480
      ? Math.round(v.breakMinutes)
      : DEFAULTS.breakMinutes;
  const workingDays =
    Array.isArray(v.workingDays) &&
    v.workingDays.length > 0 &&
    v.workingDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      ? v.workingDays
      : DEFAULTS.workingDays;
  const overtimeGraceMinutes =
    Number.isFinite(v.overtimeGraceMinutes) &&
    v.overtimeGraceMinutes >= 0 &&
    v.overtimeGraceMinutes <= 240
      ? Math.round(v.overtimeGraceMinutes)
      : DEFAULTS.overtimeGraceMinutes;
  return { startTime, endTime, breakMinutes, workingDays, overtimeGraceMinutes };
}
/** Overtime only once the day runs past its expected length by more than the grace. */
function isOvertime(hoursWorked, standard, graceMinutes) {
  if (standard <= 0) return hoursWorked > 0;
  return Math.round((hoursWorked - standard) * 60) > graceMinutes;
}
/** Expected hours on a date: zero on a weekly off or holiday, so any work is overtime. */
function standardHoursForDate(dateKey, s, holidays) {
  if (holidays.has(dateKey)) return 0;
  const d = new Date(`${dateKey}T00:00:00`);
  if (!Number.isNaN(d.getTime()) && !s.workingDays.includes(d.getDay())) return 0;
  return standardHours(s);
}
function standardHours(s) {
  const start = toMinutes(s.startTime);
  const end = toMinutes(s.endTime);
  const span = (end > start ? end - start : end + 24 * 60 - start) / 60;
  // Working hours are net of the break, so the standard day is too.
  return Math.max(0, Math.round((span - s.breakMinutes / 60) * 100) / 100);
}
function trackedBreakMinutes(breaks) {
  return (Array.isArray(breaks) ? breaks : []).reduce((sum, b) => {
    if (!b.end) return sum;
    const a = new Date(b.start).getTime();
    const z = new Date(b.end).getTime();
    return Number.isNaN(a) || Number.isNaN(z) || z <= a ? sum : sum + (z - a) / 60000;
  }, 0);
}
function recompute(record, schedule, holidays) {
  const start = new Date(record.checkInTime).getTime();
  const end = new Date(record.checkOutTime).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  const breakMinutes = Math.round(
    Math.max(trackedBreakMinutes(record.breaks), schedule.breakMinutes)
  );
  const gross = (end - start) / 60000;
  const hoursWorked = Math.round((Math.max(0, gross - breakMinutes) / 60) * 100) / 100;
  return {
    hoursWorked,
    breakMinutes,
    isOvertime: isOvertime(
      hoursWorked,
      standardHoursForDate(record.date, schedule, holidays),
      schedule.overtimeGraceMinutes
    ),
  };
}

function loadMongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  try {
    const env = fs.readFileSync(".env.local", "utf8");
    const match = env.match(/^MONGODB_URI=(.*)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    // fall through
  }
  throw new Error("MONGODB_URI is not set and .env.local has no value");
}

const apply = process.argv.includes("--yes");
const client = new MongoClient(loadMongoUri());
try {
  await client.connect();
  const db = client.db("attendance_system");
  const attendance = db.collection("attendance");
  const users = db.collection("users");

  const records = await attendance
    .find({ checkInTime: { $exists: true }, checkOutTime: { $exists: true } })
    .sort({ userId: 1, date: 1 })
    .toArray();

  const schedules = new Map();
  let changed = 0;
  const updates = [];
  for (const r of records) {
    if (!schedules.has(r.userId)) {
      let raw = null;
      try {
        const u = await users.findOne(
          { _id: new ObjectId(r.userId) },
          { projection: { workSchedule: 1, holidays: 1, email: 1 } }
        );
        raw = u?.workSchedule ?? null;
        const holidays = new Set(
          (Array.isArray(u?.holidays) ? u.holidays : []).map((h) => h?.date).filter(Boolean)
        );
        schedules.set(r.userId, {
          schedule: normalizeSchedule(raw),
          holidays,
          email: u?.email ?? "(deleted user)",
        });
      } catch {
        schedules.set(r.userId, {
          schedule: normalizeSchedule(null),
          holidays: new Set(),
          email: "(unknown)",
        });
      }
    }
    const { schedule, holidays, email } = schedules.get(r.userId);
    const next = recompute(r, schedule, holidays);
    if (!next) continue;
    const same =
      next.hoursWorked === r.hoursWorked &&
      next.breakMinutes === (r.breakMinutes ?? 0) &&
      next.isOvertime === !!r.isOvertime;
    if (same) continue;
    changed += 1;
    console.log(
      `${email.padEnd(32)} ${r.date}  hours ${r.hoursWorked ?? "-"} → ${next.hoursWorked}` +
        `  break ${r.breakMinutes ?? 0} → ${next.breakMinutes}m` +
        `  overtime ${!!r.isOvertime} → ${next.isOvertime}`
    );
    updates.push({ updateOne: { filter: { _id: r._id }, update: { $set: next } } });
  }

  console.log(`\n${records.length} completed record(s) checked, ${changed} would change.`);
  if (!apply) {
    console.log("Dry run — nothing changed. Re-run with --yes to apply.");
  } else if (updates.length) {
    const res = await attendance.bulkWrite(updates);
    console.log(`Updated ${res.modifiedCount} record(s).`);
  }
} finally {
  await client.close();
}
