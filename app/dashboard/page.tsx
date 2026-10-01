"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/require-auth";
import { AppShell } from "@/components/app-shell";
import {
  formatDuration,
  formatHours,
  totalBreakMinutes,
} from "@/lib/attendance";
import {
  formatDateKey,
  formatIstTime,
  istMinutesOfDay,
  istYearMonth,
  toLocalDateKey,
} from "@/lib/date";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Coffee,
  Gauge,
  Loader2,
  LogIn,
  LogOut,
  Play,
  Timer,
  TrendingUp,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TodayAttendance {
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  status: string;
  hoursWorked?: number;
  breaks?: { start: string; end?: string }[];
  breakMinutes?: number;
  /** True when today is not one of the user's working days. */
  weeklyOff?: boolean;
  /** Name of today's holiday from the user's list, if any. */
  holiday?: string | null;
}

interface AttendanceStats {
  totalPresent: number;
  totalAbsent: number;
  totalLate: number;
  totalOvertime: number;
  totalOvertimeHours?: number;
  averageHoursWorked: number;
}

function greeting(now: Date): string {
  const minutes = istMinutesOfDay(now);
  if (minutes < 12 * 60) return "Good morning";
  if (minutes < 17 * 60) return "Good afternoon";
  return "Good evening";
}

/** Minutes worked so far today: elapsed since check-in minus breaks. */
function liveWorkedMinutes(today: TodayAttendance, now: Date): number {
  if (!today.checkInTime) return 0;
  const start = new Date(today.checkInTime).getTime();
  const end = today.checkOutTime
    ? new Date(today.checkOutTime).getTime()
    : now.getTime();
  const breakMs = (today.breaks ?? []).reduce((sum, b) => {
    const s = new Date(b.start).getTime();
    const e = b.end ? new Date(b.end).getTime() : now.getTime();
    return e > s ? sum + (e - s) : sum;
  }, 0);
  return Math.max(0, (end - start - breakMs) / 60000);
}

function TodayTile({
  icon: Icon,
  label,
  value,
  tone = "slate",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone?: "slate" | "green" | "red" | "orange" | "blue";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-green-100 text-green-600",
    red: "bg-red-100 text-red-600",
    orange: "bg-orange-100 text-orange-600",
    blue: "bg-blue-100 text-blue-600",
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 sm:p-4">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          tones[tone]
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="truncate text-base font-semibold text-gray-900 sm:text-lg">
          {value}
        </p>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  gradient,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  gradient: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <span
        className={cn(
          "mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm",
          gradient
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      <span
        className={cn(
          "pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br opacity-10 transition group-hover:opacity-20",
          gradient
        )}
      />
    </div>
  );
}

function Dashboard() {
  const [today, setToday] = useState<TodayAttendance | null>(null);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isTogglingBreak, setIsTogglingBreak] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const { toast } = useToast();
  const { user, token } = useAuth();

  // Live clock and running timer.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [todayRes, statsRes] = await Promise.all([
        fetch("/api/attendance/today", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        // Dashboard stats cover the current month (IST); without a month the
        // API totals the whole year.
        fetch(
          `/api/attendance/stats?${new URLSearchParams({
            year: String(istYearMonth().year),
            month: String(istYearMonth().month),
          })}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }
        ),
      ]);

      if (todayRes.ok) {
        setToday(await todayRes.json());
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleCheckIn = async () => {
    setIsCheckingIn(true);
    try {
      const response = await fetch("/api/attendance/checkin", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || error.error,
          variant: "destructive",
        });
        return;
      }

      const data = await response.json();
      toast({
        title: "Success",
        description: data.message,
      });
      fetchData();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to check in",
        variant: "destructive",
      });
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleCheckOut = async () => {
    setIsCheckingOut(true);
    try {
      const response = await fetch("/api/attendance/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || error.error,
          variant: "destructive",
        });
        return;
      }

      const data = await response.json();
      toast({
        title: "Success",
        description: data.message,
      });
      fetchData();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to check out",
        variant: "destructive",
      });
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleBreak = async (action: "start" | "end") => {
    setIsTogglingBreak(true);
    try {
      const response = await fetch("/api/attendance/break", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();

      if (!response.ok) {
        toast({
          title: "Couldn't update break",
          description: data.error || "Please try again.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: data.message,
        description:
          action === "end"
            ? "Break time is excluded from your hours."
            : "Remember to end your break when you're back.",
      });
      fetchData();
    } catch {
      toast({
        title: "Error",
        description: "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsTogglingBreak(false);
    }
  };

  const checkedIn = !!today?.checkInTime;
  const checkedOut = !!today?.checkOutTime;
  const working = checkedIn && !checkedOut;
  const onBreak = working && !!today?.breaks?.some((b) => !b.end);
  // A paid day off: a listed holiday, or a day outside the working days.
  const offLabel = today?.holiday
    ? `Holiday · ${today.holiday}`
    : today?.weeklyOff
      ? "Weekly off"
      : null;

  const workedMinutes = today ? liveWorkedMinutes(today, now) : 0;
  const breakMinutes = checkedOut
    ? (today?.breakMinutes ?? totalBreakMinutes(today?.breaks))
    : totalBreakMinutes(today?.breaks);

  const state: { label: string; dot: string; tone: string } = onBreak
    ? { label: "On break", dot: "bg-orange-400", tone: "text-orange-100" }
    : working
      ? { label: "Clocked in", dot: "bg-green-400", tone: "text-green-100" }
      : checkedOut
        ? { label: "Day complete", dot: "bg-white", tone: "text-blue-100" }
        : offLabel
          ? { label: offLabel, dot: "bg-purple-300", tone: "text-purple-100" }
          : { label: "Not checked in", dot: "bg-white/60", tone: "text-blue-100" };

  const statusTone =
    today?.status === "late"
      ? "orange"
      : today?.status === "present"
        ? "green"
        : "slate";
  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <AppShell>
      {/* Hero: greeting, clock and the main action */}
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 p-5 text-white shadow-xl shadow-blue-600/20 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-indigo-400/20 blur-3xl" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-blue-100">
              {formatDateKey(today?.date || toLocalDateKey(now), {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {greeting(now)}
              {firstName && `, ${firstName}`} 👋
            </h1>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-medium backdrop-blur">
              <span className="relative flex h-2.5 w-2.5">
                {working && (
                  <span
                    className={cn(
                      "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                      state.dot
                    )}
                  />
                )}
                <span
                  className={cn(
                    "relative inline-flex h-2.5 w-2.5 rounded-full",
                    state.dot
                  )}
                />
              </span>
              {state.label}
            </div>
          </div>

          <div className="lg:text-right">
            <p className="text-4xl font-extrabold tabular-nums tracking-tight sm:text-5xl">
              {formatIstTime(now, { seconds: true })}
            </p>
            <p className="mt-1 text-sm text-blue-100">
              {checkedIn ? (
                <>
                  {working ? "Working for " : "Worked "}
                  <span className="font-semibold text-white">
                    {formatDuration(workedMinutes) === "—"
                      ? "0m"
                      : formatDuration(workedMinutes)}
                  </span>
                  {" today"}
                </>
              ) : (
                "India Standard Time"
              )}
            </p>
          </div>
        </div>

        <div className="relative mt-6 flex flex-col gap-3 sm:flex-row">
          {isLoading ? (
            <div className="flex h-12 items-center gap-2 text-blue-100">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading today…
            </div>
          ) : !checkedIn ? (
            <Button
              onClick={handleCheckIn}
              disabled={isCheckingIn}
              size="lg"
              className="h-12 bg-white px-8 text-base font-semibold text-blue-700 shadow-lg hover:bg-blue-50"
            >
              {isCheckingIn ? (
                <Loader2 className="animate-spin" />
              ) : (
                <LogIn />
              )}
              {isCheckingIn ? "Checking in..." : "Check in"}
            </Button>
          ) : working ? (
            <>
              <Button
                onClick={() => handleBreak(onBreak ? "end" : "start")}
                disabled={isTogglingBreak}
                size="lg"
                className={cn(
                  "h-12 px-6 text-base font-semibold shadow-lg",
                  onBreak
                    ? "bg-orange-400 text-white hover:bg-orange-500"
                    : "bg-white/15 text-white ring-1 ring-white/30 backdrop-blur hover:bg-white/25"
                )}
              >
                {isTogglingBreak ? (
                  <Loader2 className="animate-spin" />
                ) : onBreak ? (
                  <Play />
                ) : (
                  <Coffee />
                )}
                {onBreak ? "End break" : "Take a break"}
              </Button>
              <Button
                onClick={handleCheckOut}
                disabled={isCheckingOut}
                size="lg"
                className="h-12 bg-white px-8 text-base font-semibold text-red-600 shadow-lg hover:bg-red-50"
              >
                {isCheckingOut ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <LogOut />
                )}
                {isCheckingOut ? "Checking out..." : "Check out"}
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-white/15 px-4 py-3 text-sm backdrop-blur">
              <CheckCircle2 className="h-5 w-5 text-green-300" />
              You&apos;re done for today. See you tomorrow!
            </div>
          )}
        </div>

        {checkedIn && offLabel && (
          <p className="relative mt-4 text-xs text-purple-100">
            Today is a {today?.holiday ? "holiday" : "weekly off"} — all hours
            count as overtime.
          </p>
        )}
      </section>

      {/* Today at a glance */}
      <section className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <TodayTile
          icon={LogIn}
          label="Check in"
          value={formatIstTime(today?.checkInTime) || "—"}
          tone="green"
        />
        <TodayTile
          icon={LogOut}
          label="Check out"
          value={formatIstTime(today?.checkOutTime) || "—"}
          tone="red"
        />
        <TodayTile
          icon={Timer}
          label="Hours worked"
          value={
            checkedOut
              ? formatHours(today?.hoursWorked)
              : checkedIn
                ? formatDuration(workedMinutes)
                : "—"
          }
          tone="blue"
        />
        <TodayTile
          icon={Coffee}
          label="Break"
          value={formatDuration(breakMinutes)}
          tone="orange"
        />
        <div className="col-span-2 lg:col-span-1">
          <TodayTile
            icon={
              today?.status === "late"
                ? AlertCircle
                : checkedIn
                  ? CheckCircle2
                  : offLabel
                    ? CalendarDays
                    : XCircle
            }
            label="Status"
            value={
              <span className="capitalize">
                {!checkedIn && offLabel
                  ? today?.holiday
                    ? "Holiday"
                    : "Weekly off"
                  : checkedIn
                    ? today?.status
                    : "Not yet"}
              </span>
            }
            tone={statusTone}
          />
        </div>
      </section>

      {/* This month */}
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-gray-900">This month</h2>
        <span className="text-sm text-gray-500">
          {formatDateKey(toLocalDateKey(now), {
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>
      <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={CheckCircle2}
          label="Present"
          value={stats?.totalPresent ?? 0}
          hint="days"
          gradient="from-green-500 to-emerald-600"
        />
        <StatCard
          icon={AlertCircle}
          label="Late"
          value={stats?.totalLate ?? 0}
          hint="days"
          gradient="from-amber-400 to-orange-500"
        />
        <StatCard
          icon={XCircle}
          label="Absent"
          value={stats?.totalAbsent ?? 0}
          hint="days"
          gradient="from-rose-500 to-red-600"
        />
        <StatCard
          icon={TrendingUp}
          label="Overtime"
          value={formatHours(stats?.totalOvertimeHours)}
          hint={`${stats?.totalOvertime ?? 0} ${
            stats?.totalOvertime === 1 ? "day" : "days"
          } with overtime`}
          gradient="from-blue-500 to-indigo-600"
        />
        <div className="col-span-2 md:col-span-1">
          <StatCard
            icon={Gauge}
            label="Avg / day"
            value={formatHours(stats?.averageHoursWorked)}
            hint="hours worked"
            gradient="from-violet-500 to-purple-600"
          />
        </div>
      </section>
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}
