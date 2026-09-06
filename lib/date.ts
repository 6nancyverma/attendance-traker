/**
 * Date helpers for attendance records.
 *
 * Attendance days are keyed by *local* calendar date (YYYY-MM-DD), not UTC.
 * The previous code used `new Date().toISOString().split("T")[0]`, which is the
 * UTC date, while the "late" check used `getHours()` (local). For anyone east
 * of UTC that disagreed near midnight — an 00:30 IST check-in was filed against
 * the previous day.
 */

/** Local calendar date as YYYY-MM-DD. */
export function toLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Inclusive YYYY-MM-DD bounds for a month (1-indexed) or a whole year. */
export function getDateRange(
  year: number,
  month?: number
): { startDate: string; endDate: string } {
  if (month !== undefined) {
    return {
      startDate: toLocalDateKey(new Date(year, month - 1, 1)),
      endDate: toLocalDateKey(new Date(year, month, 0)),
    };
  }
  return {
    startDate: toLocalDateKey(new Date(year, 0, 1)),
    endDate: toLocalDateKey(new Date(year, 11, 31)),
  };
}

/** True when the date falls on one of the configured working days. */
export function isWorkingDay(
  date: Date,
  workingDays: number[] = [1, 2, 3, 4, 5]
): boolean {
  return workingDays.includes(date.getDay());
}

/**
 * Number of working days in the range, never counting past today — an absence
 * can only be recorded for a day that has already happened.
 */
export function countWorkingDaysElapsed(
  startDate: string,
  endDate: string,
  today: Date = new Date(),
  workingDays: number[] = [1, 2, 3, 4, 5],
  holidays: Iterable<string> = []
): number {
  const skip = new Set(holidays);
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const todayKey = toLocalDateKey(today);
  const cutoff = new Date(`${todayKey}T00:00:00`);
  // Do not count today as an elapsed day, since it is still ongoing
  cutoff.setDate(cutoff.getDate() - 1);

  const last = end < cutoff ? end : cutoff;
  if (start > last) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= last) {
    if (isWorkingDay(cursor, workingDays) && !skip.has(toLocalDateKey(cursor))) {
      count += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}
