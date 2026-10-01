/**
 * Shape of GET /api/reports/generate, rendered into a PDF in the browser.
 * All times are already formatted in IST by the server.
 */

/** Drives row colouring in the PDF. */
export type ReportRowKind =
  | "present"
  | "late"
  | "open"
  | "off"
  | "leave"
  | "absent";

export interface ReportRow {
  /** YYYY-MM-DD (IST calendar date). */
  date: string;
  /** "Mon", "Tue", … */
  day: string;
  /** "09:05 AM" in IST, or "" when not recorded. */
  checkIn: string;
  checkOut: string;
  /** Break minutes deducted, or null when the day has no hours. */
  breakMinutes: number | null;
  /** Decimal hours; null when nothing was worked. */
  regular: number | null;
  overtime: number | null;
  total: number | null;
  status: string;
  kind: ReportRowKind;
  note: string;
}

export interface ReportTotals {
  paidDays: number;
  workedDays: number;
  offDays: number;
  leaveDays: number;
  lateDays: number;
  overtimeDays: number;
  breakMinutes: number;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
}

export interface ReportMonth extends ReportTotals {
  /** 1–12 */
  month: number;
  label: string;
}

export interface ReportData {
  type: "monthly" | "yearly";
  year: number;
  month: number | null;
  /** "October 2026" or "2026". */
  periodLabel: string;
  startDate: string;
  endDate: string;
  /** avatar: profile photo data URL, when the user has one. */
  user: { name: string; email: string; avatar: string | null };
  schedule: {
    /** "9:00 AM" */
    start: string;
    end: string;
    standardHours: number;
    breakMinutes: number;
    workingDays: string[];
  };
  rows: ReportRow[];
  totals: ReportTotals;
  /** Month-by-month breakdown, yearly reports only. */
  months: ReportMonth[];
  /** e.g. "1 Oct 2026, 03:45 pm" */
  generatedAt: string;
  timeZone: string;
}
