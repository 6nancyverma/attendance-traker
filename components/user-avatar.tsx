"use client";

import { cn } from "@/lib/utils";

/** "Basant Verma" → "BV", "nancy" → "N". */
export function getInitials(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

/**
 * Round profile photo, falling back to the user's initials on a blue disc
 * when no photo has been uploaded.
 */
export function UserAvatar({
  src,
  name,
  size = 32,
  className,
}: {
  src?: string | null;
  name?: string | null;
  /** Diameter in pixels. */
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };

  if (src) {
    return (
      // A data URL from our own API — next/image adds nothing here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ? `${name}'s profile photo` : "Profile photo"}
        style={style}
        className={cn(
          "rounded-full object-cover ring-2 ring-white shadow-sm shrink-0",
          className
        )}
      />
    );
  }

  return (
    <span
      aria-label={name ?? "Profile"}
      style={{ ...style, fontSize: Math.max(10, Math.round(size * 0.4)) }}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 font-semibold text-white ring-2 ring-white shadow-sm shrink-0 select-none",
        className
      )}
    >
      {getInitials(name)}
    </span>
  );
}
