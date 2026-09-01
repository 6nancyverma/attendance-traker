"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/require-auth";
import { Clock, LogOut, Download, Calendar } from "lucide-react";

function Reports() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [isDownloading, setIsDownloading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const { user, token, logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const downloadReport = async (type: "monthly" | "yearly") => {
    setIsDownloading(true);
    try {
      const params = new URLSearchParams({
        year: selectedYear.toString(),
        type,
      });

      if (type === "monthly") {
        params.append("month", selectedMonth.toString());
      }

      const response = await fetch(`/api/reports/generate?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to generate report");
      }

      // Get the CSV content
      const csv = await response.text();

      // Create blob and download
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        type === "monthly"
          ? `attendance-report-${selectedYear}-${selectedMonth}.csv`
          : `attendance-report-${selectedYear}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: `${type === "monthly" ? "Monthly" : "Yearly"} report downloaded successfully`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download report",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const months = [
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" },
  ];

  const years = Array.from({ length: 5 }, (_, i) => {
    const year = new Date().getFullYear() - i;
    return year;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-8 h-8 text-blue-600" />
            <span className="text-xl font-bold text-gray-900">AttendanceApp</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Welcome, {user?.name}</span>
            <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
              Dashboard
            </Button>
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
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Page Title */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Attendance Reports</h1>
          <p className="text-gray-600 text-lg">
            Download your attendance reports in CSV format for detailed analysis
          </p>
        </div>

        {/* Monthly Report */}
        <Card className="p-8 bg-white mb-8">
          <div className="flex items-center gap-3 mb-6">
            <Calendar className="w-6 h-6 text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-900">Monthly Report</h2>
          </div>

          <p className="text-gray-600 mb-6">
            Download a detailed report of your attendance for a specific month
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {months.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-900">
              <strong>Report includes:</strong> Check-in/out times, hours worked, overtime, late arrivals, and absences
            </p>
          </div>

          <Button
            onClick={() => downloadReport("monthly")}
            disabled={isDownloading}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 w-full md:w-auto"
          >
            <Download className="w-5 h-5 mr-2" />
            {isDownloading ? "Downloading..." : "Download Monthly Report"}
          </Button>
        </Card>

        {/* Yearly Report */}
        <Card className="p-8 bg-white">
          <div className="flex items-center gap-3 mb-6">
            <Calendar className="w-6 h-6 text-green-600" />
            <h2 className="text-2xl font-bold text-gray-900">Yearly Report</h2>
          </div>

          <p className="text-gray-600 mb-6">
            Download a comprehensive report of your entire year&apos;s attendance and statistics
          </p>

          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-green-900">
              <strong>Report includes:</strong> Complete annual summary with month-by-month breakdowns,
              total working hours, overtime calculations, and attendance statistics
            </p>
          </div>

          <Button
            onClick={() => downloadReport("yearly")}
            disabled={isDownloading}
            size="lg"
            className="bg-green-600 hover:bg-green-700 w-full md:w-auto"
          >
            <Download className="w-5 h-5 mr-2" />
            {isDownloading ? "Downloading..." : "Download Yearly Report"}
          </Button>
        </Card>

        {/* Recent Downloads Info */}
        <Card className="p-8 bg-gradient-to-br from-gray-50 to-gray-100 mt-12">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">About Your Reports</h3>
          <ul className="space-y-3 text-gray-700">
            <li className="flex items-start gap-3">
              <span className="text-blue-600 font-bold mt-1">•</span>
              <span>
                Reports are generated in CSV format for easy opening in Excel, Google Sheets, or
                other applications
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-blue-600 font-bold mt-1">•</span>
              <span>Each report includes detailed records of all your check-ins and check-outs</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-blue-600 font-bold mt-1">•</span>
              <span>Automatically calculates hours worked, overtime, and late arrivals</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-blue-600 font-bold mt-1">•</span>
              <span>Perfect for payroll, performance reviews, or personal record-keeping</span>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <RequireAuth>
      <Reports />
    </RequireAuth>
  );
}
