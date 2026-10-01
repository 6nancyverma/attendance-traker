"use client";

import { useCallback, useEffect, useState, useRef } from "react";
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
import { Camera, Loader2, Trash2 } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { AppShell, PageHeader } from "@/components/app-shell";
import { AvatarCropDialog } from "@/components/avatar-crop-dialog";
import {
  cropToAvatarDataUrl,
  prepareImageFile,
  type PixelArea,
} from "@/lib/image";
import type { AuthResponse } from "@/types/api";
import {
  isValidHolidayDate,
  MAX_HOLIDAY_NAME,
  normalizeHolidays,
  type Holiday,
} from "@/lib/holidays";

function Settings() {
  const { user, token, login, avatar, setAvatar } = useAuth();
  const { toast } = useToast();

  // Profile photo: the user crops it in the browser, then it is resized and
  // stored on the account.
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  /** Object URL of the photo being cropped; the crop dialog is open while set. */
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const closeCropper = useCallback(() => {
    setPhotoError(null);
    setCropSrc((src) => {
      if (src) URL.revokeObjectURL(src);
      return null;
    });
  }, []);

  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again later
    if (!file) return;
    setPhotoError(null);
    try {
      setCropSrc(prepareImageFile(file));
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : "Could not open that image."
      );
    }
  };

  const handleCropSave = async (area: PixelArea) => {
    if (!cropSrc) return;
    setPhotoError(null);
    setIsSavingPhoto(true);
    try {
      const image = await cropToAvatarDataUrl(cropSrc, area);
      const res = await fetch("/api/settings/avatar", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ image }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhotoError(data.error || "Could not save your photo.");
        return;
      }
      setAvatar(data.avatar);
      closeCropper();
      toast({ title: "Photo updated", description: "Looking good!" });
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : "Could not save your photo."
      );
    } finally {
      setIsSavingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoError(null);
    setIsSavingPhoto(true);
    try {
      const res = await fetch("/api/settings/avatar", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPhotoError(data.error || "Could not remove your photo.");
        return;
      }
      setAvatar(null);
      toast({ title: "Photo removed" });
    } catch {
      setPhotoError("An error occurred. Please try again.");
    } finally {
      setIsSavingPhoto(false);
    }
  };

  // Profile: name and email. The values live in the JWT as well, so a save
  // returns a fresh token which `login` stores — the header updates at once.
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setProfileName(user.name ?? "");
      setProfileEmail(user.email ?? "");
    }
  }, [user]);

  const emailChanged =
    profileEmail.trim().toLowerCase() !== (user?.email ?? "").toLowerCase();
  const profileDirty =
    emailChanged || profileName.trim() !== (user?.name ?? "");

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);

    if (!profileName.trim()) {
      setProfileError("Name is required.");
      return;
    }
    if (emailChanged && !profilePassword) {
      setProfileError("Enter your current password to change your email.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: profileName.trim(),
          email: profileEmail.trim(),
          currentPassword: emailChanged ? profilePassword : undefined,
        }),
      });
      const data = (await res.json()) as AuthResponse & { error?: string };

      if (!res.ok) {
        setProfileError(data.error || "Could not save your profile.");
        return;
      }

      login(data.token, data.user);
      setProfilePassword("");
      toast({
        title: "Profile saved",
        description: emailChanged
          ? "Use your new email the next time you sign in."
          : "Your name has been updated.",
      });
    } catch {
      setProfileError("An error occurred. Please try again.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [schedule, setSchedule] = useState<WorkSchedule>(DEFAULT_WORK_SCHEDULE);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
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
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="Settings"
          description="Manage your profile, work schedule, holidays and password."
        />

        <Card className="rounded-2xl border-gray-100 p-4 shadow-sm sm:p-6 bg-white mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Profile</h2>
          <p className="text-sm text-gray-600 mb-6">
            Your photo and name appear on the dashboard and in reports. Changing your
            email changes what you sign in with, so it asks for your password.
          </p>

          <div className="mb-6 flex flex-col items-center gap-4 rounded-2xl bg-gradient-to-br from-blue-50 via-indigo-50 to-white p-4 text-center sm:p-5 sm:flex-row sm:items-center sm:gap-6 sm:text-left">
            {/* shrink-0 keeps the photo a perfect circle in narrow layouts */}
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={isSavingPhoto}
              className="group relative shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              aria-label="Change profile photo"
            >
              <UserAvatar
                src={avatar}
                name={user?.name}
                size={96}
                className="ring-4 shadow-md"
              />
              <span className="absolute inset-0 hidden items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
                {isSavingPhoto ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Camera className="w-6 h-6" />
                )}
              </span>
              {/* Always-visible badge: touch screens have no hover. */}
              <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-md ring-2 ring-white">
                {isSavingPhoto ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </span>
            </button>

            <div className="w-full min-w-0 sm:flex-1">
              <p className="truncate text-base font-semibold text-gray-900">
                {user?.name}
              </p>
              <p className="truncate text-sm text-gray-500">{user?.email}</p>
              <p className="mt-1 text-xs text-gray-500">
                JPEG, PNG or WebP · you can choose which part to use
              </p>

              <div className="mt-4 flex gap-2 sm:justify-start">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isSavingPhoto}
                  onClick={() => photoInputRef.current?.click()}
                  className="flex-1 whitespace-nowrap bg-white sm:flex-none"
                >
                  <Camera />
                  {isSavingPhoto
                    ? "Saving..."
                    : avatar
                      ? "Change photo"
                      : "Upload photo"}
                </Button>
                {avatar && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isSavingPhoto}
                    onClick={handleRemovePhoto}
                    className="flex-1 whitespace-nowrap border-red-200 bg-white text-red-600 hover:bg-red-50 hover:text-red-700 sm:flex-none"
                  >
                    <Trash2 />
                    Remove
                  </Button>
                )}
              </div>
              {photoError && (
                <p className="mt-2 text-sm text-red-600">{photoError}</p>
              )}
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handlePhotoSelected}
            />
          </div>

          {cropSrc && (
            <AvatarCropDialog
              src={cropSrc}
              saving={isSavingPhoto}
              error={photoError}
              onCancel={closeCropper}
              onSave={handleCropSave}
            />
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="profile-name"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Name
                </label>
                <Input
                  id="profile-name"
                  value={profileName}
                  maxLength={80}
                  autoComplete="name"
                  onChange={(e) => {
                    setProfileError(null);
                    setProfileName(e.target.value);
                  }}
                  required
                  className="w-full"
                />
              </div>
              <div>
                <label
                  htmlFor="profile-email"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Email
                </label>
                <Input
                  id="profile-email"
                  type="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="email"
                  spellCheck={false}
                  value={profileEmail}
                  onChange={(e) => {
                    setProfileError(null);
                    setProfileEmail(e.target.value);
                  }}
                  required
                  className="w-full"
                />
              </div>
            </div>

            {emailChanged && (
              <div>
                <label
                  htmlFor="profile-password"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Current password
                </label>
                <Input
                  id="profile-password"
                  type="password"
                  autoComplete="current-password"
                  value={profilePassword}
                  onChange={(e) => {
                    setProfileError(null);
                    setProfilePassword(e.target.value);
                  }}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Needed because you are changing the email you sign in with.
                </p>
              </div>
            )}

            <p className="text-sm text-gray-600">
              Role:{" "}
              <span className="font-medium text-gray-900 capitalize">
                {user?.role}
              </span>
            </p>

            {profileError && (
              <p role="alert" className="text-sm text-red-600">
                {profileError}
              </p>
            )}

            <Button
              type="submit"
              disabled={isSavingProfile || !profileDirty}
              className="!w-full sm:!w-auto bg-blue-600 hover:bg-blue-700"
            >
              {isSavingProfile ? "Saving..." : "Save profile"}
            </Button>
          </form>
        </Card>

        <Card className="rounded-2xl border-gray-100 p-4 shadow-sm sm:p-6 bg-white mb-6">
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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 max-w-lg">
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

                <div className="col-span-2 sm:col-span-1">
                  <label
                    htmlFor="overtimeGraceMinutes"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Overtime after (min)
                  </label>
                  <Input
                    id="overtimeGraceMinutes"
                    type="number"
                    min={0}
                    max={240}
                    value={schedule.overtimeGraceMinutes}
                    onChange={(e) => {
                      setScheduleError(null);
                      setSchedule((p) => ({
                        ...p,
                        overtimeGraceMinutes: Number(e.target.value),
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
                  {" "}—{" "}
                  {schedule.overtimeGraceMinutes > 0 ? (
                    <>
                      running over by more than{" "}
                      <strong>{schedule.overtimeGraceMinutes} minutes</strong>{" "}
                      counts as overtime; less than that is ignored.
                    </>
                  ) : (
                    "anything beyond that counts as overtime."
                  )}
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

        <Card className="rounded-2xl border-gray-100 p-4 shadow-sm sm:p-6 bg-white mb-6">
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

        <Card className="rounded-2xl border-gray-100 p-4 shadow-sm sm:p-6 bg-white">
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
    </AppShell>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <Settings />
    </RequireAuth>
  );
}
