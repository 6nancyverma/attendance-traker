/**
 * Turns report data from GET /api/reports/generate into a styled PDF.
 *
 * Browser-only (jsPDF); import it dynamically so the library only loads when
 * someone actually downloads a report.
 */
import { jsPDF } from "jspdf";
import autoTable, { type CellHookData, type RowInput } from "jspdf-autotable";
import { formatDateKey } from "./date";
import type {
  ReportData,
  ReportRow,
  ReportRowKind,
  ReportTotals,
} from "@/types/report";

type RGB = [number, number, number];

const C = {
  primary: [37, 99, 235] as RGB,
  primaryDark: [30, 64, 175] as RGB,
  ink: [15, 23, 42] as RGB,
  muted: [100, 116, 139] as RGB,
  border: [226, 232, 240] as RGB,
  surface: [248, 250, 252] as RGB,
  white: [255, 255, 255] as RGB,
  green: [22, 163, 74] as RGB,
  amber: [217, 119, 6] as RGB,
  violet: [124, 58, 237] as RGB,
  red: [220, 38, 38] as RGB,
  slate: [71, 85, 105] as RGB,
};

const KIND_STYLE: Record<ReportRowKind, { text: RGB; fill?: RGB }> = {
  present: { text: C.green },
  late: { text: C.amber },
  open: { text: [234, 88, 12] },
  off: { text: C.slate, fill: [241, 245, 249] },
  leave: { text: C.violet, fill: [245, 243, 255] },
  absent: { text: C.red, fill: [254, 242, 242] },
};

const PAGE_MARGIN = 36;

/**
 * The built-in PDF fonts only cover Latin-1; anything else (Devanagari
 * holiday names, emoji) would print as garbage, so swap in safe stand-ins.
 */
function safe(text: string): string {
  return text
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

/** Decimal hours → "8h 30m"; empty for nothing. */
function hrs(hours: number | null | undefined): string {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) {
    return "-";
  }
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}

function mins(minutes: number | null | undefined): string {
  return typeof minutes === "number" && minutes > 0 ? `${minutes}m` : "-";
}

function drawHeader(doc: jsPDF, data: ReportData) {
  const width = doc.internal.pageSize.getWidth();
  const bandHeight = 84;

  doc.setFillColor(...C.primary);
  doc.rect(0, 0, width, bandHeight, "F");
  // A darker accent strip along the bottom of the band.
  doc.setFillColor(...C.primaryDark);
  doc.rect(0, bandHeight - 4, width, 4, "F");

  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("ATTENDANCEAPP", PAGE_MARGIN, 26, { charSpace: 1.2 });

  doc.setFontSize(20);
  doc.text(
    data.type === "monthly"
      ? "Monthly Attendance Report"
      : "Yearly Attendance Report",
    PAGE_MARGIN,
    50
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(safe(data.periodLabel), PAGE_MARGIN, 67);

  let right = width - PAGE_MARGIN;
  if (drawAvatar(doc, data.user.avatar, right - 46, 19, 46)) right -= 58;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(safe(data.user.name || "Employee"), right, 32, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (data.user.email) {
    doc.text(safe(data.user.email), right, 47, { align: "right" });
  }
  doc.text(`Generated ${safe(data.generatedAt)} IST`, right, 62, {
    align: "right",
  });
}

/** Round profile photo with a white ring; false when there is none. */
function drawAvatar(
  doc: jsPDF,
  dataUrl: string | null,
  x: number,
  y: number,
  size: number
): boolean {
  const match = dataUrl && /^data:image\/(jpeg|png|webp);base64,/.exec(dataUrl);
  if (!match) return false;
  const r = size / 2;
  const format = match[1] === "jpeg" ? "JPEG" : match[1].toUpperCase();
  try {
    doc.saveGraphicsState();
    // Path only (no paint), then clip the photo to it.
    doc.circle(x + r, y + r, r, null);
    doc.clip();
    doc.discardPath();
    doc.addImage(dataUrl!, format, x, y, size, size);
    doc.restoreGraphicsState();
  } catch {
    doc.restoreGraphicsState();
    return false;
  }
  // Own graphics state so the thick ring doesn't leak into later borders.
  doc.saveGraphicsState();
  doc.setDrawColor(...C.white);
  doc.setLineWidth(2);
  doc.circle(x + r, y + r, r, "S");
  doc.restoreGraphicsState();
  return true;
}

function drawInfoLine(doc: jsPDF, data: ReportData, y: number): number {
  const width = doc.internal.pageSize.getWidth();
  const s = data.schedule;
  // Two lines so it fits the width of a portrait A4 page.
  const lines = [
    [
      `Period: ${formatDateKey(data.startDate, undefined, "en-GB")} - ${formatDateKey(data.endDate, undefined, "en-GB")}`,
      `Office hours: ${s.start} - ${s.end}`,
      `Working days: ${s.workingDays.join(", ")}`,
    ],
    [
      `Standard day: ${hrs(s.standardHours)} (break ${s.breakMinutes}m)`,
      `All times in ${data.timeZone}`,
    ],
  ];
  const boxHeight = 34;

  doc.setFillColor(...C.surface);
  doc.setDrawColor(...C.border);
  doc.roundedRect(PAGE_MARGIN, y, width - PAGE_MARGIN * 2, boxHeight, 4, 4, "FD");
  doc.setTextColor(...C.slate);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  lines.forEach((parts, i) => {
    doc.text(safe(parts.join("   |   ")), PAGE_MARGIN + 10, y + 14 + i * 11);
  });
  return y + boxHeight;
}

function drawStatCards(doc: jsPDF, totals: ReportTotals, y: number): number {
  const width = doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2;
  const cards: { label: string; value: string; accent: RGB }[] = [
    { label: "Paid days", value: String(totals.paidDays), accent: C.primary },
    { label: "Days worked", value: String(totals.workedDays), accent: C.green },
    { label: "Offs & holidays", value: String(totals.offDays), accent: C.slate },
    { label: "Leave", value: String(totals.leaveDays), accent: C.violet },
    { label: "Late days", value: String(totals.lateDays), accent: C.amber },
    { label: "Working hours", value: hrs(totals.regularHours), accent: C.primary },
    { label: "Overtime", value: hrs(totals.overtimeHours), accent: C.amber },
    { label: "Total hours", value: hrs(totals.totalHours), accent: C.ink },
  ];
  // Two rows of four on a portrait A4 page.
  const perRow = 4;
  const gap = 8;
  const cardWidth = (width - gap * (perRow - 1)) / perRow;
  const cardHeight = 48;

  cards.forEach((card, i) => {
    const x = PAGE_MARGIN + (i % perRow) * (cardWidth + gap);
    const top = y + Math.floor(i / perRow) * (cardHeight + gap);
    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.border);
    doc.roundedRect(x, top, cardWidth, cardHeight, 5, 5, "FD");
    doc.setFillColor(...card.accent);
    doc.rect(x + 8, top + 8, 14, 2.5, "F");

    doc.setTextColor(...C.ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(card.value, x + 8, top + 29);

    doc.setTextColor(...C.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(card.label.toUpperCase(), x + 8, top + 41, { charSpace: 0.4 });
  });
  const rows = Math.ceil(cards.length / perRow);
  return y + rows * cardHeight + (rows - 1) * gap;
}

function sectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setTextColor(...C.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, PAGE_MARGIN, y);
  doc.setFillColor(...C.primary);
  doc.rect(PAGE_MARGIN, y + 5, 28, 2, "F");
  return y + 14;
}

const tableBase = {
  margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 40 },
  theme: "grid" as const,
  styles: {
    font: "helvetica",
    fontSize: 7.5,
    cellPadding: { top: 4.5, bottom: 4.5, left: 4, right: 4 },
    textColor: C.ink,
    lineColor: C.border,
    lineWidth: 0.5,
    valign: "middle" as const,
  },
  headStyles: {
    fillColor: C.ink,
    textColor: C.white,
    fontStyle: "bold" as const,
    fontSize: 8,
  },
  footStyles: {
    fillColor: [239, 246, 255] as RGB,
    textColor: C.primaryDark,
    fontStyle: "bold" as const,
  },
  alternateRowStyles: { fillColor: C.surface },
};

function lastTableY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY;
}

function drawMonthTable(doc: jsPDF, data: ReportData, y: number) {
  const body: RowInput[] = data.months.map((m) => [
    m.label,
    m.paidDays,
    m.workedDays,
    m.offDays,
    m.leaveDays,
    m.lateDays,
    hrs(m.regularHours),
    hrs(m.overtimeHours),
    hrs(m.totalHours),
  ]);
  const t = data.totals;

  autoTable(doc, {
    ...tableBase,
    startY: y,
    head: [
      [
        "Month",
        "Paid days",
        "Worked",
        "Offs & holidays",
        "Leave",
        "Late",
        "Working hours",
        "Overtime",
        "Total hours",
      ],
    ],
    body: body.length ? body : [["No attendance recorded", "", "", "", "", "", "", "", ""]],
    foot: [
      [
        "Total",
        t.paidDays,
        t.workedDays,
        t.offDays,
        t.leaveDays,
        t.lateDays,
        hrs(t.regularHours),
        hrs(t.overtimeHours),
        hrs(t.totalHours),
      ],
    ],
    columnStyles: {
      0: { fontStyle: "bold", halign: "left" },
      1: { halign: "center" },
      2: { halign: "center" },
      3: { halign: "center" },
      4: { halign: "center" },
      5: { halign: "center" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
    },
    didParseCell: (cell: CellHookData) => {
      // Headers and totals line up with the numbers beneath them.
      if (cell.section !== "body" && cell.column.index > 0) {
        cell.cell.styles.halign = cell.column.index >= 6 ? "right" : "center";
      }
    },
  });
}

function drawDailyTable(doc: jsPDF, data: ReportData, y: number) {
  const rows = data.rows;
  const t = data.totals;
  const body: RowInput[] = rows.map((r) => [
    formatDateKey(r.date, { day: "2-digit", month: "short" }),
    r.day,
    r.checkIn || "-",
    r.checkOut || "-",
    mins(r.breakMinutes),
    hrs(r.regular),
    hrs(r.overtime),
    hrs(r.total),
    safe(r.status),
    safe(r.note),
  ]);

  autoTable(doc, {
    ...tableBase,
    startY: y,
    head: [
      [
        "Date",
        "Day",
        "Check in",
        "Check out",
        "Break",
        "Working",
        "Overtime",
        "Total",
        "Status",
        "Note",
      ],
    ],
    body: body.length
      ? body
      : [[{ content: "No attendance recorded for this period", colSpan: 10, styles: { halign: "center", textColor: C.muted } }]],
    foot: rows.length
      ? [
          [
            { content: "Total", colSpan: 4 },
            hrs(t.breakMinutes / 60),
            hrs(t.regularHours),
            hrs(t.overtimeHours),
            hrs(t.totalHours),
            { content: `${t.paidDays} paid days`, colSpan: 2 },
          ],
        ]
      : undefined,
    showFoot: "lastPage",
    columnStyles: {
      0: { cellWidth: 40, fontStyle: "bold" },
      1: { cellWidth: 28, textColor: C.muted },
      2: { cellWidth: 50, halign: "center" },
      3: { cellWidth: 50, halign: "center" },
      4: { cellWidth: 32, halign: "right" },
      5: { cellWidth: 44, halign: "right" },
      6: { cellWidth: 44, halign: "right" },
      7: { cellWidth: 44, halign: "right", fontStyle: "bold" },
      8: { cellWidth: 100 },
      9: { cellWidth: "auto", textColor: C.muted },
    },
    didParseCell: (cell: CellHookData) => {
      // Headers and totals line up with the numbers beneath them.
      if (cell.section !== "body") {
        const i = cell.column.index;
        cell.cell.styles.halign =
          i >= 4 && i <= 7 ? "right" : i === 2 || i === 3 ? "center" : "left";
        return;
      }
      if (!rows.length) return;
      const row: ReportRow | undefined = rows[cell.row.index];
      if (!row) return;
      const style = KIND_STYLE[row.kind];
      if (style.fill) cell.cell.styles.fillColor = style.fill;
      if (cell.column.index === 8) {
        cell.cell.styles.textColor = style.text;
        cell.cell.styles.fontStyle = "bold";
      }
      if (cell.column.index === 6 && (row.overtime ?? 0) > 0) {
        cell.cell.styles.textColor = C.amber;
        cell.cell.styles.fontStyle = "bold";
      }
    },
  });
}

function drawFooters(doc: jsPDF, data: ReportData) {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.5);
    doc.line(PAGE_MARGIN, height - 28, width - PAGE_MARGIN, height - 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text(
      safe(
        `AttendanceApp  |  ${data.user.name || "Employee"}  |  ${data.periodLabel}  |  Times in IST`
      ),
      PAGE_MARGIN,
      height - 16
    );
    doc.text(`Page ${i} of ${pages}`, width - PAGE_MARGIN, height - 16, {
      align: "right",
    });
  }
}

/** Build the report PDF. */
export function buildReportPdf(data: ReportData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  doc.setProperties({
    title: `Attendance Report - ${data.periodLabel}`,
    subject: "Attendance report",
    author: data.user.name || "AttendanceApp",
    creator: "AttendanceApp",
  });

  drawHeader(doc, data);
  let y = drawInfoLine(doc, data, 100);
  y = drawStatCards(doc, data.totals, y + 12);

  if (data.type === "yearly") {
    y = sectionTitle(doc, "Month-by-month summary", y + 28);
    drawMonthTable(doc, data, y);
    // Daily log starts on its own page so the summary reads as a cover page.
    doc.addPage();
    y = sectionTitle(doc, "Daily log", PAGE_MARGIN + 10);
  } else {
    y = sectionTitle(doc, "Daily log", y + 28);
  }
  drawDailyTable(doc, data, y);

  drawLegend(doc);
  drawFooters(doc, data);
  return doc;
}

/** Colour key under the daily table (on a new page if it doesn't fit). */
function drawLegend(doc: jsPDF) {
  const height = doc.internal.pageSize.getHeight();
  let y = lastTableY(doc) + 16;
  if (y > height - 50) {
    doc.addPage();
    y = PAGE_MARGIN + 10;
  }
  const items: { label: string; kind: ReportRowKind }[] = [
    { label: "Present", kind: "present" },
    { label: "Late", kind: "late" },
    { label: "No check-out", kind: "open" },
    { label: "Weekly off / holiday", kind: "off" },
    { label: "Leave", kind: "leave" },
    { label: "Absent", kind: "absent" },
  ];
  let x = PAGE_MARGIN;
  doc.setLineWidth(0.75);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  for (const item of items) {
    const style = KIND_STYLE[item.kind];
    doc.setFillColor(...(style.fill ?? C.white));
    doc.setDrawColor(...style.text);
    doc.roundedRect(x, y - 7, 9, 9, 2, 2, "FD");
    doc.setTextColor(...C.slate);
    doc.text(item.label, x + 13, y);
    x += 13 + doc.getTextWidth(item.label) + 18;
  }
}

export function reportFileName(data: ReportData): string {
  return data.type === "monthly" && data.month
    ? `attendance-report-${data.year}-${String(data.month).padStart(2, "0")}.pdf`
    : `attendance-report-${data.year}.pdf`;
}
