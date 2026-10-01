"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { RequireGuest } from "@/components/require-guest";
import { BrandMark } from "@/components/app-shell";
import { MailCheck } from "lucide-react";

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(
          data.error || "Something went wrong. Please try again.",
        );
        toast({
          title:
            response.status === 404
              ? "No account found"
              : "Couldn't send reset link",
          description: data.error || "Please try again.",
          variant: "destructive",
        });
        return;
      }

      setErrorMessage(null);
      setSubmitted(true);
    } catch {
      toast({
        title: "Error",
        description: "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.18),_transparent_60%)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xl shadow-blue-900/5 p-6 sm:p-8">
          <Link href="/" className="flex justify-center mb-8">
            <BrandMark />
          </Link>

          {submitted ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                <MailCheck className="h-6 w-6 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Check your email
              </h2>
              <p className="text-gray-600 mb-8">
                We&apos;ve sent a password reset link to{" "}
                <strong>{email}</strong>. It expires in 60 minutes.
              </p>
              <Link
                href="/login"
                className="text-blue-600 hover:underline font-medium"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
                Forgot password?
              </h2>
              <p className="text-gray-600 text-center mb-8">
                Enter your email and we&apos;ll send you a reset link
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <Input
                    type="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="email"
                    spellCheck={false}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="you@example.com"
                    required
                    aria-invalid={!!errorMessage}
                    aria-describedby={
                      errorMessage ? "forgot-password-error" : undefined
                    }
                    className={`w-full ${
                      errorMessage
                        ? "border-red-500 focus-visible:ring-red-500"
                        : ""
                    }`}
                  />
                  {errorMessage && (
                    <p
                      id="forgot-password-error"
                      role="alert"
                      className="mt-2 text-sm text-red-600"
                    >
                      {errorMessage}
                    </p>
                  )}
                </div>

                {/* !w-full is required: buttonVariants ships `w-full sm:w-auto`,
                    and the media-query rule beats a plain `w-full` from ≥640px. */}
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="!w-full bg-blue-600 hover:bg-blue-700"
                >
                  {isLoading ? "Sending..." : "Send reset link"}
                </Button>
              </form>

              <p className="text-center text-gray-600 mt-6">
                Remembered it?{" "}
                <Link
                  href="/login"
                  className="text-blue-600 hover:underline font-medium"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <RequireGuest>
      <ForgotPasswordForm />
    </RequireGuest>
  );
}
