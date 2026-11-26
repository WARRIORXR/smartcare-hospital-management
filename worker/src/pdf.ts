import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatDisplayDate, moneyStr } from './utils';

export function pdfSafe(text: unknown): string {
  return String(text ?? '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/[\u20B9]/g, 'INR ')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function drawTable(
  page: PDFPage,
  font: PDFFont,
  boldFont: PDFFont,
  startY: number,
  colWidths: number[],
  rows: string[][],
  headerBg: ReturnType<typeof rgb>,
  highlightLastRow = false
): number {
  let y = startY;
  const rowHeight = 22;
  const startX = 40;
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const isHeader = r === 0;
    const isLast = highlightLastRow && r === rows.length - 1;

    if (isHeader) {
      page.drawRectangle({ x: startX, y: y - rowHeight + 6, width: totalWidth, height: rowHeight, color: headerBg });
    } else if (isLast) {
      page.drawRectangle({ x: startX, y: y - rowHeight + 6, width: totalWidth, height: rowHeight, color: rgb(0.94, 0.96, 1) });
    } else if (r % 2 === 0) {
      page.drawRectangle({ x: startX, y: y - rowHeight + 6, width: totalWidth, height: rowHeight, color: rgb(0.97, 0.98, 0.99) });
    }

    page.drawRectangle({
      x: startX,
      y: y - rowHeight + 6,
      width: totalWidth,
      height: rowHeight,
      borderColor: rgb(0.8, 0.84, 0.88),
      borderWidth: 0.5,
    });

    let x = startX;
    for (let cIdx = 0; cIdx < colWidths.length; cIdx++) {
      const cell = pdfSafe(row[cIdx] ?? '').slice(0, Math.max(4, Math.floor(colWidths[cIdx] / 5.2)));
      page.drawText(cell, {
        x: x + 5,
        y: y - 10,
        size: 8.5,
        font: isHeader || isLast ? boldFont : font,
        color: isHeader ? rgb(1, 1, 1) : rgb(0.06, 0.09, 0.16),
      });
      x += colWidths[cIdx];
    }
    y -= rowHeight;
  }

  return y;
}

export interface InvoicePdfInput {
  invoice_number: string;
  status: string;
  created_at: string;
  paid_at?: string | null;
  payment_method?: string | null;
  patient_name: string;
  patient_code: string;
  patient_phone?: string;
  token_code?: string | null;
  ward_info?: string | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  notes?: string;
  items: Array<{
    description: string;
    category_display: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
}

export async function buildInvoicePdfBytes(inv: InvoicePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 790;
  page.drawText('SmartCare Hospital - Official Billing Receipt', { x: 40, y, size: 17, font: bold, color: rgb(0.06, 0.09, 0.16) });
  y -= 24;
  page.drawText(
    pdfSafe(`Receipt No: ${inv.invoice_number}  |  Status: ${inv.status.toUpperCase()}  |  Date: ${formatDisplayDate(inv.created_at)}`),
    { x: 40, y, size: 10, font, color: rgb(0.2, 0.25, 0.33) }
  );
  y -= 18;
  page.drawText(
    pdfSafe(`Patient: ${inv.patient_name} (${inv.patient_code})  |  Phone: ${inv.patient_phone || 'N/A'}`),
    { x: 40, y, size: 10, font, color: rgb(0.2, 0.25, 0.33) }
  );
  if (inv.token_code) {
    y -= 16;
    page.drawText(pdfSafe(`Linked OPD Token: ${inv.token_code}`), { x: 40, y, size: 10, font, color: rgb(0.2, 0.25, 0.33) });
  }
  if (inv.ward_info) {
    y -= 16;
    page.drawText(pdfSafe(`Ward Stay: ${inv.ward_info}`), { x: 40, y, size: 10, font, color: rgb(0.2, 0.25, 0.33) });
  }

  y -= 26;
  const rows: string[][] = [['#', 'Service Description', 'Category', 'Qty', 'Unit Price (INR)', 'Amount (INR)']];
  inv.items.forEach((item, idx) => {
    rows.push([
      String(idx + 1),
      item.description,
      item.category_display,
      String(item.quantity),
      moneyStr(item.unit_price),
      moneyStr(item.line_total),
    ]);
  });
  rows.push(['', '', '', '', 'Subtotal', `INR ${moneyStr(inv.subtotal)}`]);
  if (inv.tax_amount > 0) rows.push(['', '', '', '', 'Tax', `INR ${moneyStr(inv.tax_amount)}`]);
  if (inv.discount_amount > 0) rows.push(['', '', '', '', 'Discount', `- INR ${moneyStr(inv.discount_amount)}`]);
  rows.push(['', '', '', '', 'TOTAL DUE / PAID', `INR ${moneyStr(inv.total_amount)}`]);

  y = drawTable(page, font, bold, y, [26, 200, 95, 34, 80, 80], rows, rgb(0.06, 0.09, 0.16), true);
  y -= 22;

  if (inv.status === 'paid') {
    const paidDate = inv.paid_at ? formatDisplayDate(inv.paid_at) : formatDisplayDate(inv.created_at);
    page.drawText(pdfSafe(`Payment Confirmed: Paid via ${(inv.payment_method || 'UPI').toUpperCase()} on ${paidDate}.`), {
      x: 40,
      y,
      size: 10,
      font: bold,
      color: rgb(0.02, 0.45, 0.28),
    });
    y -= 18;
  }

  if (inv.notes) {
    page.drawText(pdfSafe(`Notes: ${inv.notes}`), { x: 40, y, size: 9.5, font, color: rgb(0.25, 0.3, 0.38) });
    y -= 20;
  }

  page.drawText('Thank you for trusting SmartCare Hospital. System-generated clinical billing receipt.', {
    x: 40,
    y: Math.max(60, y - 10),
    size: 9,
    font,
    color: rgb(0.45, 0.5, 0.58),
  });

  return doc.save();
}

export interface AnalyticsReportPayload {
  generated_at: string;
  summary_kpis: {
    total_tokens_today: number;
    waiting_tokens: number;
    called_tokens: number;
    completed_tokens: number;
    average_waiting_time_minutes: number;
    average_waiting_time_display: string;
    busiest_department: { name: string; tokens_count: number };
    bed_occupancy_percentage: number;
    total_beds: number;
    occupied_beds: number;
    available_beds: number;
    cleaning_beds: number;
    blood_stock_low_alerts: {
      count: number;
      has_alerts: boolean;
      critical_groups: string[];
      total_blood_units: number;
    };
    total_doctors: number;
    available_doctors: number;
    total_patients: number;
    active_admissions: number;
    pending_blood_requests: number;
  };
  charts: {
    department_tokens: { labels: string[]; data: number[] };
    ward_occupancy: { labels: string[]; occupied: number[]; available: number[]; percentages: number[] };
    blood_stock_levels: { labels: string[]; data: number[] };
  };
}

export async function buildAnalyticsPdfBytes(data: AnalyticsReportPayload): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const kpis = data.summary_kpis;
  const charts = data.charts;

  let y = 790;
  page.drawText('SmartCare HMS - Executive Analytics Report', { x: 40, y, size: 17, font: bold, color: rgb(0.12, 0.23, 0.54) });
  y -= 20;
  page.drawText(pdfSafe(`Generated: ${data.generated_at}`), { x: 40, y, size: 9.5, font, color: rgb(0.25, 0.3, 0.38) });

  y -= 26;
  page.drawText('1. Hospital KPIs', { x: 40, y, size: 12, font: bold, color: rgb(0.06, 0.09, 0.16) });
  y -= 16;

  const kpiRows: string[][] = [
    ['Category', 'Key Metric', 'Current Value'],
    ['OPD Queue', 'Total Tokens Today', String(kpis.total_tokens_today)],
    ['OPD Queue', 'Average Wait Time', kpis.average_waiting_time_display],
    ['OPD Queue', 'Busiest Department', kpis.busiest_department.name],
    ['Ward Beds', 'Bed Occupancy Rate', `${kpis.bed_occupancy_percentage}% (${kpis.occupied_beds}/${kpis.total_beds})`],
    ['Blood Bank', 'Total Blood Units', String(kpis.blood_stock_low_alerts.total_blood_units)],
    ['Blood Bank', 'Critical Alerts (<3 units)', kpis.blood_stock_low_alerts.critical_groups.join(', ') || 'None'],
    ['Directory', 'Doctors / Patients', `${kpis.total_doctors} Doctors / ${kpis.total_patients} Patients`],
  ];
  y = drawTable(page, font, bold, y, [115, 200, 200], kpiRows, rgb(0.12, 0.23, 0.54));

  y -= 24;
  page.drawText('2. Ward Capacity Breakdown', { x: 40, y, size: 12, font: bold, color: rgb(0.06, 0.09, 0.16) });
  y -= 16;
  const wardRows: string[][] = [['Ward Name', 'Occupied', 'Available', 'Occupancy %']];
  for (let i = 0; i < charts.ward_occupancy.labels.length; i++) {
    wardRows.push([
      charts.ward_occupancy.labels[i],
      String(charts.ward_occupancy.occupied[i]),
      String(charts.ward_occupancy.available[i]),
      `${charts.ward_occupancy.percentages[i]}%`,
    ]);
  }
  if (wardRows.length > 1) {
    y = drawTable(page, font, bold, y, [215, 100, 100, 100], wardRows, rgb(0.43, 0.16, 0.85));
  }

  y -= 24;
  page.drawText('3. Blood Bank Inventory Snapshot', { x: 40, y, size: 12, font: bold, color: rgb(0.06, 0.09, 0.16) });
  y -= 16;
  const bloodRows: string[][] = [['Blood Group', 'Units Available', 'Status']];
  for (let i = 0; i < charts.blood_stock_levels.labels.length; i++) {
    const units = charts.blood_stock_levels.data[i];
    bloodRows.push([charts.blood_stock_levels.labels[i], String(units), units < 3 ? 'CRITICAL LOW (<3)' : 'Adequate']);
  }
  drawTable(page, font, bold, y, [150, 150, 215], bloodRows, rgb(0.75, 0.07, 0.24));

  return doc.save();
}

function csvCell(val: unknown): string {
  const s = String(val ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildAnalyticsCsv(data: AnalyticsReportPayload): string {
  const kpis = data.summary_kpis;
  const charts = data.charts;
  const lines: string[][] = [
    ['SmartCare HMS - Executive Analytics Report'],
    ['Generated At', data.generated_at],
    [],
    ['Section', 'Metric', 'Value'],
    ['OPD', 'Total Tokens Today', String(kpis.total_tokens_today)],
    ['OPD', 'Waiting Tokens', String(kpis.waiting_tokens)],
    ['OPD', 'Completed Tokens', String(kpis.completed_tokens)],
    ['OPD', 'Average Waiting Time (mins)', String(kpis.average_waiting_time_minutes)],
    ['OPD', 'Busiest Department', kpis.busiest_department.name],
    ['Beds', 'Total Beds', String(kpis.total_beds)],
    ['Beds', 'Occupied Beds', String(kpis.occupied_beds)],
    ['Beds', 'Available Beds', String(kpis.available_beds)],
    ['Beds', 'Bed Occupancy (%)', `${kpis.bed_occupancy_percentage}%`],
    ['Blood Bank', 'Total Units Available', String(kpis.blood_stock_low_alerts.total_blood_units)],
    ['Blood Bank', 'Low Stock Groups (<3 units)', kpis.blood_stock_low_alerts.critical_groups.join(', ') || 'None'],
    [],
    ['Department', 'Tokens Count'],
  ];

  for (let i = 0; i < charts.department_tokens.labels.length; i++) {
    lines.push([charts.department_tokens.labels[i], String(charts.department_tokens.data[i])]);
  }
  lines.push([]);
  lines.push(['Ward', 'Occupied Beds', 'Available Beds', 'Occupancy %']);
  for (let i = 0; i < charts.ward_occupancy.labels.length; i++) {
    lines.push([
      charts.ward_occupancy.labels[i],
      String(charts.ward_occupancy.occupied[i]),
      String(charts.ward_occupancy.available[i]),
      `${charts.ward_occupancy.percentages[i]}%`,
    ]);
  }
  lines.push([]);
  lines.push(['Blood Group', 'Units Available', 'Status']);
  for (let i = 0; i < charts.blood_stock_levels.labels.length; i++) {
    const units = charts.blood_stock_levels.data[i];
    lines.push([charts.blood_stock_levels.labels[i], String(units), units < 3 ? 'LOW (<3)' : 'OK']);
  }

  return lines.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
