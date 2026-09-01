/**
 * Shared API types used by both the client and the API route handlers.
 */

// User related
export interface UserPayload {
  _id: string;
  email: string;
  name: string;
  role: "employee" | "admin";
}

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: UserPayload;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** Generic success envelope for endpoints that return no data. */
export interface MessageResponse {
  message: string;
}

// Attendance related
export interface AttendanceRecord {
  _id: string;
  userId: string;
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  status: "present" | "absent" | "late";
  hoursWorked?: number;
  isOvertime?: boolean;
  /** Break periods taken during the day. */
  breaks?: { start: string; end?: string }[];
  breakMinutes?: number;
  /** "work" when omitted. Non-work days carry no times. */
  dayType?: "work" | "leave" | "sick" | "holiday" | "wfh";
  note?: string;
  /** True when the day was created or edited by hand rather than clocked. */
  correctedManually?: boolean;
}

export interface DailyAttendance {
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  status: string;
  hoursWorked?: number;
}

export interface AttendanceResponse {
  success: boolean;
  message?: string;
  data?: AttendanceRecord;
}

export interface AttendanceStatsResponse {
  totalPresent: number;
  /** Derived: elapsed working days in the period with no record at all. */
  totalAbsent: number;
  totalLate: number;
  totalOvertime: number;
  averageHoursWorked: number;
  totalHoursWorked: number;
  /** Days marked leave/sick/holiday — accounted for, so not counted absent. */
  totalLeave: number;
  totalBreakMinutes: number;
  workingDaysElapsed: number;
  daysAttended: number;
  standardHours: number;
}

export interface ReportData {
  userId: string;
  month?: number;
  year: number;
  type: "monthly" | "yearly";
}

export interface DemoResponse {
  message: string;
}
