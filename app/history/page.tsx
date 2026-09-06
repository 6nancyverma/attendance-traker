"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/require-auth";
import { Input } from "@/components/ui/input";
import {
  Calendar,
  Clock,
  Download,
  LayoutDashboard,
  Plus,
  Menu,
  X,
} from "lucide-react";
import type { AttendanceRecord } from "@/types/api";
import {
  DAY_TYPES,
  DAY_TYPE_LABELS,
  formatDuration,
  formatHours,
  isWeeklyOff,
  splitHours,
  standardHoursForDate,
  type DayType,
} from "@/lib/attendance";
import {
  DEFAULT_WORK_SCHEDULE,
  getStandardHours,
  normalizeSchedule,
  type WorkSchedule,
} from "@/lib/work-schedule";
import { isWorkingDay, toLocalDateKey } from "@/lib/date";
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

function formatTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateKey: string): { weekday: string; label: string } {
  // dateKey is YYYY-MM-DD; parse as local midnight so the weekday is correct.
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return { weekday: "", label: dateKey };
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    label: d.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
  };
}

/**
 * Local "HH:MM" on a given day → exact ISO instant, using the browser's
 * timezone. The server can't do this: it may sit in another timezone.
 * Empty input → empty string, which tells the API to clear the time.
 */
function toInstant(dateKey: string, time: string): string {
  if (!time) return "";
  const d = new Date(`${dateKey}T${time}:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** ISO timestamp → local "HH:MM" for the edit inputs. */
function toTimeInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

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
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState<number | "all">(now.getMonth() + 1);
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    splitHours(
      r.hoursWorked || 0,
      standardHoursForDate(r.date, schedule, holidays),
    );
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
    const first =
      month === "all" ? new Date(year, 0, 1) : new Date(year, month - 1, 1);
    const last =
      month === "all" ? new Date(year, 11, 31) : new Date(year, month, 0);
    const extra: AttendanceRecord[] = [];
    for (
      const cursor = new Date(first);
      cursor <= last;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      const key = toLocalDateKey(cursor);
      if (key > todayKey) break;
      if (known.has(key)) continue;
      if (
        !isWorkingDay(cursor, schedule.workingDays) ||
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

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-8 h-8 text-blue-600" />
            <span className="text-xl font-bold text-gray-900">
              AttendanceApp
            </span>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-gray-600 hover:text-gray-900 focus:outline-none"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                <LayoutDashboard className="w-4 h-4 mr-2" />
                Dashboard
              </Button>
            </Link>
            <Link href="/reports">
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Reports
              </Button>
            </Link>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 shadow-lg">
            <div className="px-4 pt-2 pb-4 space-y-2 flex flex-col">
              <Link href="/dashboard">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-gray-700 font-normal"
                >
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
              <Link href="/reports">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-gray-700 font-normal"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Reports
                </Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Attendance History
        </h1>
        <p className="text-gray-600 mb-8">
          Every day you have checked in, most recent first.
        </p>

        {/* Filters */}
        <Card className="p-4 bg-white mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label
                htmlFor="history-month"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Month
              </label>
              <select
                id="history-month"
                value={month}
                onChange={(e) =>
                  setMonth(
                    e.target.value === "all" ? "all" : Number(e.target.value),
                  )
                }
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">Whole year</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="history-year"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Year
              </label>
              <select
                id="history-year"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card className="p-4 bg-white">
            <p className="text-sm text-gray-600 mb-1">Paid days</p>
            <p className="text-2xl font-bold text-gray-900">{paidDays}</p>
            <p className="text-xs text-gray-500 mt-1">
              {workedDays} worked · {offDays.length} off/holiday
              {markedDays > 0 && ` · ${markedDays} leave`}
            </p>
          </Card>
          <Card className="p-4 bg-white">
            <p className="text-sm text-gray-600 mb-1">Total hours</p>
            <p className="text-2xl font-bold text-blue-600">
              {formatHours(totalHours)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {formatHours(totalRegular)} working ·{" "}
              {formatHours(totalOvertime)} overtime
            </p>
          </Card>
          <Card className="p-4 bg-white">
            <p className="text-sm text-gray-600 mb-1">Overtime hours</p>
            <p className="text-2xl font-bold text-blue-600">
              {formatHours(totalOvertime)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Beyond {formatHours(standardHours)} a day · all hours on a
              weekly off or holiday
            </p>
          </Card>
          <Card className="p-4 bg-white">
            <p className="text-sm text-gray-600 mb-1">Late days</p>
            <p className="text-2xl font-bold text-yellow-600">
              {records.filter((r) => r.status === "late").length}
            </p>
          </Card>
          <Card className="p-4 bg-white">
            <p className="text-sm text-gray-600 mb-1">Missing check-out</p>
            <p className="text-2xl font-bold text-orange-600">{openDays}</p>
            {openDays > 0 && (
              <p className="text-xs text-gray-500 mt-1">Use Edit to fix</p>
            )}
          </Card>
        </div>

        {/* Add a day */}
        <div className="mb-4">
          {showAdd ? (
            <Card className="p-4 bg-white">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label
                    htmlFor="add-date"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Date
                  </label>
                  <Input
                    id="add-date"
                    type="date"
                    value={addDate}
                    onChange={(e) => setAddDate(e.target.value)}
                    className="w-auto"
                  />
                </div>
                <div>
                  <label
                    htmlFor="add-type"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Type
                  </label>
                  <select
                    id="add-type"
                    value={draft.dayType}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        dayType: e.target.value as DayType,
                      }))
                    }
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {DAY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {DAY_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                {(draft.dayType === "work" || draft.dayType === "wfh") && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Check in
                      </label>
                      <Input
                        type="time"
                        value={draft.checkIn}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, checkIn: e.target.value }))
                        }
                        className="w-auto"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Check out
                      </label>
                      <Input
                        type="time"
                        value={draft.checkOut}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, checkOut: e.target.value }))
                        }
                        className="w-auto"
                      />
                    </div>
                  </>
                )}
                <Button
                  onClick={() => addDate && saveDay(addDate)}
                  disabled={!addDate || isSaving}
                  className="!w-auto bg-blue-600 hover:bg-blue-700"
                >
                  {isSaving ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowAdd(false)}
                  className="!w-auto"
                >
                  Cancel
                </Button>
              </div>
            </Card>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                setShowAdd(true);
                setDraft({
                  checkIn: "",
                  checkOut: "",
                  dayType: "leave",
                  note: "",
                });
              }}
              className="!w-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add day / mark leave
            </Button>
          )}
        </div>

        {/* Table */}
        <Card className="bg-white overflow-hidden">
          {isLoading ? (
            <p className="p-4 lg:p-8 text-center text-gray-500">Loading…</p>
          ) : records.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-900 font-medium mb-1">
                No attendance recorded
              </p>
              <p className="text-gray-500 text-sm">
                Nothing for{" "}
                {month === "all"
                  ? year
                  : `${MONTHS[(month as number) - 1]} ${year}`}
                .
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">
                      Date
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">
                      Check in
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">
                      Check out
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">
                      Break
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">
                      Working hours
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">
                      Overtime hours
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">
                      Total hours
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">
                      Status
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 whitespace-nowrap">
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
                    return (
                      <Fragment key={record._id || record.date}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="font-medium text-gray-900">
                              {label}
                            </span>
                            <span className="ml-2 text-xs text-gray-500">
                              {weekday}
                            </span>
                            {record.correctedManually && (
                              <span
                                title="Edited by hand"
                                className="ml-2 text-xs text-gray-400"
                              >
                                edited
                              </span>
                            )}
                            {offLabel && record.checkInTime && (
                              <span
                                title="Paid day off — all hours count as overtime"
                                className="ml-2 text-xs text-purple-600"
                              >
                                {offLabel.toLowerCase()}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-gray-700 whitespace-nowrap">
                            {formatTime(record.checkInTime)}
                          </td>
                          <td className="px-6 py-4 text-gray-700 whitespace-nowrap">
                            {formatTime(record.checkOutTime)}
                          </td>
                          <td className="px-6 py-4 text-gray-700 whitespace-nowrap">
                            {hasHours ? formatDuration(record.breakMinutes || 0) : "—"}
                          </td>
                          <td className="px-6 py-4 text-gray-700 whitespace-nowrap">
                            {formatHours(split?.regular)}
                          </td>
                          <td
                            className={`px-6 py-4 whitespace-nowrap ${
                              split && split.overtime > 0
                                ? "font-medium text-blue-600"
                                : "text-gray-400"
                            }`}
                          >
                            {formatHours(split?.overtime)}
                          </td>
                          <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                            {formatHours(record.hoursWorked)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <StatusBadge record={record} offLabel={offLabel} />
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() =>
                                isEditing
                                  ? setEditingDate(null)
                                  : openEditor(record)
                              }
                              className="text-sm text-blue-600 hover:underline"
                            >
                              {isEditing ? "Close" : "Edit"}
                            </button>
                          </td>
                        </tr>

                        {isEditing && (
                          <tr className="bg-blue-50/40">
                            <td colSpan={9} className="px-6 py-5">
                              <div className="flex flex-wrap items-end gap-3">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Type
                                  </label>
                                  <select
                                    value={draft.dayType}
                                    onChange={(e) =>
                                      setDraft((d) => ({
                                        ...d,
                                        dayType: e.target.value as DayType,
                                      }))
                                    }
                                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                  >
                                    {DAY_TYPES.map((t) => (
                                      <option key={t} value={t}>
                                        {DAY_TYPE_LABELS[t]}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {(draft.dayType === "work" ||
                                  draft.dayType === "wfh") && (
                                  <>
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Check in
                                      </label>
                                      <Input
                                        type="time"
                                        value={draft.checkIn}
                                        onChange={(e) =>
                                          setDraft((d) => ({
                                            ...d,
                                            checkIn: e.target.value,
                                          }))
                                        }
                                        className="w-auto"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Check out
                                      </label>
                                      <Input
                                        type="time"
                                        value={draft.checkOut}
                                        onChange={(e) =>
                                          setDraft((d) => ({
                                            ...d,
                                            checkOut: e.target.value,
                                          }))
                                        }
                                        className="w-auto"
                                      />
                                    </div>
                                  </>
                                )}

                                <div className="flex-1 min-w-[200px]">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Note
                                  </label>
                                  <Input
                                    value={draft.note}
                                    maxLength={500}
                                    placeholder="Optional"
                                    onChange={(e) =>
                                      setDraft((d) => ({
                                        ...d,
                                        note: e.target.value,
                                      }))
                                    }
                                    className="w-full"
                                  />
                                </div>

                                <Button
                                  onClick={() => saveDay(record.date)}
                                  disabled={isSaving}
                                  className="!w-auto bg-blue-600 hover:bg-blue-700"
                                >
                                  {isSaving ? "Saving..." : "Save"}
                                </Button>
                                {record._id && (
                                  <Button
                                    variant="outline"
                                    onClick={() => deleteDay(record.date)}
                                    disabled={isSaving}
                                    className="!w-auto text-red-600 hover:text-red-700"
                                  >
                                    Delete
                                  </Button>
                                )}
                              </div>
                              {record.note && !isSaving && (
                                <p className="mt-3 text-xs text-gray-500">
                                  Saved note: {record.note}
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td
                      colSpan={3}
                      className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600"
                    >
                      Total · {paidDays} paid {paidDays === 1 ? "day" : "days"}
                    </td>
                    <td className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">
                      {formatDuration(totalBreak)}
                    </td>
                    <td className="px-6 py-3 font-semibold text-gray-900 whitespace-nowrap">
                      {formatHours(totalRegular)}
                    </td>
                    <td className="px-6 py-3 font-semibold text-blue-600 whitespace-nowrap">
                      {formatHours(totalOvertime)}
                    </td>
                    <td className="px-6 py-3 font-semibold text-gray-900 whitespace-nowrap">
                      {formatHours(totalHours)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <RequireAuth>
      <History />
    </RequireAuth>
  );
}
