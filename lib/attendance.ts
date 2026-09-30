/**
 * Attendance record maths, shared by the API routes and the UI.
 *
 * No Node-only imports — safe to import from client components.
 */
import type { WorkSchedule } from "./work-schedule";
import { getStandardHours } from "./work-schedule";
import { isWorkingDay } from "./date";
import { findHoliday, type Holiday } from "./holidays";

export interface BreakEntry {
  /** ISO timestamp the break started. */
  start: string;
  /** ISO timestamp it ended. Absent while a break is in progress. */
  end?: string;
}

/** How a day is classified. Only "work" days expect a check-in. */
export const DAY_TYPES = ["work", "leave", "sick", "holiday", "wfh"] as const;
export type DayType = (typeof DAY_TYPES)[number];

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  work: "Working day",
  leave: "Paid leave",
  sick: "Sick leave",
  holiday: "Holiday",
  wfh: "Work from home",
};

export function isDayType(value: unknown): value is DayType {
  return (
    typeof value === "string" && (DAY_TYPES as readonly string[]).includes(value)
  );
}

/** Total completed break time in minutes. An open break contributes nothing. */
export function totalBreakMinutes(breaks: BreakEntry[] = []): number {
  return breaks.reduce((sum, entry) => {
    if (!entry.end) return sum;
    const start = new Date(entry.start).getTime();
    const end = new Date(entry.end).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return sum;
    return sum + (end - start) / 60000;
  }, 0);
}

/**
 * Minutes to deduct from a day: the standard break, or the tracked breaks
 * when they add up to more than that. They never stack — a tracked lunch is
 * the same lunch the standard break stands in for.
 */
export function effectiveBreakMinutes(
  breaks: BreakEntry[] = [],
  standardBreakMinutes = 0
): number {
  return Math.max(totalBreakMinutes(breaks), Math.max(0, standardBreakMinutes));
}

/** The break currently in progress, if any. */
export function getOpenBreak(breaks: BreakEntry[] = []): BreakEntry | undefined {
  return breaks.find((entry) => !entry.end);
}

/**
 * Hours actually worked: elapsed time minus the break deduction (see
 * `effectiveBreakMinutes`).
 *
 * Before breaks existed this was just check-out minus check-in, which counted
 * lunch as work. Never returns a negative number.
 */
export function computeHoursWorked(
  checkInTime: string,
  checkOutTime: string,
  breaks: BreakEntry[] = [],
  standardBreakMinutes = 0
): number {
  const start = new Date(checkInTime).getTime();
  const end = new Date(checkOutTime).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;

  const grossMinutes = (end - start) / 60000;
  const netMinutes = Math.max(
    0,
    grossMinutes - effectiveBreakMinutes(breaks, standardBreakMinutes)
  );
  return Math.round((netMinutes / 60) * 100) / 100;
}

/** True when the date is not one of the schedule's working days (a weekly off). */
export function isWeeklyOff(dateKey: string, schedule: WorkSchedule): boolean {
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  return !isWorkingDay(d, schedule.workingDays);
}

/** True when the date is in the user's holiday list. */
export function isHoliday(dateKey: string, holidays: Holiday[] = []): boolean {
  return !!findHoliday(dateKey, holidays);
}

/** A paid day off: a weekly off or a holiday. */
export function isOffDay(
  dateKey: string,
  schedule: WorkSchedule,
  holidays: Holiday[] = []
): boolean {
  return isWeeklyOff(dateKey, schedule) || isHoliday(dateKey, holidays);
}

/**
 * Working hours expected on a given date. Zero on a weekly off or holiday, so
 * anything worked on a Sunday or a public holiday is overtime.
 */
export function standardHoursForDate(
  dateKey: string,
  schedule: WorkSchedule,
  holidays: Holiday[] = []
): number {
  return isOffDay(dateKey, schedule, holidays) ? 0 : getStandardHours(schedule);
}

/**
 * Split a day's hours into the regular portion (up to the scheduled day
 * length) and whatever ran over it.
 *
 * Running over by no more than `graceMinutes` is not overtime — checking out
 * at 6:31 for a 6:30 finish is still a normal day, so those minutes stay in
 * the regular portion. Past the grace, the whole overrun counts. Days with no
 * expected hours (weekly offs, holidays) get no grace: all of it is overtime.
 */
export function splitHours(
  hoursWorked: number,
  standardHours: number,
  graceMinutes = 0
): { regular: number; overtime: number } {
  const total = Math.max(0, hoursWorked || 0);
  const cap = Math.max(0, standardHours || 0);
  // Compared in whole minutes: hours are stored to two decimals, so ten
  // minutes over reads as 0.17h, a hair more than 10/60.
  const overMinutes = Math.round((total - cap) * 60);
  const withinGrace = cap > 0 && overMinutes <= Math.max(0, graceMinutes || 0);
  const regular = withinGrace ? total : Math.min(total, cap);
  return {
    regular: Math.round(regular * 100) / 100,
    overtime: Math.round((total - regular) * 100) / 100,
  };
}

/** `splitHours` for a given date under the user's schedule and holidays. */
export function splitHoursForDate(
  hoursWorked: number,
  dateKey: string,
  schedule: WorkSchedule,
  holidays: Holiday[] = []
): { regular: number; overtime: number } {
  return splitHours(
    hoursWorked,
    standardHoursForDate(dateKey, schedule, holidays),
    schedule.overtimeGraceMinutes
  );
}

/**
 * Decimal hours → "8h 30m".
 *
 * Hours are stored as decimals (8.5 = eight and a half hours), but "8.50h"
 * reads like 8 hours 50 minutes, so never show the raw number to people.
 */
export function formatHours(hours?: number | null): string {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) {
    return "—";
  }
  return formatDuration(hours * 60);
}

/** "1h 25m" / "45m" / "—" */
export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "—";
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
