"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/require-auth";
import { Input } from "@/components/ui/input";
import { Calendar, Clock, Download, LayoutDashboard, Plus } from "lucide-react";
import type { AttendanceRecord } from "@/types/api";
import {
  DAY_TYPES,
  DAY_TYPE_LABELS,
  formatDuration,
  type DayType,
} from "@/lib/attendance";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
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

/** ISO timestamp → local "HH:MM" for the edit inputs. */
function toTimeInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

function StatusBadge({ record }: { record: AttendanceRecord }) {
  const dayType = record.dayType ?? "work";
  if (dayType !== "work" && dayType !== "wfh") {
    return (
      <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
        {DAY_TYPE_LABELS[dayType]}
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
        body: JSON.stringify({ date, ...draft }),
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
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
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
  const openDays = records.filter(
    (r) => r.checkInTime && !r.checkOutTime
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
          <div className="flex items-center gap-3">
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
                    e.target.value === "all" ? "all" : Number(e.target.value)
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-white">
            <p className="text-sm text-gray-600 mb-1">Days recorded</p>
            <p className="text-2xl font-bold text-gray-900">{records.length}</p>
          </Card>
          <Card className="p-4 bg-white">
            <p className="text-sm text-gray-600 mb-1">Total hours</p>
            <p className="text-2xl font-bold text-blue-600">
              {totalHours.toFixed(1)}h
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
            <p className="p-8 text-center text-gray-500">Loading…</p>
          ) : records.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-900 font-medium mb-1">
                No attendance recorded
              </p>
              <p className="text-gray-500 text-sm">
                Nothing for{" "}
                {month === "all" ? year : `${MONTHS[(month as number) - 1]} ${year}`}.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Date
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Check in
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Check out
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Hours
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Status
                    </th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.map((record) => {
                    const { weekday, label } = formatDate(record.date);
                    const isEditing = editingDate === record.date;
                    return (
                      <Fragment key={record._id || record.date}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-6 py-4">
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
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {formatTime(record.checkInTime)}
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {formatTime(record.checkOutTime)}
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {typeof record.hoursWorked === "number"
                              ? `${record.hoursWorked.toFixed(2)}h`
                              : "—"}
                            {record.isOvertime && (
                              <span className="ml-2 text-xs font-medium text-blue-600">
                                OT
                              </span>
                            )}
                            {!!record.breakMinutes && (
                              <span className="ml-2 text-xs text-gray-500">
                                ({formatDuration(record.breakMinutes)} break)
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge record={record} />
                          </td>
                          <td className="px-6 py-4 text-right">
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
                            <td colSpan={6} className="px-6 py-5">
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
                                <Button
                                  variant="outline"
                                  onClick={() => deleteDay(record.date)}
                                  disabled={isSaving}
                                  className="!w-auto text-red-600 hover:text-red-700"
                                >
                                  Delete
                                </Button>
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
