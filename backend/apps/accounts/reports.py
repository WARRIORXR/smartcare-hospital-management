"""
apps/accounts/reports.py
========================
Shared analytics aggregator and CSV / PDF report export builders for Admin Analytics.
"""

import csv
import io
from datetime import timedelta
from django.utils import timezone
from django.db.models import Count, Avg
from django.http import HttpResponse

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


def compute_analytics_data():
    """Aggregate live hospital KPIs and chart data across OPD, Beds, Blood Bank, and Billing."""
    from .models import Department, Doctor, Patient
    from apps.opd.models import Token
    from apps.beds.models import Bed, Ward, Admission
    from apps.bloodbank.models import BloodStock, BloodRequest

    today = timezone.now().date()
    today_tokens = Token.objects.filter(appointment_date=today)
    total_tokens_today = today_tokens.count()
    waiting_count = today_tokens.filter(status='waiting').count()
    called_count = today_tokens.filter(status='called').count()
    in_progress_count = today_tokens.filter(status='in_progress').count()
    completed_count = today_tokens.filter(status='completed').count()
    admitted_count = today_tokens.filter(status='admitted').count()
    skipped_count = today_tokens.filter(status='skipped').count()
    cancelled_count = today_tokens.filter(status='cancelled').count()

    serviced_tokens = today_tokens.filter(status__in=['called', 'in_progress', 'completed'])
    wait_times = []
    for t in serviced_tokens:
        diff_mins = (t.updated_at - t.created_at).total_seconds() / 60.0
        if diff_mins >= 0:
            wait_times.append(diff_mins)

    if wait_times:
        avg_waiting_time = round(sum(wait_times) / len(wait_times), 1)
    else:
        avg_doc_time = (
            Doctor.objects.filter(is_available=True)
            .aggregate(Avg('avg_consult_minutes'))['avg_consult_minutes__avg']
            or 15.0
        )
        avg_waiting_time = round(float(avg_doc_time), 1)

    dept_counts_qs = (
        today_tokens.exclude(department__isnull=True)
        .values('department__id', 'department__name')
        .annotate(token_count=Count('id'))
        .order_by('-token_count')
    )

    busiest_dept_name = "General Medicine"
    busiest_dept_tokens = 0
    if dept_counts_qs.exists():
        busiest = dept_counts_qs.first()
        busiest_dept_name = busiest['department__name']
        busiest_dept_tokens = busiest['token_count']
    else:
        all_time_busiest = (
            Token.objects.exclude(department__isnull=True)
            .values('department__name')
            .annotate(token_count=Count('id'))
            .order_by('-token_count')
            .first()
        )
        if all_time_busiest:
            busiest_dept_name = all_time_busiest['department__name']
            busiest_dept_tokens = all_time_busiest['token_count']
        else:
            first_dept = Department.objects.first()
            if first_dept:
                busiest_dept_name = first_dept.name

    all_departments = Department.objects.all().order_by('name')
    dept_chart_labels = []
    dept_chart_data = []
    for dept in all_departments:
        dept_chart_labels.append(dept.name)
        dept_chart_data.append(today_tokens.filter(department=dept).count())

    if sum(dept_chart_data) == 0:
        dept_chart_data = [Token.objects.filter(department=dept).count() for dept in all_departments]

    total_beds = Bed.objects.count()
    occupied_beds = Bed.objects.filter(status='occupied').count()
    available_beds = Bed.objects.filter(status='available').count()
    cleaning_beds = Bed.objects.filter(status='cleaning').count()
    maintenance_beds = Bed.objects.filter(status__in=['maintenance', 'reserved']).count()
    bed_occupancy_percentage = round((occupied_beds / total_beds * 100), 1) if total_beds > 0 else 0.0

    wards_qs = Ward.objects.filter(is_active=True).order_by('name')
    ward_chart_labels = []
    ward_chart_occupied = []
    ward_chart_available = []
    ward_chart_percentages = []

    for w in wards_qs:
        w_total = w.beds.count()
        w_occ = w.beds.filter(status='occupied').count()
        w_avail = w.beds.filter(status='available').count()
        w_pct = round((w_occ / w_total * 100), 1) if w_total > 0 else 0.0
        ward_chart_labels.append(w.name)
        ward_chart_occupied.append(w_occ)
        ward_chart_available.append(w_avail)
        ward_chart_percentages.append(w_pct)

    all_blood_groups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']
    stocks_map = {s.blood_group: s for s in BloodStock.objects.all()}
    low_stock_alerts = []
    blood_chart_labels = []
    blood_chart_units = []
    blood_chart_colors = []
    total_blood_units = 0

    for bg in all_blood_groups:
        stock = stocks_map.get(bg)
        units = stock.units_available if stock else 0
        total_blood_units += units
        is_low = units < 3
        if is_low:
            low_stock_alerts.append({
                "blood_group": bg,
                "units_available": units,
                "minimum_threshold": 3,
                "shortage": max(0, 3 - units),
                "expiry_date": stock.expiry_date if stock else None
            })
        blood_chart_labels.append(bg)
        blood_chart_units.append(units)
        blood_chart_colors.append('#ef4444' if is_low else '#10b981')

    trend_labels = []
    trend_data = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        trend_labels.append(day.strftime("%a (%d %b)"))
        trend_data.append(Token.objects.filter(appointment_date=day).count())

    return {
        "generated_at": timezone.now().isoformat(),
        "summary_kpis": {
            "total_tokens_today": total_tokens_today,
            "waiting_tokens": waiting_count,
            "called_tokens": called_count + in_progress_count,
            "completed_tokens": completed_count,
            "average_waiting_time_minutes": avg_waiting_time,
            "average_waiting_time_display": f"{avg_waiting_time} mins",
            "busiest_department": {
                "name": busiest_dept_name,
                "tokens_count": busiest_dept_tokens,
            },
            "bed_occupancy_percentage": bed_occupancy_percentage,
            "total_beds": total_beds,
            "occupied_beds": occupied_beds,
            "available_beds": available_beds,
            "cleaning_beds": cleaning_beds,
            "blood_stock_low_alerts": {
                "count": len(low_stock_alerts),
                "has_alerts": len(low_stock_alerts) > 0,
                "critical_groups": [item["blood_group"] for item in low_stock_alerts],
                "total_blood_units": total_blood_units,
            },
            "total_doctors": Doctor.objects.count(),
            "available_doctors": Doctor.objects.filter(is_available=True).count(),
            "total_patients": Patient.objects.count(),
            "active_admissions": Admission.objects.filter(status='admitted').count(),
            "pending_blood_requests": BloodRequest.objects.filter(status='pending').count(),
        },
        "charts": {
            "token_status_distribution": {
                "labels": ["Waiting", "Called / In Progress", "Completed", "Admitted to Ward", "Skipped / Cancelled"],
                "data": [
                    waiting_count,
                    called_count + in_progress_count,
                    completed_count,
                    admitted_count,
                    skipped_count + cancelled_count
                ],
                "colors": ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444"]
            },
            "daily_token_trend": {"labels": trend_labels, "data": trend_data},
            "department_tokens": {"labels": dept_chart_labels, "data": dept_chart_data},
            "bed_status": {
                "labels": ["Available", "Occupied", "Cleaning", "Maintenance"],
                "data": [available_beds, occupied_beds, cleaning_beds, maintenance_beds],
                "colors": ["#10b981", "#ef4444", "#f59e0b", "#6b7280"]
            },
            "ward_occupancy": {
                "labels": ward_chart_labels,
                "occupied": ward_chart_occupied,
                "available": ward_chart_available,
                "percentages": ward_chart_percentages,
            },
            "blood_stock_levels": {
                "labels": blood_chart_labels,
                "data": blood_chart_units,
                "colors": blood_chart_colors,
                "threshold": 3
            }
        },
        "alerts": {"low_blood_stock": low_stock_alerts},
    }


def build_analytics_csv_response(data):
    """Build downloadable CSV HttpResponse for Hospital Analytics."""
    kpis = data['summary_kpis']
    charts = data['charts']

    response = HttpResponse(content_type='text/csv')
    filename = f"smartcare_analytics_{timezone.now().strftime('%Y%m%d')}.csv"
    response['Content-Disposition'] = f'attachment; filename="{filename}"'

    writer = csv.writer(response)
    writer.writerow(['SmartCare HMS - Executive Analytics Report'])
    writer.writerow(['Generated At', data['generated_at']])
    writer.writerow([])

    writer.writerow(['Section', 'Metric', 'Value'])
    writer.writerow(['OPD', 'Total Tokens Today', kpis['total_tokens_today']])
    writer.writerow(['OPD', 'Waiting Tokens', kpis['waiting_tokens']])
    writer.writerow(['OPD', 'Completed Tokens', kpis['completed_tokens']])
    writer.writerow(['OPD', 'Average Waiting Time (mins)', kpis['average_waiting_time_minutes']])
    writer.writerow(['OPD', 'Busiest Department', kpis['busiest_department']['name']])
    writer.writerow(['Beds', 'Total Beds', kpis['total_beds']])
    writer.writerow(['Beds', 'Occupied Beds', kpis['occupied_beds']])
    writer.writerow(['Beds', 'Available Beds', kpis['available_beds']])
    writer.writerow(['Beds', 'Bed Occupancy (%)', f"{kpis['bed_occupancy_percentage']}%"])
    writer.writerow(['Blood Bank', 'Total Units Available', kpis['blood_stock_low_alerts']['total_blood_units']])
    writer.writerow(['Blood Bank', 'Low Stock Groups (<3 units)', ', '.join(kpis['blood_stock_low_alerts']['critical_groups']) or 'None'])
    writer.writerow([])

    writer.writerow(['Department', 'Tokens Count'])
    for label, val in zip(charts['department_tokens']['labels'], charts['department_tokens']['data']):
        writer.writerow([label, val])
    writer.writerow([])

    writer.writerow(['Ward', 'Occupied Beds', 'Available Beds', 'Occupancy %'])
    ward_occ = charts['ward_occupancy']
    for name, occ, avail, pct in zip(ward_occ['labels'], ward_occ['occupied'], ward_occ['available'], ward_occ['percentages']):
        writer.writerow([name, occ, avail, f"{pct}%"])
    writer.writerow([])

    writer.writerow(['Blood Group', 'Units Available', 'Status'])
    for bg, units in zip(charts['blood_stock_levels']['labels'], charts['blood_stock_levels']['data']):
        writer.writerow([bg, units, 'LOW (<3)' if units < 3 else 'OK'])

    return response


def build_analytics_pdf_response(data):
    """Build downloadable PDF HttpResponse for Hospital Analytics using ReportLab."""
    kpis = data['summary_kpis']
    charts = data['charts']

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph("SmartCare HMS — Executive Analytics Report", styles['Title']))
    elements.append(Paragraph(f"Generated: {timezone.now().strftime('%d %b %Y, %I:%M %p IST')}", styles['Normal']))
    elements.append(Spacer(1, 14))

    kpi_rows = [
        ['Category', 'Key Metric', 'Current Value'],
        ['OPD Queue', 'Total Tokens Today', str(kpis['total_tokens_today'])],
        ['OPD Queue', 'Average Wait Time', kpis['average_waiting_time_display']],
        ['OPD Queue', 'Busiest Department', kpis['busiest_department']['name']],
        ['Ward Beds', 'Bed Occupancy Rate', f"{kpis['bed_occupancy_percentage']}% ({kpis['occupied_beds']}/{kpis['total_beds']})"],
        ['Blood Bank', 'Total Blood Units', str(kpis['blood_stock_low_alerts']['total_blood_units'])],
        ['Blood Bank', 'Critical Alerts (<3 units)', ', '.join(kpis['blood_stock_low_alerts']['critical_groups']) or 'None'],
        ['Directory', 'Doctors / Patients', f"{kpis['total_doctors']} Doctors / {kpis['total_patients']} Patients"],
    ]

    kpi_table = Table(kpi_rows, colWidths=[110, 190, 180])
    kpi_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a8a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(Paragraph("1. Hospital KPIs", styles['Heading2']))
    elements.append(kpi_table)
    elements.append(Spacer(1, 14))

    ward_rows = [['Ward Name', 'Occupied', 'Available', 'Occupancy %']]
    ward_occ = charts['ward_occupancy']
    for name, occ, avail, pct in zip(ward_occ['labels'], ward_occ['occupied'], ward_occ['available'], ward_occ['percentages']):
        ward_rows.append([name, str(occ), str(avail), f"{pct}%"])

    if len(ward_rows) > 1:
        ward_table = Table(ward_rows, colWidths=[200, 90, 90, 100])
        ward_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6d28d9')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('PADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(Paragraph("2. Ward Capacity Breakdown", styles['Heading2']))
        elements.append(ward_table)
        elements.append(Spacer(1, 14))

    blood_rows = [['Blood Group', 'Units Available', 'Status']]
    for bg, units in zip(charts['blood_stock_levels']['labels'], charts['blood_stock_levels']['data']):
        blood_rows.append([bg, str(units), 'CRITICAL LOW (<3)' if units < 3 else 'Adequate'])
    blood_table = Table(blood_rows, colWidths=[140, 140, 200])
    blood_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#be123c')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(Paragraph("3. Blood Bank Inventory Snapshot", styles['Heading2']))
    elements.append(blood_table)

    doc.build(elements)
    buffer.seek(0)
    response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
    filename = f"smartcare_analytics_{timezone.now().strftime('%Y%m%d')}.pdf"
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response
