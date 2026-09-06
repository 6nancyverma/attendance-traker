"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/require-auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";
import {
  DAY_LABELS,
  DEFAULT_WORK_SCHEDULE,
  formatTimeLabel,
  getStandardHours,
  type WorkSchedule,
} from "@/lib/work-schedule";
import { Clock, LayoutDashboard, Menu, X } from "lucide-react";
import {
  isValidHolidayDate,
  MAX_HOLIDAY_NAME,
  normalizeHolidays,
  type Holiday,
} from "@/lib/holidays";

function Settings() {
  const { user, token } = useAuth();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [schedule, setSchedule] = useState<WorkSchedule>(DEFAULT_WORK_SCHEDULE);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Holidays: paid days off that show in history and never count as absent.
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [isSavingHolidays, setIsSavingHolidays] = useState(false);
  const [holidayError, setHolidayError] = useState<string | null>(null);

  const loadHolidays = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/settings/holidays", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) setHolidays(normalizeHolidays(await res.json()));
    } catch {
      // Leave the list empty; adding still works.
    }
  }, [token]);

  useEffect(() => {
    loadHolidays();
  }, [loadHolidays]);

  const addHoliday = () => {
    setHolidayError(null);
    if (!isValidHolidayDate(holidayDate)) {
      setHolidayError("Pick a date for the holiday.");
      return;
    }
    setHolidays((prev) =>
      normalizeHolidays([
        ...prev.filter((h) => h.date !== holidayDate),
        { date: holidayDate, name: holidayName.trim() || "Holiday" },
      ]),
    );
    setHolidayDate("");
    setHolidayName("");
  };

  const removeHoliday = (date: string) => {
    setHolidayError(null);
    setHolidays((prev) => prev.filter((h) => h.date !== date));
  };

  const handleSaveHolidays = async () => {
    setHolidayError(null);
    setIsSavingHolidays(true);
    try {
      const res = await fetch("/api/settings/holidays", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ holidays }),
      });
      const data = await res.json();
      if (!res.ok) {
        setHolidayError(data.error || "Could not save your holidays.");
        return;
      }
      setHolidays(normalizeHolidays(data));
      toast({
        title: "Holidays saved",
        description: "They now show in history and count as paid days.",
      });
    } catch {
      setHolidayError("An error occurred. Please try again.");
    } finally {
      setIsSavingHolidays(false);
    }
  };

  const loadSchedule = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/settings/schedule", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setSchedule((await res.json()) as WorkSchedule);
    } catch {
      // Keep the defaults on screen; saving still works.
    } finally {
      setIsLoadingSchedule(false);
    }
  }, [token]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const toggleDay = (day: number) => {
    setScheduleError(null);
    setSchedule((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter((d) => d !== day)
        : [...prev.workingDays, day].sort(),
    }));
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setScheduleError(null);

    if (schedule.workingDays.length === 0) {
      setScheduleError("Select at least one working day.");
      return;
    }
    if (schedule.startTime === schedule.endTime) {
      setScheduleError("Start and end time cannot be the same.");
      return;
    }

    setIsSavingSchedule(true);
    try {
      const res = await fetch("/api/settings/schedule", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(schedule),
      });
      const data = await res.json();

      if (!res.ok) {
        setScheduleError(data.error || "Could not save your schedule.");
        toast({
          title: "Schedule not saved",
          description: data.error || "Please try again.",
          variant: "destructive",
        });
        return;
      }

      setSchedule(data as WorkSchedule);
      toast({
        title: "Schedule saved",
        description: "Late and overtime will now use these hours.",
      });
    } catch {
      setScheduleError("An error occurred. Please try again.");
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Could not update your password.");
        toast({
          title: "Password not changed",
          description: data.error || "Please try again.",
          variant: "destructive",
        });
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Password updated",
        description: data.message || "Your password has been changed.",
      });
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

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
          <div className="hidden md:flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                <LayoutDashboard className="w-4 h-4 mr-2" />
                Dashboard
              </Button>
            </Link>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 shadow-lg">
            <div className="px-4 pt-2 pb-4 space-y-2 flex flex-col">
              <Link href="/dashboard">
                <Button variant="ghost" className="w-full justify-start text-gray-700 font-normal">
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Settings</h1>

        <Card className="p-6 bg-white mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Account</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500 mb-1">Name</dt>
              <dd className="text-gray-900 font-medium">{user?.name}</dd>
            </div>
            <div>
              <dt className="text-gray-500 mb-1">Email</dt>
              <dd className="text-gray-900 font-medium">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-gray-500 mb-1">Role</dt>
              <dd className="text-gray-900 font-medium capitalize">
                {user?.role}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="p-6 bg-white mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Work schedule
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            These hours decide whether a check-in counts as late and when extra
            time becomes overtime. Absent days are counted from your working
            days.
          </p>

          {isLoadingSchedule ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <form onSubmit={handleSaveSchedule} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg">
                <div>
                  <label
                    htmlFor="startTime"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Office start
                  </label>
                  <Input
                    id="startTime"
                    type="time"
                    value={schedule.startTime}
                    onChange={(e) => {
                      setScheduleError(null);
                      setSchedule((p) => ({ ...p, startTime: e.target.value }));
                    }}
                    required
                    className="w-full"
                  />
                </div>

                <div>
                  <label
                    htmlFor="endTime"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Office end
                  </label>
                  <Input
                    id="endTime"
                    type="time"
                    value={schedule.endTime}
                    onChange={(e) => {
                      setScheduleError(null);
                      setSchedule((p) => ({ ...p, endTime: e.target.value }));
                    }}
                    required
                    className="w-full"
                  />
                </div>

                <div>
                  <label
                    htmlFor="breakMinutes"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Break (min)
                  </label>
                  <Input
                    id="breakMinutes"
                    type="number"
                    min={0}
                    max={480}
                    value={schedule.breakMinutes}
                    onChange={(e) => {
                      setScheduleError(null);
                      setSchedule((p) => ({
                        ...p,
                        breakMinutes: Number(e.target.value),
                      }));
                    }}
                    className="w-full"
                  />
                </div>

                <div>
                  <label
                    htmlFor="graceMinutes"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Grace (min)
                  </label>
                  <Input
                    id="graceMinutes"
                    type="number"
                    min={0}
                    max={240}
                    value={schedule.graceMinutes}
                    onChange={(e) => {
                      setScheduleError(null);
                      setSchedule((p) => ({
                        ...p,
                        graceMinutes: Number(e.target.value),
                      }));
                    }}
                    className="w-full"
                  />
                </div>
              </div>

              <div>
                <span className="block text-sm font-medium text-gray-700 mb-2">
                  Working days
                </span>
                <div className="flex flex-wrap gap-2">
                  {DAY_LABELS.map((label, day) => {
                    const active = schedule.workingDays.includes(day);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleDay(day)}
                        aria-pressed={active}
                        className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                          active
                            ? "border-blue-600 bg-blue-50 text-blue-700 font-medium"
                            : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        {label.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-md bg-gray-50 border border-gray-200 p-4 text-sm text-gray-700">
                <p>
                  Arriving after{" "}
                  <strong>
                    {formatTimeLabel(schedule.startTime)}
                    {schedule.graceMinutes > 0 &&
                      ` + ${schedule.graceMinutes} min grace`}
                  </strong>{" "}
                  is marked <strong>late</strong>.
                </p>
                <p className="mt-1">
                  <strong>{schedule.breakMinutes} minutes</strong> of break are
                  deducted from every completed day. If you track more break
                  time than that, the tracked amount is deducted instead.
                </p>
                <p className="mt-1">
                  That makes a standard day{" "}
                  <strong>{getStandardHours(schedule).toFixed(2)} working hours</strong>
                  {" "}— anything beyond that counts as overtime.
                </p>
              </div>

              {scheduleError && (
                <p role="alert" className="text-sm text-red-600">
                  {scheduleError}
                </p>
              )}

              <Button
                type="submit"
                disabled={isSavingSchedule}
                className="!w-full sm:!w-auto bg-blue-600 hover:bg-blue-700"
              >
                {isSavingSchedule ? "Saving..." : "Save schedule"}
              </Button>
            </form>
          )}
        </Card>

        <Card className="p-6 bg-white mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Holidays</h2>
          <p className="text-sm text-gray-600 mb-6">
            Public holidays are paid days off. They appear in your history,
            are never counted as absent, and any hours you work on one count
            as overtime.
          </p>

          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label
                htmlFor="holiday-date"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Date
              </label>
              <Input
                id="holiday-date"
                type="date"
                value={holidayDate}
                onChange={(e) => {
                  setHolidayError(null);
                  setHolidayDate(e.target.value);
                }}
                className="w-auto"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label
                htmlFor="holiday-name"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Name
              </label>
              <Input
                id="holiday-name"
                value={holidayName}
                maxLength={MAX_HOLIDAY_NAME}
                placeholder="e.g. Diwali"
                onChange={(e) => {
                  setHolidayError(null);
                  setHolidayName(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addHoliday();
                  }
                }}
                className="w-full"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={addHoliday}
              className="!w-auto"
            >
              Add
            </Button>
          </div>

          {holidays.length === 0 ? (
            <p className="text-sm text-gray-500 mb-4">No holidays yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 mb-4">
              {holidays.map((h) => (
                <li
                  key={h.date}
                  className="flex items-center justify-between px-4 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium text-gray-900">
                      {new Date(`${h.date}T00:00:00`).toLocaleDateString(
                        "en-US",
                        { weekday: "short", day: "numeric", month: "short", year: "numeric" },
                      )}
                    </span>
                    <span className="ml-3 text-gray-600">{h.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeHoliday(h.date)}
                    className="text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {holidayError && (
            <p role="alert" className="text-sm text-red-600 mb-3">
              {holidayError}
            </p>
          )}

          <Button
            type="button"
            onClick={handleSaveHolidays}
            disabled={isSavingHolidays}
            className="!w-full sm:!w-auto bg-blue-600 hover:bg-blue-700"
          >
            {isSavingHolidays ? "Saving..." : "Save holidays"}
          </Button>
        </Card>

        <Card className="p-6 bg-white">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Change password
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            You&apos;ll stay signed in on this device. Any outstanding reset
            links will stop working.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div>
              <label
                htmlFor="currentPassword"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Current password
              </label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="••••••••"
                required
                className="w-full"
              />
            </div>

            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                New password
              </label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="••••••••"
                required
                minLength={MIN_PASSWORD_LENGTH}
                className="w-full"
              />
              <p className="mt-1 text-xs text-gray-500">
                At least {MIN_PASSWORD_LENGTH} characters.
              </p>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Confirm new password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="••••••••"
                required
                className="w-full"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={isSaving}
              className="!w-full sm:!w-auto bg-blue-600 hover:bg-blue-700"
            >
              {isSaving ? "Updating..." : "Update password"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <Settings />
    </RequireAuth>
  );
}
