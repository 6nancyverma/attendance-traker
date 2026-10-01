"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { BrandMark } from "@/components/app-shell";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Coffee,
  FileText,
  LogIn,
  type LucideIcon,
} from "lucide-react";

const FEATURES: {
  icon: LucideIcon;
  title: string;
  text: string;
  gradient: string;
}[] = [
  {
    icon: Clock,
    title: "One-tap check-in",
    text: "Check in and out instantly, with a live timer for your day.",
    gradient: "from-blue-500 to-indigo-600",
  },
  {
    icon: Coffee,
    title: "Break tracking",
    text: "Breaks are taken out of your hours automatically.",
    gradient: "from-amber-400 to-orange-500",
  },
  {
    icon: BarChart3,
    title: "Overtime insights",
    text: "See working hours, overtime and late days at a glance.",
    gradient: "from-violet-500 to-purple-600",
  },
  {
    icon: FileText,
    title: "PDF reports",
    text: "Download beautiful monthly and yearly reports in A4.",
    gradient: "from-emerald-500 to-teal-600",
  },
];

export default function Home() {
  const { isAuthenticated, hydrated } = useAuth();
  const router = useRouter();

  // Send already-authenticated visitors straight to the dashboard.
  useEffect(() => {
    if (hydrated && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [hydrated, isAuthenticated, router]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-gray-200/70 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <BrandMark />
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" className="w-auto">
                Sign in
              </Button>
            </Link>
            <Link href="/signup" className="hidden sm:block">
              <Button className="w-auto bg-blue-600 hover:bg-blue-700">
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.18),_transparent_60%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-2 lg:px-8 lg:pb-24">
          <div className="text-center lg:text-left">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-blue-700 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
              Built for India · All times in IST
            </span>
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              Your work hours,{" "}
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                beautifully tracked
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base text-gray-600 sm:text-lg lg:mx-0">
              Check in with one tap, track breaks and overtime automatically,
              and download clean PDF reports whenever you need them.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <Link href="/signup">
                <Button
                  size="lg"
                  className="h-12 w-full bg-blue-600 px-7 text-base font-semibold shadow-lg shadow-blue-600/25 hover:bg-blue-700 sm:w-auto"
                >
                  Get started free
                  <ArrowRight />
                </Button>
              </Link>
              <Link href="/login">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 w-full bg-white px-7 text-base sm:w-auto"
                >
                  I have an account
                </Button>
              </Link>
            </div>
          </div>

          {/* Product preview */}
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-blue-400/30 to-indigo-400/30 blur-2xl" />
            <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl shadow-blue-900/10">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white">
                <p className="text-sm text-blue-100">Thursday, 1 October</p>
                <p className="mt-1 text-xl font-bold">Good morning 👋</p>
                <p className="mt-4 text-4xl font-extrabold tabular-nums tracking-tight">
                  09:58 AM
                </p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm">
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                  Clocked in · 2h 14m
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 p-5">
                {[
                  { icon: LogIn, label: "Check in", value: "07:44 AM", tone: "bg-green-100 text-green-600" },
                  { icon: Coffee, label: "Break", value: "15m", tone: "bg-orange-100 text-orange-600" },
                  { icon: CheckCircle2, label: "Present", value: "18 days", tone: "bg-blue-100 text-blue-600" },
                  { icon: BarChart3, label: "Overtime", value: "6h 30m", tone: "bg-violet-100 text-violet-600" },
                ].map(({ icon: Icon, label, value, tone }) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-xl border border-gray-100 p-3"
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-[11px] text-gray-500">{label}</p>
                      <p className="text-sm font-semibold text-gray-900">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text, gradient }) => (
            <div
              key={title}
              className="flex gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg sm:block sm:p-6"
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md sm:mb-4 ${gradient}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="mb-1 font-semibold text-gray-900">{title}</h3>
                <p className="text-sm text-gray-600">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-20 sm:px-6 lg:px-8">
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 px-6 py-12 text-center shadow-xl sm:px-12">
          <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <h2 className="relative text-2xl font-bold text-white sm:text-3xl">
            Ready to take control of your time?
          </h2>
          <p className="relative mx-auto mt-3 max-w-lg text-blue-100">
            Set up in under a minute. No credit card, no spreadsheets.
          </p>
          <Link href="/signup" className="relative mt-8 inline-block">
            <Button
              size="lg"
              className="h-12 w-auto bg-white px-8 text-base font-semibold text-blue-700 hover:bg-blue-50"
            >
              Start free today
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-gray-200 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-gray-500 sm:flex-row sm:px-6 lg:px-8">
          <BrandMark className="scale-90" />
          <p>&copy; {new Date().getFullYear()} AttendanceApp. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
