"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/require-auth";
import { formatDuration, totalBreakMinutes } from "@/lib/attendance";
import {
  Clock,
  LogOut,
  Calendar,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Menu,
  X,
} from "lucide-react";

interface TodayAttendance {
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  status: string;
  hoursWorked?: number;
  breaks?: { start: string; end?: string }[];
  breakMinutes?: number;
}

interface AttendanceStats {
  totalPresent: number;
  totalAbsent: number;
  totalLate: number;
  totalOvertime: number;
  averageHoursWorked: number;
}

function Dashboard() {
  const [today, setToday] = useState<TodayAttendance | null>(null);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [, setIsLoading] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isTogglingBreak, setIsTogglingBreak] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const { user, token, logout } = useAuth();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [todayRes, statsRes] = await Promise.all([
        fetch("/api/attendance/today", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/attendance/stats", {
          headers: { Authorization: `Bearer ${token}` },
        }),
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

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return "—";
    return new Date(isoString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const onBreak = !!today?.breaks?.some((b) => !b.end);

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

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
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
            <span className="text-sm text-gray-600">Welcome, {user?.name}</span>
            <Link href="/history">
              <Button variant="outline" size="sm">
                History
              </Button>
            </Link>
            <Link href="/reports">
              <Button variant="outline" size="sm">
                Reports
              </Button>
            </Link>
            <Link href="/settings">
              <Button variant="outline" size="sm">
                Settings
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="text-red-600 hover:text-red-700"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 shadow-lg">
            <div className="px-4 pt-2 pb-4 space-y-2 flex flex-col">
              <span className="text-sm text-gray-600 py-2 px-4 font-medium">
                Welcome, {user?.name}
              </span>
              <Link href="/history">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-gray-700 font-normal"
                >
                  History
                </Button>
              </Link>
              <Link href="/reports">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-gray-700 font-normal"
                >
                  Reports
                </Button>
              </Link>
              <Link href="/settings">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-gray-700 font-normal"
                >
                  Settings
                </Button>
              </Link>
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        )}
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Today's Attendance Card */}
        <div className="mb-8">
          <Card className="p-4 lg:p-8 bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Today&apos;s Attendance
                </h1>
                <p className="text-gray-600">
                  {formatDate(today?.date || new Date().toISOString())}
                </p>
              </div>
              <div className="flex items-center">
                {today?.checkInTime && !today?.checkOutTime && onBreak && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div>
                    <span className="text-orange-600 font-medium">
                      On Break
                    </span>
                  </div>
                )}
                {today?.checkInTime && !today?.checkOutTime && !onBreak && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-green-600 font-medium">
                      Currently Clocked In
                    </span>
                  </div>
                )}
                {today?.checkOutTime && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="text-green-600 font-medium">
                      Completed
                    </span>
                  </div>
                )}
                {!today?.checkInTime && (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-gray-400" />
                    <span className="text-gray-600 font-medium">
                      Not Checked In
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Check In Time</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatTime(today?.checkInTime)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Check Out Time</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatTime(today?.checkOutTime)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Hours Worked</p>
                <p className="text-2xl font-bold text-gray-900">
                  {today?.hoursWorked || 0} hrs
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Break Time</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatDuration(
                    today?.breakMinutes ?? totalBreakMinutes(today?.breaks),
                  )}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Status</p>
                <p
                  className={`text-2xl font-bold capitalize ${
                    today?.status === "present"
                      ? "text-green-600"
                      : today?.status === "late"
                        ? "text-yellow-600"
                        : "text-red-600"
                  }`}
                >
                  {today?.status || "absent"}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                onClick={handleCheckIn}
                disabled={isCheckingIn || !!today?.checkInTime}
                size="lg"
                className="w-full sm:w-auto bg-green-600 hover:bg-green-700 disabled:bg-gray-300"
              >
                {isCheckingIn ? "Checking In..." : "Check In"}
              </Button>

              <Button
                onClick={handleCheckOut}
                disabled={
                  isCheckingOut || !today?.checkInTime || !!today?.checkOutTime
                }
                size="lg"
                className="w-full sm:w-auto bg-red-600 hover:bg-red-700 disabled:bg-gray-300"
              >
                {isCheckingOut ? "Checking Out..." : "Check Out"}
              </Button>
            </div>
          </Card>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card className="p-6 bg-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Present Days</p>
                <p className="text-3xl font-bold text-green-600">
                  {stats?.totalPresent || 0}
                </p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-600 opacity-20" />
            </div>
          </Card>

          <Card className="p-6 bg-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Late Days</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {stats?.totalLate || 0}
                </p>
              </div>
              <AlertCircle className="w-8 h-8 text-yellow-600 opacity-20" />
            </div>
          </Card>

          <Card className="p-6 bg-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Absent Days</p>
                <p className="text-3xl font-bold text-red-600">
                  {stats?.totalAbsent || 0}
                </p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-600 opacity-20" />
            </div>
          </Card>

          <Card className="p-6 bg-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Overtime Hours</p>
                <p className="text-3xl font-bold text-blue-600">
                  {stats?.totalOvertime || 0}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-600 opacity-20" />
            </div>
          </Card>

          <Card className="p-6 bg-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Avg Hours/Day</p>
                <p className="text-3xl font-bold text-purple-600">
                  {(stats?.averageHoursWorked || 0).toFixed(1)}h
                </p>
              </div>
              <Calendar className="w-8 h-8 text-purple-600 opacity-20" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}
