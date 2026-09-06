/**
 * Public holidays, kept per user on their document.
 *
 * A holiday is a paid day off: it shows in history like a weekly off, is
 * never counted as absent, and any hours worked on it are all overtime.
 *
 * No Node-only imports — safe to import from client components.
 */

export interface Holiday {
  /** YYYY-MM-DD */
  date: string;
  name: string;
}

export const MAX_HOLIDAYS = 100;
export const MAX_HOLIDAY_NAME = 80;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidHolidayDate(date: unknown): date is string {
  return (
    typeof date === "string" &&
    DATE_PATTERN.test(date) &&
    !Number.isNaN(new Date(`${date}T00:00:00`).getTime())
  );
}

/**
 * Coerce whatever is stored into a clean, de-duplicated, date-sorted list.
 * Invalid entries are dropped rather than failing the whole list.
 */
export function normalizeHolidays(raw: unknown): Holiday[] {
  if (!Array.isArray(raw)) return [];
  const byDate = new Map<string, Holiday>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { date, name } = item as Partial<Holiday>;
    if (!isValidHolidayDate(date)) continue;
    const label =
      typeof name === "string" ? name.trim().slice(0, MAX_HOLIDAY_NAME) : "";
    byDate.set(date, { date, name: label || "Holiday" });
  }
  return Array.from(byDate.values())
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, MAX_HOLIDAYS);
}

export function findHoliday(
  dateKey: string,
  holidays: Holiday[] = []
): Holiday | undefined {
  return holidays.find((h) => h.date === dateKey);
}
