/**
 * Date helpers for attendance records.
 *
 * Everything runs on Indian Standard Time (Asia/Kolkata, UTC+05:30, no DST),
 * regardless of where the code executes. The server runs in UTC on
 * Vercel/Docker while browsers run in the user's zone, and mixing the two
 * made reports (formatted on the server) show times 5½ hours off from the
 * dashboard and history pages (formatted in the browser).
 *
 * Attendance days are keyed by IST calendar date (YYYY-MM-DD). Date keys are
 * walked with pure UTC arithmetic (`addDays`, `dayOfWeek`) so the machine's
 * own timezone never leaks in.
 *
 * No Node-only imports — safe to import from client components.
 */

export const APP_TIME_ZONE = "Asia/Kolkata";
export const APP_TIME_ZONE_LABEL = "IST";
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** The instant shifted so its UTC fields read as IST wall-clock fields. */
function toIstFields(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

/** IST calendar date as YYYY-MM-DD. */
export function toLocalDateKey(date: Date = new Date()): string {
  const d = toIstFields(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Minutes since IST midnight for an instant. */
export function istMinutesOfDay(date: Date): number {
  const d = toIstFields(date);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Instant → IST "HH:MM" (24-hour), e.g. for time inputs. */
export function toIstTimeInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const minutes = istMinutesOfDay(d);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60
  ).padStart(2, "0")}`;
}

/** IST date key + "HH:MM" → ISO instant, or null when either is invalid. */
export function istWallClockToIso(dateKey: string, time: string): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  const tm = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!dm || !tm) return null;
  const utc = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2]);
  return Number.isNaN(utc) ? null : new Date(utc - IST_OFFSET_MS).toISOString();
}

/** Instant → "09:05 AM" in IST. */
export function formatIstTime(
  iso?: string | Date,
  options: { seconds?: boolean } = {}
): string {
  if (!iso) return "";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    ...(options.seconds ? { second: "2-digit" } : {}),
  });
}

/** Instant → "1 Oct 2026, 03:45 PM" in IST. */
export function formatIstDateTime(date: Date = new Date()): string {
  return date.toLocaleString("en-IN", {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/** YYYY-MM-DD → a UTC-midnight Date (only for formatting/weekday maths). */
function dateKeyToUtc(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00Z`);
}

/**
 * Format a calendar date key. Done in UTC on a UTC-midnight date so the day
 * never shifts, whatever zone the code runs in.
 */
export function formatDateKey(
  dateKey: string,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
  locale = "en-US"
): string {
  const d = dateKeyToUtc(dateKey);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString(locale, { ...options, timeZone: "UTC" });
}

/** Day of week for a date key: 0 = Sunday … 6 = Saturday (NaN if invalid). */
export function dayOfWeek(dateKey: string): number {
  return dateKeyToUtc(dateKey).getUTCDay();
}

/** Date key `days` days after (or before) the given one. */
export function addDays(dateKey: string, days: number): string {
  const d = dateKeyToUtc(dateKey);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Current IST year and month (1-indexed). */
export function istYearMonth(date: Date = new Date()): {
  year: number;
  month: number;
} {
  const [y, m] = toLocalDateKey(date).split("-").map(Number);
  return { year: y, month: m };
}

/** Inclusive YYYY-MM-DD bounds for a month (1-indexed) or a whole year. */
export function getDateRange(
  year: number,
  month?: number
): { startDate: string; endDate: string } {
  const key = (d: Date) => d.toISOString().slice(0, 10);
  if (month !== undefined) {
    return {
      startDate: key(new Date(Date.UTC(year, month - 1, 1))),
      endDate: key(new Date(Date.UTC(year, month, 0))),
    };
  }
  return {
    startDate: key(new Date(Date.UTC(year, 0, 1))),
    endDate: key(new Date(Date.UTC(year, 11, 31))),
  };
}

/** True when the date key falls on one of the configured working days. */
export function isWorkingDay(
  dateKey: string,
  workingDays: number[] = [1, 2, 3, 4, 5]
): boolean {
  return workingDays.includes(dayOfWeek(dateKey));
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
  // Do not count today as an elapsed day, since it is still ongoing
  const cutoff = addDays(toLocalDateKey(today), -1);
  const last = endDate < cutoff ? endDate : cutoff;

  let count = 0;
  for (let key = startDate; key <= last; key = addDays(key, 1)) {
    if (isWorkingDay(key, workingDays) && !skip.has(key)) count += 1;
  }
  return count;
}
