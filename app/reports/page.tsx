"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { RequireAuth } from "@/components/require-auth";
import { AppShell, PageHeader } from "@/components/app-shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays,
  CalendarRange,
  Check,
  Clock,
  Download,
  FileText,
  Loader2,
  Printer,
  type LucideIcon,
} from "lucide-react";
import { istYearMonth } from "@/lib/date";
import type { ReportData } from "@/types/report";
import { cn } from "@/lib/utils";

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

function ReportCard({
  icon: Icon,
  title,
  description,
  accent,
  includes,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  accent: "blue" | "emerald";
  includes: string[];
  children: ReactNode;
  action: ReactNode;
}) {
  const accents = {
    blue: {
      icon: "from-blue-500 to-indigo-600 shadow-blue-500/30",
      check: "text-blue-600 bg-blue-50",
      bar: "from-blue-500 to-indigo-600",
    },
    emerald: {
      icon: "from-emerald-500 to-teal-600 shadow-emerald-500/30",
      check: "text-emerald-600 bg-emerald-50",
      bar: "from-emerald-500 to-teal-600",
    },
  }[accent];

  return (
    <section className="relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
      <span
        className={cn(
          "absolute inset-x-0 top-0 h-1 bg-gradient-to-r",
          accents.bar
        )}
      />
      <div className="mb-4 flex items-start gap-4">
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg",
            accents.icon
          )}
        >
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>

      <div className="mb-5">{children}</div>

      <ul className="mb-6 space-y-2">
        {includes.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                accents.check
              )}
            >
              <Check className="h-3 w-3" />
            </span>
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-auto">{action}</div>
    </section>
  );
}

function Reports() {
  const [monthlyYear, setMonthlyYear] = useState(() => istYearMonth().year);
  const [selectedMonth, setSelectedMonth] = useState(() => istYearMonth().month);
  const [yearlyYear, setYearlyYear] = useState(() => istYearMonth().year);
  const [isDownloading, setIsDownloading] = useState<
    "monthly" | "yearly" | null
  >(null);
  const { toast } = useToast();
  const { token } = useAuth();

  const downloadReport = async (type: "monthly" | "yearly") => {
    setIsDownloading(type);
    try {
      const params = new URLSearchParams({
        year: String(type === "monthly" ? monthlyYear : yearlyYear),
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

      const data = (await response.json()) as ReportData;
      // jsPDF is only needed here, so load it on demand.
      const { buildReportPdf, reportFileName } = await import(
        "@/lib/report-pdf"
      );
      buildReportPdf(data).save(reportFileName(data));

      toast({
        title: "Report ready",
        description: `Your ${type} report for ${data.periodLabel} has been downloaded.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download report",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(null);
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => istYearMonth().year - i);

  const yearSelect = (
    id: string,
    value: number,
    onChange: (year: number) => void
  ) => (
    <Select value={value.toString()} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger id={id} className="h-11 w-full">
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
  );

  const downloadButton = (type: "monthly" | "yearly", className: string) => (
    <Button
      onClick={() => downloadReport(type)}
      disabled={!!isDownloading}
      size="lg"
      className={cn("h-12 w-full text-base font-semibold sm:w-full", className)}
    >
      {isDownloading === type ? (
        <Loader2 className="animate-spin" />
      ) : (
        <Download />
      )}
      {isDownloading === type ? "Generating PDF..." : "Download PDF"}
    </Button>
  );

  return (
    <AppShell>
      <PageHeader
        title="Reports"
        description="Beautiful, print-ready PDF reports of your attendance. All times are in Indian Standard Time."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <ReportCard
          icon={CalendarDays}
          title="Monthly report"
          description="A detailed day-by-day record for one month."
          accent="blue"
          includes={[
            "Summary cards: paid days, late days, hours and overtime",
            "Colour-coded daily log with check-in/out and breaks",
            "Weekly offs, holidays and leave included",
          ]}
          action={downloadButton("monthly", "bg-blue-600 hover:bg-blue-700")}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="report-month"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Month
              </label>
              <Select
                value={selectedMonth.toString()}
                onValueChange={(val) => setSelectedMonth(parseInt(val))}
              >
                <SelectTrigger id="report-month" className="h-11 w-full">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((label, i) => (
                    <SelectItem key={label} value={String(i + 1)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label
                htmlFor="report-month-year"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Year
              </label>
              {yearSelect("report-month-year", monthlyYear, setMonthlyYear)}
            </div>
          </div>
        </ReportCard>

        <ReportCard
          icon={CalendarRange}
          title="Yearly report"
          description="Your whole year at a glance, month by month."
          accent="emerald"
          includes={[
            "Annual summary of days, hours and overtime",
            "Month-by-month breakdown table",
            "Full daily log for the year",
          ]}
          action={downloadButton(
            "yearly",
            "bg-emerald-600 hover:bg-emerald-700"
          )}
        >
          <label
            htmlFor="report-year"
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            Year
          </label>
          {yearSelect("report-year", yearlyYear, setYearlyYear)}
        </ReportCard>
      </div>

      <section className="mt-6 grid gap-3 rounded-2xl border border-gray-100 bg-white/70 p-5 shadow-sm sm:grid-cols-3 sm:p-6">
        {[
          {
            icon: FileText,
            title: "A4 PDF",
            text: "Clean layout that prints and shares well.",
          },
          {
            icon: Clock,
            title: "IST times",
            text: "Every time is shown in Indian Standard Time.",
          },
          {
            icon: Printer,
            title: "Ready for payroll",
            text: "Totals for working hours, overtime and paid days.",
          },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{title}</p>
              <p className="text-sm text-gray-600">{text}</p>
            </div>
          </div>
        ))}
      </section>
    </AppShell>
  );
}

export default function ReportsPage() {
  return (
    <RequireAuth>
      <Reports />
    </RequireAuth>
  );
}
