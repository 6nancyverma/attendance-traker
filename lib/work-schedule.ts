/**
 * Per-user work schedule.
 *
 * Previously "late" was hardcoded to 09:00 and "overtime" to 8 hours, with no
 * way to say what your actual office hours are. These defaults reproduce that
 * old behaviour exactly (09:00–17:00 = 8h, no grace), so existing users see no
 * change until they set their own.
 *
 * No Node-only imports — safe to import from client components.
 */

export interface WorkSchedule {
  /** Local "HH:MM" the working day starts. Arriving after this is late. */
  startTime: string;
  /** Local "HH:MM" the working day ends. Length of day drives overtime. */
  endTime: string;
  /** Minutes after startTime still counted as on time. */
  graceMinutes: number;
  /** Days that count as working days: 0 = Sunday … 6 = Saturday. */
  workingDays: number[];
}

export const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  startTime: "09:00",
  endTime: "17:00",
  graceMinutes: 0,
  workingDays: [1, 2, 3, 4, 5],
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** "HH:MM" → minutes since local midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Expected length of a working day, in hours.
 * An end time at or before the start time is treated as an overnight shift.
 */
export function getStandardHours(schedule: WorkSchedule): number {
  const start = timeToMinutes(schedule.startTime);
  const end = timeToMinutes(schedule.endTime);
  const minutes = end > start ? end - start : end + 24 * 60 - start;
  return minutes / 60;
}

/** True when `checkInAt` is later than startTime + graceMinutes. */
export function isLateArrival(checkInAt: Date, schedule: WorkSchedule): boolean {
  const arrived = checkInAt.getHours() * 60 + checkInAt.getMinutes();
  return arrived > timeToMinutes(schedule.startTime) + schedule.graceMinutes;
}

export function isOvertime(hoursWorked: number, schedule: WorkSchedule): boolean {
  return hoursWorked > getStandardHours(schedule);
}

/**
 * Coerce whatever is stored on the user document into a usable schedule,
 * falling back field-by-field so a partial or malformed value can't break
 * check-in.
 */
export function normalizeSchedule(raw: unknown): WorkSchedule {
  const value = (raw ?? {}) as Partial<WorkSchedule>;

  const startTime =
    typeof value.startTime === "string" && isValidTime(value.startTime)
      ? value.startTime
      : DEFAULT_WORK_SCHEDULE.startTime;

  const endTime =
    typeof value.endTime === "string" && isValidTime(value.endTime)
      ? value.endTime
      : DEFAULT_WORK_SCHEDULE.endTime;

  const graceMinutes =
    typeof value.graceMinutes === "number" &&
    Number.isFinite(value.graceMinutes) &&
    value.graceMinutes >= 0 &&
    value.graceMinutes <= 240
      ? Math.round(value.graceMinutes)
      : DEFAULT_WORK_SCHEDULE.graceMinutes;

  const workingDays =
    Array.isArray(value.workingDays) &&
    value.workingDays.length > 0 &&
    value.workingDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      ? Array.from(new Set(value.workingDays)).sort()
      : DEFAULT_WORK_SCHEDULE.workingDays;

  return { startTime, endTime, graceMinutes, workingDays };
}

export const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** "09:00" → "9:00 AM", for display. */
export function formatTimeLabel(time: string): string {
  if (!isValidTime(time)) return time;
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}
