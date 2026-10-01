"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { RequireGuest } from "@/components/require-guest";
import { BrandMark } from "@/components/app-shell";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.18),_transparent_60%)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xl shadow-blue-900/5 p-6 sm:p-8">
          <Link href="/" className="flex justify-center mb-8">
            <BrandMark />
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  // Link opened without a token at all — nothing to submit against.
  if (!token) {
    return (
      <Shell>
        <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
          Invalid reset link
        </h2>
        <p className="text-gray-600 text-center mb-8">
          This link is missing its reset token. Request a new one to continue.
        </p>
        {/* asChild renders the Link itself as the button, instead of nesting
            an interactive <button> inside an <a>. */}
        <Button asChild className="!w-full bg-blue-600 hover:bg-blue-700">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </Shell>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < MIN_PASSWORD_LENGTH) {
      toast({
        title: "Password too short",
        description: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Re-enter the same password in both fields.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: "Could not reset password",
          description: data.error || "Please request a new reset link.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Password reset",
        description: data.message || "You can now sign in.",
      });
      router.push("/login");
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
    <Shell>
      <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
        Set a new password
      </h2>
      <p className="text-gray-600 text-center mb-8">
        Choose a password you haven&apos;t used before
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            New password
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Confirm new password
          </label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full"
          />
        </div>

        {/* !w-full is required: buttonVariants ships `w-full sm:w-auto`, and the
            media-query rule beats a plain `w-full` from ≥640px up. */}
        <Button
          type="submit"
          disabled={isLoading}
          className="!w-full bg-blue-600 hover:bg-blue-700"
        >
          {isLoading ? "Resetting..." : "Reset password"}
        </Button>
      </form>

      <p className="text-center text-gray-600 mt-6">
        <Link
          href="/login"
          className="text-blue-600 hover:underline font-medium"
        >
          Back to sign in
        </Link>
      </p>
    </Shell>
  );
}

export default function ResetPasswordPage() {
  return (
    <RequireGuest>
      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense fallback={<Shell>{null}</Shell>}>
        <ResetPasswordForm />
      </Suspense>
    </RequireGuest>
  );
}
