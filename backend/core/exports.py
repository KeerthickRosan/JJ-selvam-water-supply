"""Excel (openpyxl) and PDF (reportlab) export helpers."""
from datetime import datetime
from decimal import Decimal
from io import BytesIO

from django.http import HttpResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import BusinessSettings


def _cell(v):
    if isinstance(v, Decimal):
        return float(v)
    return "" if v is None else v


def _text(v):
    if isinstance(v, Decimal):
        return f"{v:,.2f}"
    if isinstance(v, float):
        return f"{v:,.2f}"
    return "" if v is None else str(v)


def excel_response(filename, title, subtitle, headers, rows, totals=None, summary=None):
    wb = Workbook()
    ws = wb.active
    ws.title = (title or "Report")[:31]
    biz = BusinessSettings.load().business_name
    ws.append([biz])
    ws["A1"].font = Font(bold=True, size=14, color="0B4F8A")
    ws.append([title])
    ws["A2"].font = Font(bold=True, size=12)
    ws.append([subtitle or ""])
    ws.append([f"Generated: {datetime.now():%d-%m-%Y %H:%M}"])
    if summary:
        ws.append([])
        for k, v in summary:
            ws.append([k, _cell(v)])
            ws.cell(row=ws.max_row, column=1).font = Font(bold=True)
    ws.append([])
    ws.append(headers)
    header_row = ws.max_row
    fill = PatternFill("solid", fgColor="0B4F8A")
    for c in range(1, len(headers) + 1):
        cell = ws.cell(row=header_row, column=c)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = fill
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for r in rows:
        ws.append([_cell(v) for v in r])
    if totals:
        ws.append([_cell(v) for v in totals])
        for c in range(1, len(headers) + 1):
            ws.cell(row=ws.max_row, column=c).font = Font(bold=True)
    for i, h in enumerate(headers, start=1):
        width = max([len(str(h))] + [len(_text(r[i - 1])) for r in rows[:500]] + [8])
        ws.column_dimensions[get_column_letter(i)].width = min(width + 2, 45)
    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)
    buf = BytesIO()
    wb.save(buf)
    resp = HttpResponse(buf.getvalue(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    resp["Content-Disposition"] = f'attachment; filename="{filename}.xlsx"'
    return resp


def pdf_response(filename, title, subtitle, headers, rows, totals=None, summary=None):
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=10 * mm, rightMargin=10 * mm, topMargin=10 * mm, bottomMargin=10 * mm,
                            title=title)
    styles = getSampleStyleSheet()
    s = BusinessSettings.load()
    story = [
        Paragraph(f"<b>{s.business_name}</b>", styles["Title"]),
    ]
    contact = " | ".join(x for x in [s.address.replace("\n", ", "), s.phone] if x)
    if contact:
        story.append(Paragraph(contact, styles["Normal"]))
    story += [
        Paragraph(f"<b>{title}</b>", styles["Heading2"]),
        Paragraph(f"{subtitle or ''} &nbsp;&nbsp; Generated: {datetime.now():%d-%m-%Y %H:%M}", styles["Normal"]),
        Spacer(1, 4 * mm),
    ]
    if summary:
        st = Table([[k, _text(v)] for k, v in summary], hAlign="LEFT")
        st.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.lightgrey), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story += [st, Spacer(1, 4 * mm)]
    small = styles["Normal"].clone("small")
    small.fontSize = 7.5
    small.leading = 9
    data = [headers] + [[Paragraph(_text(v), small) for v in r] for r in rows]
    if totals:
        data.append([_text(v) for v in totals])
    if not rows:
        data.append(["No records"] + [""] * (len(headers) - 1))
    table = Table(data, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0B4F8A")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.lightgrey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F1F5F9")]),
    ]
    if totals:
        style += [("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"), ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#E2E8F0"))]
    table.setStyle(TableStyle(style))
    story.append(table)
    doc.build(story)
    resp = HttpResponse(buf.getvalue(), content_type="application/pdf")
    resp["Content-Disposition"] = f'attachment; filename="{filename}.pdf"'
    return resp


def export_response(kind, *args, **kwargs):
    if kind == "pdf":
        return pdf_response(*args, **kwargs)
    return excel_response(*args, **kwargs)
