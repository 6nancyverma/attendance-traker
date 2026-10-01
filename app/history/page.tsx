"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/require-auth";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  ChevronsRight,
  Download,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { ReportData } from "@/types/report";
import type { AttendanceRecord } from "@/types/api";
import {
  DAY_TYPES,
  DAY_TYPE_LABELS,
  formatDuration,
  formatHours,
  isWeeklyOff,
  splitHoursForDate,
  type DayType,
} from "@/lib/attendance";
import {
  DEFAULT_WORK_SCHEDULE,
  getStandardHours,
  normalizeSchedule,
  type WorkSchedule,
} from "@/lib/work-schedule";
import {
  addDays,
  dayOfWeek,
  formatDateKey,
  formatIstTime,
  getDateRange,
  istWallClockToIso,
  istYearMonth,
  isWorkingDay,
  toIstTimeInput,
  toLocalDateKey,
} from "@/lib/date";
import { findHoliday, normalizeHolidays, type Holiday } from "@/lib/holidays";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Instant → "09:05 AM" in IST. */
function formatTime(iso?: string): string {
  return formatIstTime(iso) || "—";
}

function formatDate(dateKey: string): { weekday: string; label: string } {
  if (Number.isNaN(dayOfWeek(dateKey))) return { weekday: "", label: dateKey };
  return {
    weekday: formatDateKey(dateKey, { weekday: "short" }),
    label: formatDateKey(dateKey),
  };
}

/**
 * IST "HH:MM" on a given day → exact ISO instant.
 * Empty input → empty string, which tells the API to clear the time.
 */
function toInstant(dateKey: string, time: string): string {
  if (!time) return "";
  return istWallClockToIso(dateKey, time) ?? "";
}

/** ISO timestamp → IST "HH:MM" for the edit inputs. */
function toTimeInput(iso?: string): string {
  return toIstTimeInput(iso);
}

const HEADERS = [
  "Date",
  "Check in",
  "Check out",
  "Break",
  "Working",
  "Overtime",
  "Total",
  "Status",
];
/** Table cell spacing: tighter on phones, roomier on wider screens. */
const CELL = "whitespace-nowrap px-3 py-3 md:px-4 md:py-3.5 lg:px-5";
/** The Date column stays put while the rest of the table scrolls. */
const PINNED = "sticky left-0 z-10 shadow-[inset_-1px_0_0_#f1f5f9]";

function StatusBadge({
  record,
  offLabel,
}: {
  record: AttendanceRecord;
  /** "Weekly off" or the holiday's name when the date is a paid day off. */
  offLabel: string | null;
}) {
  const dayType = record.dayType ?? "work";
  if (dayType !== "work" && dayType !== "wfh") {
    return (
      <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
        {DAY_TYPE_LABELS[dayType]}
      </span>
    );
  }
  // A Sunday or a holiday with nothing recorded is a paid day off, not an
  // absence.
  if (offLabel && !record.checkInTime) {
    return (
      <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
        {offLabel}
      </span>
    );
  }
  // An open day (checked in, never checked out) is worth calling out — it is
  // the most common data-entry mistake in an attendance tracker.
  if (record.checkInTime && !record.checkOutTime) {
    return (
      <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">
        No check-out
      </span>
    );
  }
  const styles: Record<string, string> = {
    present: "bg-green-50 text-green-700",
    late: "bg-yellow-50 text-yellow-700",
    absent: "bg-red-50 text-red-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
        styles[record.status] || "bg-gray-100 text-gray-700"
      }`}
    >
      {record.status}
    </span>
  );
}

function History() {
  const now = new Date();
  const istNow = istYearMonth(now);
  const [year, setYear] = useState(istNow.year);
  const [month, setMonth] = useState<number | "all">(istNow.month);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // The user's schedule decides the day length (overtime threshold) and
  // which weekdays are working days (the rest are weekly offs).
  const [schedule, setSchedule] = useState<WorkSchedule>(DEFAULT_WORK_SCHEDULE);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const standardHours = getStandardHours(schedule);
  const { token } = useAuth();
  const { toast } = useToast();

  // Inline editor: which date is open, and its working values.
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    checkIn: string;
    checkOut: string;
    dayType: DayType;
    note: string;
  }>({ checkIn: "", checkOut: "", dayType: "work", note: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addDate, setAddDate] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  // Width of the table's visible scroll area, so the inline editor can be
  // pinned to exactly what is on screen; and whether there is still more to
  // swipe to on the right.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [visibleWidth, setVisibleWidth] = useState<number | null>(null);
  const [tableOverflows, setTableOverflows] = useState(false);
  const [moreToRight, setMoreToRight] = useState(false);
  useEffect(() => {
    if (!scrollEl) return;
    const measure = () => {
      setVisibleWidth(scrollEl.clientWidth);
      setTableOverflows(scrollEl.scrollWidth > scrollEl.clientWidth + 1);
      setMoreToRight(
        scrollEl.scrollLeft + scrollEl.clientWidth < scrollEl.scrollWidth - 1
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scrollEl);
    if (scrollEl.firstElementChild) observer.observe(scrollEl.firstElementChild);
    scrollEl.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      scrollEl.removeEventListener("scroll", measure);
    };
  }, [scrollEl]);

  /** Download the PDF report for whatever the filters currently show. */
  const downloadPdf = async () => {
    setIsDownloading(true);
    try {
      const params = new URLSearchParams({
        year: String(year),
        type: month === "all" ? "yearly" : "monthly",
      });
      if (month !== "all") params.set("month", String(month));

      const res = await fetch(`/api/reports/generate?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Request failed");

      const data = (await res.json()) as ReportData;
      const { buildReportPdf, reportFileName } = await import(
        "@/lib/report-pdf"
      );
      buildReportPdf(data).save(reportFileName(data));
      toast({ title: "Downloaded", description: `Report for ${data.periodLabel}.` });
    } catch {
      toast({
        title: "Couldn't download",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const fetchHistory = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (month !== "all") params.set("month", String(month));

      const res = await fetch(`/api/attendance/history?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Request failed");
      setRecords((await res.json()) as AttendanceRecord[]);
    } catch {
      toast({
        title: "Couldn't load history",
        description: "Please try again.",
        variant: "destructive",
      });
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, [token, year, month, toast]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch("/api/settings/schedule", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => {
        if (!cancelled && raw) {
          setSchedule(normalizeSchedule(raw));
        }
      })
      .catch(() => {
        // Keep the default day length; the table still renders.
      });
    fetch("/api/settings/holidays", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => {
        if (!cancelled && raw) {
          setHolidays(normalizeHolidays(raw));
        }
      })
      .catch(() => {
        // No holiday list: nothing extra to show.
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const openEditor = (record: AttendanceRecord) => {
    setEditingDate(record.date);
    setShowAdd(false); // both forms share one draft
    setDraft({
      checkIn: toTimeInput(record.checkInTime),
      checkOut: toTimeInput(record.checkOutTime),
      dayType: (record.dayType as DayType) ?? "work",
      note: record.note ?? "",
    });
  };

  const saveDay = async (date: string) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/attendance/record", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date,
          ...draft,
          checkInAt: toInstant(date, draft.checkIn),
          checkOutAt: toInstant(date, draft.checkOut),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Couldn't save",
          description: data.error || "Please try again.",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Saved", description: `${date} updated.` });
      setEditingDate(null);
      setShowAdd(false);
      setAddDate("");
      fetchHistory();
    } catch {
      toast({
        title: "Error",
        description: "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteDay = async (date: string) => {
    // Deleting a day is the one action here that can't be undone.
    if (
      !window.confirm(
        `Remove everything recorded for ${date}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/attendance/record?date=${encodeURIComponent(date)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const data = await res.json();
        toast({
          title: "Couldn't remove",
          description: data.error || "Please try again.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Removed", description: `${date} deleted.` });
      setEditingDate(null);
      fetchHistory();
    } finally {
      setIsSaving(false);
    }
  };

  const completed = records.filter((r) => typeof r.hoursWorked === "number");
  const totalHours = completed.reduce((s, r) => s + (r.hoursWorked || 0), 0);
  const splitFor = (r: AttendanceRecord) =>
    splitHoursForDate(r.hoursWorked || 0, r.date, schedule, holidays);
  const totalRegular = completed.reduce((s, r) => s + splitFor(r).regular, 0);
  const totalOvertime = completed.reduce((s, r) => s + splitFor(r).overtime, 0);

  /** "Weekly off", the holiday's name, or null for a working day. */
  const offLabelFor = (dateKey: string): string | null => {
    const holiday = findHoliday(dateKey, holidays);
    if (holiday) return holiday.name;
    return isWeeklyOff(dateKey, schedule) ? "Weekly off" : null;
  };

  // Paid days off (weekly offs and holidays) that have already passed in the
  // selected range and have no record of their own. They count towards paid
  // days — a Sunday is paid even though nobody checks in — and in the month
  // view they are listed so the month reads like a calendar.
  const offDays: AttendanceRecord[] = (() => {
    const known = new Set(records.map((r) => r.date));
    const todayKey = toLocalDateKey(now);
    const { startDate: first, endDate: last } =
      month === "all" ? getDateRange(year) : getDateRange(year, month);
    const extra: AttendanceRecord[] = [];
    for (let key = first; key <= last; key = addDays(key, 1)) {
      if (key > todayKey) break;
      if (known.has(key)) continue;
      if (
        !isWorkingDay(key, schedule.workingDays) ||
        findHoliday(key, holidays)
      ) {
        extra.push({ _id: "", userId: "", date: key, status: "absent" });
      }
    }
    return extra;
  })();

  const workedDays = records.filter((r) => r.checkInTime).length;
  const markedDays = records.length - workedDays; // leave / sick / holiday marks
  const paidDays = records.length + offDays.length;

  const displayRows: AttendanceRecord[] =
    month === "all" || offDays.length === 0
      ? records
      : [...records, ...offDays].sort((a, b) =>
          a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
        );
  const totalBreak = completed.reduce((s, r) => s + (r.breakMinutes || 0), 0);
  const openDays = records.filter(
    (r) => r.checkInTime && !r.checkOutTime,
  ).length;

  const years = Array.from({ length: 5 }, (_, i) => istNow.year - i);

  const periodLabel =
    month === "all" ? String(year) : `${MONTHS[(month as number) - 1]} ${year}`;

  /** Type / times / note fields shared by "Add day" and the per-day editor. */
  const renderDraftFields = (withNote: boolean) => (
    <>
      <div className="col-span-2 sm:col-span-1">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Type
        </label>
        <Select
          value={draft.dayType}
          onValueChange={(val) =>
            setDraft((d) => ({
              ...d,
              dayType: val as DayType,
            }))
          }
        >
          <SelectTrigger className="h-10 w-full">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {DAY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {DAY_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(draft.dayType === "work" || draft.dayType === "wfh") && (
        <>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Check in
            </label>
            <Input
              type="time"
              value={draft.checkIn}
              onChange={(e) =>
                setDraft((d) => ({ ...d, checkIn: e.target.value }))
              }
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Check out
            </label>
            <Input
              type="time"
              value={draft.checkOut}
              onChange={(e) =>
                setDraft((d) => ({ ...d, checkOut: e.target.value }))
              }
              className="w-full"
            />
          </div>
        </>
      )}

      {withNote && (
        <div className="col-span-2 sm:col-span-1 lg:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Note
          </label>
          <Input
            value={draft.note}
            maxLength={500}
            placeholder="Optional"
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            className="w-full"
          />
        </div>
      )}
    </>
  );

  const renderEditor = (record: AttendanceRecord) => (
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {renderDraftFields(true)}
      </div>
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {record._id && (
          <Button
            variant="outline"
            onClick={() => deleteDay(record.date)}
            disabled={isSaving}
            className="text-red-600 hover:bg-red-50 hover:text-red-700 sm:mr-auto"
          >
            <Trash2 />
            Delete
          </Button>
        )}
        <Button variant="outline" onClick={() => setEditingDate(null)}>
          Cancel
        </Button>
        <Button
          onClick={() => saveDay(record.date)}
          disabled={isSaving}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {isSaving ? "Saving..." : "Save changes"}
        </Button>
      </div>
      {record.note && !isSaving && (
        <p className="mt-3 text-xs text-gray-500">Saved note: {record.note}</p>
      )}
    </div>
  );

  const summary: {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    tone: string;
  }[] = [
    {
      label: "Paid days",
      value: paidDays,
      hint: (
        <>
          {workedDays} worked · {offDays.length} off
          {markedDays > 0 && ` · ${markedDays} leave`}
        </>
      ),
      tone: "text-gray-900",
    },
    {
      label: "Total hours",
      value: formatHours(totalHours),
      hint: `${formatHours(totalRegular)} working`,
      tone: "text-blue-600",
    },
    {
      label: "Overtime",
      value: formatHours(totalOvertime),
      hint: `Beyond ${formatHours(standardHours)} a day`,
      tone: "text-indigo-600",
    },
    {
      label: "Late days",
      value: records.filter((r) => r.status === "late").length,
      tone: "text-amber-600",
    },
    {
      label: "Missing check-out",
      value: openDays,
      hint: openDays > 0 ? "Tap Edit to fix" : undefined,
      tone: "text-orange-600",
    },
  ];

  return (
    <AppShell>
      <PageHeader
        title="History"
        description="Every day you have checked in, most recent first."
        actions={
          <Button
            onClick={() => {
              setShowAdd(true);
              setEditingDate(null);
              setDraft({ checkIn: "", checkOut: "", dayType: "leave", note: "" });
            }}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus />
            Add day / mark leave
          </Button>
        }
      />

      {/* Filters */}
      <div className="mb-5 grid grid-cols-2 items-end gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:flex sm:flex-wrap">
        <div className="sm:w-40">
          <label
            htmlFor="history-month"
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            Month
          </label>
          <Select
            value={month.toString()}
            onValueChange={(val) => setMonth(val === "all" ? "all" : Number(val))}
          >
            <SelectTrigger id="history-month" className="h-10 w-full">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Whole year</SelectItem>
              {MONTHS.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="sm:w-28">
          <label
            htmlFor="history-year"
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            Year
          </label>
          <Select
            value={year.toString()}
            onValueChange={(val) => setYear(Number(val))}
          >
            <SelectTrigger id="history-year" className="h-10 w-full">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2 sm:ml-auto">
          <Button
            variant="outline"
            onClick={downloadPdf}
            disabled={isDownloading || isLoading}
            className="h-10 w-full"
          >
            {isDownloading ? <Loader2 className="animate-spin" /> : <Download />}
            {isDownloading ? "Preparing…" : "Download PDF"}
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {summary.map((s, i) => (
          <div
            key={s.label}
            className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ${
              i === summary.length - 1 ? "col-span-2 lg:col-span-1" : ""
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {s.label}
            </p>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${s.tone}`}>
              {s.value}
            </p>
            {s.hint && <p className="mt-1 text-xs text-gray-500">{s.hint}</p>}
          </div>
        ))}
      </div>

      {/* Add a day */}
      {showAdd && (
        <div className="mb-5 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Add a day</h2>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-1">
              <label
                htmlFor="add-date"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Date
              </label>
              <Input
                id="add-date"
                type="date"
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
                className="w-full"
              />
            </div>
            {renderDraftFields(false)}
          </div>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addDate && saveDay(addDate)}
              disabled={!addDate || isSaving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}

      {/* Records */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center">
            <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <Calendar className="h-7 w-7 text-slate-400" />
            </span>
            <p className="mb-1 font-medium text-gray-900">
              No attendance recorded
            </p>
            <p className="text-sm text-gray-500">Nothing for {periodLabel}.</p>
          </div>
        ) : (
          <>
            {/* Space stays while the table overflows, so the table does not
                jump when the hint fades out at the last column. */}
            {tableOverflows && (
              <p
                aria-hidden={!moreToRight}
                className={`flex items-center justify-end gap-1 border-b border-gray-100 px-3 py-2 text-xs text-gray-500 transition-opacity ${
                  moreToRight ? "opacity-100" : "opacity-0"
                }`}
              >
                Swipe sideways to see all columns
                <ChevronsRight className="h-3.5 w-3.5" />
              </p>
            )}

            {/* The same table on every screen size. On narrow screens it
                scrolls sideways inside this box (never the page) with the
                Date column pinned. `relative` keeps the sr-only header label
                inside the scroll area. */}
            <div
              ref={setScrollEl}
              className="relative overflow-x-auto overscroll-x-contain"
            >
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-100 bg-slate-50">
                  <tr>
                    {HEADERS.map((h, i) => (
                      <th
                        key={h}
                        className={`${CELL} text-xs font-semibold uppercase tracking-wide text-gray-500 ${
                          i === 0 ? `${PINNED} bg-slate-50` : ""
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                    <th className={CELL}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayRows.map((record) => {
                    const { weekday, label } = formatDate(record.date);
                    const isEditing = editingDate === record.date;
                    const hasHours = typeof record.hoursWorked === "number";
                    const offLabel = offLabelFor(record.date);
                    const split = hasHours ? splitFor(record) : null;
                    // Pinned cells need an opaque background matching the
                    // row, or scrolled columns show through them.
                    const rowBg = isEditing
                      ? "bg-blue-50"
                      : "bg-white group-hover:bg-slate-50";
                    return (
                      <Fragment key={record._id || record.date}>
                        <tr
                          className={`group transition-colors ${
                            isEditing ? "bg-blue-50" : "hover:bg-slate-50"
                          }`}
                        >
                          <td className={`${CELL} ${PINNED} ${rowBg}`}>
                            <span className="block font-medium text-gray-900 md:inline">
                              <span className="md:hidden">
                                {formatDateKey(record.date, {
                                  day: "numeric",
                                  month: "short",
                                })}
                              </span>
                              <span className="hidden md:inline">{label}</span>
                            </span>
                            <span className="block text-xs text-gray-500 md:ml-2 md:inline">
                              {weekday}
                              {offLabel && record.checkInTime && (
                                <span
                                  title="Paid day off — all hours count as overtime"
                                  className="ml-1 text-purple-600 md:ml-2"
                                >
                                  {offLabel.toLowerCase()}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className={`${CELL} text-gray-700`}>
                            {formatTime(record.checkInTime)}
                          </td>
                          <td className={`${CELL} text-gray-700`}>
                            {formatTime(record.checkOutTime)}
                          </td>
                          <td className={`${CELL} text-gray-700`}>
                            {hasHours
                              ? formatDuration(record.breakMinutes || 0)
                              : "—"}
                          </td>
                          <td className={`${CELL} text-gray-700`}>
                            {formatHours(split?.regular)}
                          </td>
                          <td
                            className={`${CELL} ${
                              split && split.overtime > 0
                                ? "font-medium text-blue-600"
                                : "text-gray-400"
                            }`}
                          >
                            {formatHours(split?.overtime)}
                          </td>
                          <td className={`${CELL} font-semibold text-gray-900`}>
                            {formatHours(record.hoursWorked)}
                          </td>
                          <td className={CELL}>
                            <StatusBadge record={record} offLabel={offLabel} />
                          </td>
                          <td className={`${CELL} text-right`}>
                            <button
                              type="button"
                              onClick={() =>
                                isEditing
                                  ? setEditingDate(null)
                                  : openEditor(record)
                              }
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-blue-600 hover:bg-blue-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              {isEditing ? "Close" : "Edit"}
                            </button>
                          </td>
                        </tr>

                        {isEditing && (
                          <tr className="bg-blue-50">
                            <td colSpan={HEADERS.length + 1} className="p-0">
                              {/* Pinned to the visible width so the whole
                                  form shows without scrolling sideways. */}
                              <div
                                className="sticky left-0 px-3 pb-4 md:px-4 lg:px-5"
                                style={
                                  visibleWidth
                                    ? { width: visibleWidth }
                                    : undefined
                                }
                              >
                                {renderEditor(record)}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-gray-100 bg-slate-50">
                  <tr>
                    <td className={`${CELL} ${PINNED} bg-slate-50`}>
                      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Total
                      </span>
                      <span className="block text-xs text-gray-500">
                        {paidDays} paid {paidDays === 1 ? "day" : "days"}
                      </span>
                    </td>
                    <td colSpan={2} className={CELL} />
                    <td className={`${CELL} font-semibold text-gray-700`}>
                      {formatDuration(totalBreak)}
                    </td>
                    <td className={`${CELL} font-semibold text-gray-900`}>
                      {formatHours(totalRegular)}
                    </td>
                    <td className={`${CELL} font-semibold text-blue-600`}>
                      {formatHours(totalOvertime)}
                    </td>
                    <td className={`${CELL} font-semibold text-gray-900`}>
                      {formatHours(totalHours)}
                    </td>
                    <td colSpan={2} className={CELL} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function HistoryPage() {
  return (
    <RequireAuth>
      <History />
    </RequireAuth>
  );
}
