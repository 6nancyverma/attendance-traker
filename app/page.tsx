"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { Clock, Users, BarChart3, Download } from "lucide-react";

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Navigation */}
      <nav className="border-b border-blue-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-8 h-8 text-blue-600" />
            <span className="text-xl font-bold text-gray-900 hidden lg:block">AttendanceApp</span>
          </div>
          <div className="flex gap-4">
            <Link href="/login">
              <Button variant="outline">Sign In</Button>
            </Link>
            <Link href="/signup">
              <Button className="bg-blue-600 hover:bg-blue-700">Sign Up</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-32">
        <div className="text-center mb-20">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Smart Attendance Management
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Track your work hours, manage attendance, and generate detailed reports all in one place.
            Simple, efficient, and designed for modern teams.
          </p>
          <div className="flex gap-4 justify-center flex-col sm:flex-row">
            <Link href="/signup">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 lg:min-w-[190px]">
                Get Started Now
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">
                Already have an account?
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mt-20">
          <div className="bg-white rounded-lg p-8 shadow-sm hover:shadow-lg transition-shadow">
            <Clock className="w-12 h-12 text-blue-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Real-Time Tracking</h3>
            <p className="text-gray-600">Check in and out instantly with just a click</p>
          </div>

          <div className="bg-white rounded-lg p-8 shadow-sm hover:shadow-lg transition-shadow">
            <Users className="w-12 h-12 text-green-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Team Management</h3>
            <p className="text-gray-600">Monitor attendance across your organization</p>
          </div>

          <div className="bg-white rounded-lg p-8 shadow-sm hover:shadow-lg transition-shadow">
            <BarChart3 className="w-12 h-12 text-purple-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Analytics</h3>
            <p className="text-gray-600">Get insights into work patterns and overtime</p>
          </div>

          <div className="bg-white rounded-lg p-8 shadow-sm hover:shadow-lg transition-shadow">
            <Download className="w-12 h-12 text-orange-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Reports</h3>
            <p className="text-gray-600">Download detailed monthly and yearly reports</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-blue-600 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to streamline attendance?</h2>
          <p className="text-blue-100 mb-8">Join thousands of companies managing attendance efficiently</p>
          <Link href="/signup">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50">
              Start Free Today
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p>&copy; 2024 AttendanceApp. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
