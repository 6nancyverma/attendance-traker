/**
 * Attendance record maths, shared by the API routes and the UI.
 *
 * No Node-only imports — safe to import from client components.
 */
import type { WorkSchedule } from "./work-schedule";
import { getStandardHours } from "./work-schedule";

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

/** The break currently in progress, if any. */
export function getOpenBreak(breaks: BreakEntry[] = []): BreakEntry | undefined {
  return breaks.find((entry) => !entry.end);
}

/**
 * Hours actually worked: elapsed time minus completed breaks.
 *
 * Before breaks existed this was just check-out minus check-in, which counted
 * lunch as work. Never returns a negative number.
 */
export function computeHoursWorked(
  checkInTime: string,
  checkOutTime: string,
  breaks: BreakEntry[] = []
): number {
  const start = new Date(checkInTime).getTime();
  const end = new Date(checkOutTime).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;

  const grossMinutes = (end - start) / 60000;
  const netMinutes = Math.max(0, grossMinutes - totalBreakMinutes(breaks));
  return Math.round((netMinutes / 60) * 100) / 100;
}

export function isOvertimeFor(
  hoursWorked: number,
  schedule: WorkSchedule
): boolean {
  return hoursWorked > getStandardHours(schedule);
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
