"""Dashboard, reports, settings, authentication and backup/restore endpoints."""
import json
from datetime import timedelta

from django.contrib.auth import authenticate
from django.core import serializers as dj_serializers
from django.db import transaction
from django.db.models import Count, F, Q, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from .exports import export_response
from .models import (
    BusinessSettings, CollectionStatus, Customer, Delivery, Driver, Payment, PaymentStatus, ReceivedBy,
    Sequence, WaterType,
)
from .serializers import BusinessSettingsSerializer, ChangePasswordSerializer, DeliverySerializer, PaymentSerializer
from .services import recalculate_all
from .utils import ZERO, date_range, fmt_date, get_date, nz, range_label, today
from .views import delivery_totals

DRINK = Q(water_type=WaterType.DRINKING)
SALT = Q(water_type=WaterType.SALT)


# ---------------------------------------------------------------- auth

class LoginThrottle(ScopedRateThrottle):
    scope = "login"


def user_payload(u):
    return {"id": u.id, "username": u.username, "first_name": u.first_name, "last_name": u.last_name,
            "is_staff": u.is_staff, "is_superuser": u.is_superuser}


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def login_view(request):
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""
    if not username or not password:
        return Response({"detail": "Enter username and password."}, status=400)
    user = authenticate(request, username=username, password=password)
    if not user or not user.is_active:
        return Response({"detail": "Invalid username or password."}, status=400)
    token, _ = Token.objects.get_or_create(user=user)
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
    return Response({"token": token.key, "user": user_payload(user)})


@api_view(["POST"])
def logout_view(request):
    Token.objects.filter(user=request.user).delete()
    return Response({"detail": "Logged out."})


@api_view(["GET"])
def me_view(request):
    return Response(user_payload(request.user))


@api_view(["POST"])
def change_password_view(request):
    s = ChangePasswordSerializer(data=request.data, context={"request": request})
    s.is_valid(raise_exception=True)
    request.user.set_password(s.validated_data["new_password"])
    request.user.save()
    Token.objects.filter(user=request.user).delete()
    token = Token.objects.create(user=request.user)
    return Response({"detail": "Password changed.", "token": token.key})


# ---------------------------------------------------------------- settings

@api_view(["GET", "PUT", "PATCH"])
def settings_view(request):
    obj = BusinessSettings.load()
    if request.method == "GET":
        return Response(BusinessSettingsSerializer(obj).data)
    if not request.user.is_staff:
        return Response({"detail": "Only admin users can change settings."}, status=403)
    s = BusinessSettingsSerializer(obj, data=request.data, partial=True)
    s.is_valid(raise_exception=True)
    s.save()
    return Response(s.data)


# ---------------------------------------------------------------- helpers

def period_stats(d_from, d_to):
    dq = Delivery.objects.filter(delivery_date__range=(d_from, d_to))
    agg = dq.aggregate(
        deliveries=Count("id"), litres=Sum("quantity_litres"), drinking=Sum("quantity_litres", filter=DRINK),
        salt=Sum("quantity_litres", filter=SALT), sales=Sum("total_amount"),
        customers=Count("customer", distinct=True),
    )
    collected = Payment.objects.filter(payment_date__range=(d_from, d_to)).aggregate(s=Sum("amount"))["s"]
    return {"date_from": d_from, "date_to": d_to, "deliveries": agg["deliveries"] or 0, "litres": agg["litres"] or 0,
            "drinking": agg["drinking"] or 0, "salt": agg["salt"] or 0, "sales": nz(agg["sales"]),
            "customers": agg["customers"] or 0, "collected": nz(collected)}


def daily_series(d_from, d_to):
    rows = {d_from + timedelta(days=i): {"date": d_from + timedelta(days=i), "deliveries": 0, "drinking": 0, "salt": 0,
                                        "litres": 0, "sales": ZERO, "collected": ZERO, "pending": ZERO}
            for i in range((d_to - d_from).days + 1)}
    for r in (Delivery.objects.filter(delivery_date__range=(d_from, d_to)).values("delivery_date")
              .annotate(deliveries=Count("id"), litres=Sum("quantity_litres"), drinking=Sum("quantity_litres", filter=DRINK),
                        salt=Sum("quantity_litres", filter=SALT), sales=Sum("total_amount"), pending=Sum("balance"))):
        row = rows[r["delivery_date"]]
        row.update(deliveries=r["deliveries"], litres=r["litres"] or 0, drinking=r["drinking"] or 0,
                   salt=r["salt"] or 0, sales=nz(r["sales"]), pending=nz(r["pending"]))
    for r in Payment.objects.filter(payment_date__range=(d_from, d_to)).values("payment_date").annotate(s=Sum("amount")):
        rows[r["payment_date"]]["collected"] = nz(r["s"])
    return list(rows.values())


def outstanding_total():
    return nz(Customer.objects.filter(current_balance__gt=0).aggregate(s=Sum("current_balance"))["s"])


def customer_brief(c):
    return {"id": c.id, "code": c.code, "name": c.name, "phone": c.phone, "customer_type_label": c.get_customer_type_display(),
            "current_balance": c.current_balance, "payment_status": c.payment_status,
            "last_payment_date": c.last_payment_date, "last_delivery_date": c.last_delivery_date}


# ---------------------------------------------------------------- dashboard

@api_view(["GET"])
def dashboard_view(request):
    day = get_date(request.query_params, "date", today())
    dq = Delivery.objects.filter(delivery_date=day)
    t = delivery_totals(dq)
    pays = Payment.objects.filter(payment_date=day)
    pay_agg = pays.aggregate(total=Sum("amount"), owner=Sum("amount", filter=Q(received_by=ReceivedBy.OWNER)),
                             driver=Sum("amount", filter=Q(received_by=ReceivedBy.DRIVER)))
    owing = Customer.objects.filter(current_balance__gt=0)

    driver_rows = {}
    for r in dq.values("driver_id", "driver__code", "driver__name").annotate(
            deliveries=Count("id"), litres=Sum("quantity_litres"), drinking=Sum("quantity_litres", filter=DRINK),
            salt=Sum("quantity_litres", filter=SALT), sales=Sum("total_amount")):
        driver_rows[r["driver_id"]] = {"driver_id": r["driver_id"], "code": r["driver__code"], "name": r["driver__name"],
                                       "deliveries": r["deliveries"], "litres": r["litres"] or 0, "drinking": r["drinking"] or 0,
                                       "salt": r["salt"] or 0, "sales": nz(r["sales"]), "collected": ZERO}
    for r in pays.filter(received_by=ReceivedBy.DRIVER).values("driver_id", "driver__code", "driver__name").annotate(s=Sum("amount")):
        row = driver_rows.setdefault(r["driver_id"], {"driver_id": r["driver_id"], "code": r["driver__code"], "name": r["driver__name"],
                                                     "deliveries": 0, "litres": 0, "drinking": 0, "salt": 0, "sales": ZERO, "collected": ZERO})
        row["collected"] = nz(r["s"])

    customer_rows = [
        {"customer_id": r["customer_id"], "code": r["customer__code"], "name": r["customer__name"], "deliveries": r["n"],
         "litres": r["litres"] or 0, "bill": nz(r["bill"]), "balance": nz(r["bal"])}
        for r in dq.values("customer_id", "customer__code", "customer__name").annotate(
            n=Count("id"), litres=Sum("quantity_litres"), bill=Sum("total_amount"), bal=Sum("balance")).order_by("-litres")[:10]
    ]

    previous_pending_ids = set(Delivery.objects.filter(balance__gt=0, delivery_date__lt=day).values_list("customer_id", flat=True))
    # owing money from before the selected day: old unpaid deliveries or an un-cleared opening balance
    previous_pending = owing.filter(Q(id__in=previous_pending_ids) | Q(opening_balance__gt=F("total_paid")))

    recent_deliveries = Delivery.objects.select_related("customer", "driver").filter(delivery_date__lte=day).prefetch_related("payments")[:8]
    recent_payments = Payment.objects.select_related("customer", "driver", "delivery").filter(payment_date__lte=day)[:8]

    week_from = day - timedelta(days=6)
    month_from = day.replace(day=1)
    settings_obj = BusinessSettings.load()
    return Response({
        "date": day,
        "today": {
            "drinking_litres": t["drinking"], "salt_litres": t["salt"], "total_litres": t["litres"],
            "deliveries": t["count"], "sales": t["bill"], "collected": nz(pay_agg["total"]),
            "collected_by_owner": nz(pay_agg["owner"]), "collected_by_drivers": nz(pay_agg["driver"]),
            "pending_from_today": t["balance"],
            "total_outstanding": outstanding_total(),
            "unpaid_customers": owing.filter(payment_status=PaymentStatus.UNPAID).count(),
            "partial_customers": owing.filter(payment_status=PaymentStatus.PARTIAL).count(),
            "customers_with_balance": owing.count(),
        },
        "stats": {
            "daily": period_stats(day, day),
            "weekly": period_stats(week_from, day),
            "monthly": period_stats(month_from, day),
        },
        "series": daily_series(day - timedelta(days=13), day),
        "recent_deliveries": DeliverySerializer(recent_deliveries, many=True).data,
        "recent_payments": PaymentSerializer(recent_payments, many=True).data,
        "driver_summary": list(driver_rows.values()),
        "customer_summary": customer_rows,
        "top_outstanding": [customer_brief(c) for c in owing.order_by("-current_balance")[:8]],
        "alerts": {
            "unpaid": [customer_brief(c) for c in owing.filter(payment_status=PaymentStatus.UNPAID).order_by("-current_balance")[:6]],
            "partial": [customer_brief(c) for c in owing.filter(payment_status=PaymentStatus.PARTIAL).order_by("-current_balance")[:6]],
            "previous_pending": [customer_brief(c) for c in previous_pending.distinct().order_by("-current_balance")[:6]],
            "previous_pending_count": previous_pending.distinct().count(),
        },
        "rates_configured": bool(settings_obj.drinking_water_rate or settings_obj.salt_water_rate),
    })


# ---------------------------------------------------------------- business report

def business_report_data(d_from, d_to):
    dq = Delivery.objects.filter(delivery_date__range=(d_from, d_to))
    s = period_stats(d_from, d_to)
    s.update({
        "unpaid_amount": nz(dq.filter(payment_status=PaymentStatus.UNPAID).aggregate(x=Sum("balance"))["x"]),
        "partial_amount": nz(dq.filter(payment_status=PaymentStatus.PARTIAL).aggregate(x=Sum("balance"))["x"]),
        "period_pending": nz(dq.aggregate(x=Sum("balance"))["x"]),
        "total_outstanding": outstanding_total(),
        "collected_by_owner": nz(Payment.objects.filter(payment_date__range=(d_from, d_to), received_by=ReceivedBy.OWNER).aggregate(x=Sum("amount"))["x"]),
        "collected_by_drivers": nz(Payment.objects.filter(payment_date__range=(d_from, d_to), received_by=ReceivedBy.DRIVER).aggregate(x=Sum("amount"))["x"]),
    })
    by_customer_type = [
        {"customer_type": r["customer_type"], "label": dict(Customer._meta.get_field("customer_type").choices).get(r["customer_type"]),
         "deliveries": r["n"], "litres": r["litres"] or 0, "sales": nz(r["sales"])}
        for r in dq.values("customer_type").annotate(n=Count("id"), litres=Sum("quantity_litres"), sales=Sum("total_amount")).order_by("-sales")
    ]
    by_method = [
        {"method": r["payment_method"], "amount": nz(r["s"]), "count": r["n"]}
        for r in Payment.objects.filter(payment_date__range=(d_from, d_to)).values("payment_method").annotate(s=Sum("amount"), n=Count("id"))
    ]
    return {"summary": s, "daily": daily_series(d_from, d_to), "by_customer_type": by_customer_type, "by_payment_method": by_method}


@api_view(["GET"])
def business_report_view(request):
    d_from, d_to = date_range(request.query_params)
    if (d_to - d_from).days > 1100:
        return Response({"detail": "Please choose a range of 3 years or less."}, status=400)
    return Response(business_report_data(d_from, d_to))


@api_view(["GET"])
def business_report_export(request):
    d_from, d_to = date_range(request.query_params)
    data = business_report_data(d_from, d_to)
    s = data["summary"]
    summary = [
        ("Total drinking water supplied (L)", s["drinking"]), ("Total salt water supplied (L)", s["salt"]),
        ("Total litres delivered", s["litres"]), ("Total deliveries", s["deliveries"]),
        ("Total customers served", s["customers"]), ("Total sales", s["sales"]),
        ("Total money collected", s["collected"]), ("  - collected by owner", s["collected_by_owner"]),
        ("  - collected by drivers", s["collected_by_drivers"]), ("Unpaid amount (period deliveries)", s["unpaid_amount"]),
        ("Partially paid balance (period deliveries)", s["partial_amount"]),
        ("Total outstanding balance (all customers, today)", s["total_outstanding"]),
    ]
    headers = ["Date", "Deliveries", "Drinking (L)", "Salt (L)", "Total Litres", "Sales", "Collected", "Pending"]
    rows = [[fmt_date(r["date"]), r["deliveries"], r["drinking"], r["salt"], r["litres"], r["sales"], r["collected"], r["pending"]]
            for r in data["daily"]]
    totals = ["TOTAL", s["deliveries"], s["drinking"], s["salt"], s["litres"], s["sales"], s["collected"], s["period_pending"]]
    return export_response(request.query_params.get("export", "pdf"), f"business-report-{d_from}-to-{d_to}", "Business Report",
                           f"Period: {range_label(d_from, d_to)}", headers, rows, totals, summary=summary)


# ---------------------------------------------------------------- driver report

def driver_report_data(d_from, d_to, driver_id=None):
    drivers = Driver.objects.all().order_by("id")
    if driver_id:
        drivers = drivers.filter(id=driver_id)
    out = []
    for d in drivers:
        dq = Delivery.objects.filter(driver=d, delivery_date__range=(d_from, d_to))
        agg = dq.aggregate(n=Count("id"), drinking=Sum("quantity_litres", filter=DRINK), salt=Sum("quantity_litres", filter=SALT),
                           litres=Sum("quantity_litres"), sales=Sum("total_amount"), pending=Sum("balance"),
                           customers=Count("customer", distinct=True))
        col = Payment.objects.filter(driver=d, received_by=ReceivedBy.DRIVER, payment_date__range=(d_from, d_to)).aggregate(
            total=Sum("amount"), cash=Sum("amount", filter=Q(payment_method="CASH")),
            handed=Sum("amount", filter=Q(collection_status=CollectionStatus.HANDED_OVER)),
            pending=Sum("amount", filter=Q(collection_status=CollectionStatus.PENDING)))
        if not d.is_active and not agg["n"] and not col["total"]:
            continue
        out.append({
            "driver_id": d.id, "code": d.code, "name": d.name, "phone": d.phone, "is_active": d.is_active,
            "deliveries": agg["n"] or 0, "customers": agg["customers"] or 0, "drinking": agg["drinking"] or 0,
            "salt": agg["salt"] or 0, "litres": agg["litres"] or 0, "sales": nz(agg["sales"]),
            "collected": nz(col["total"]), "collected_cash": nz(col["cash"]), "handed_over": nz(col["handed"]),
            "pending_handover": nz(col["pending"]), "pending_payments": nz(agg["pending"]),
        })
    return out


@api_view(["GET"])
def driver_report_view(request):
    d_from, d_to = date_range(request.query_params)
    p = request.query_params
    data = driver_report_data(d_from, d_to, p.get("driver"))
    daily = None
    if p.get("driver"):
        daily = [
            {"date": r["delivery_date"], "deliveries": r["n"], "litres": r["litres"] or 0, "sales": nz(r["sales"]),
             "drinking": r["drinking"] or 0, "salt": r["salt"] or 0}
            for r in Delivery.objects.filter(driver_id=p["driver"], delivery_date__range=(d_from, d_to)).values("delivery_date")
            .annotate(n=Count("id"), litres=Sum("quantity_litres"), sales=Sum("total_amount"),
                      drinking=Sum("quantity_litres", filter=DRINK), salt=Sum("quantity_litres", filter=SALT)).order_by("delivery_date")
        ]
    return Response({"date_from": d_from, "date_to": d_to, "drivers": data, "daily": daily})


@api_view(["GET"])
def driver_report_export(request):
    d_from, d_to = date_range(request.query_params)
    data = driver_report_data(d_from, d_to, request.query_params.get("driver"))
    headers = ["Driver ID", "Driver", "Deliveries", "Drinking (L)", "Salt (L)", "Total Litres", "Sales", "Collected",
               "Handed Over", "Pending Handover", "Pending Payments"]
    rows = [[r["code"], r["name"], r["deliveries"], r["drinking"], r["salt"], r["litres"], r["sales"], r["collected"],
             r["handed_over"], r["pending_handover"], r["pending_payments"]] for r in data]
    keys = ["deliveries", "drinking", "salt", "litres", "sales", "collected", "handed_over", "pending_handover", "pending_payments"]
    totals = ["TOTAL", ""] + [sum((r[k] for r in data), 0) for k in keys]
    return export_response(request.query_params.get("export", "pdf"), f"driver-report-{d_from}-to-{d_to}", "Driver-wise Report",
                           f"Period: {range_label(d_from, d_to)}", headers, rows, totals)


# ---------------------------------------------------------------- driver cash collection

def collection_rows(d_from, d_to, driver_id=None):
    qs = Payment.objects.filter(received_by=ReceivedBy.DRIVER, payment_date__range=(d_from, d_to)).select_related("customer", "driver", "delivery")
    if driver_id:
        qs = qs.filter(driver_id=driver_id)
    return qs.order_by("payment_date", "driver_id", "id")


@api_view(["GET"])
def driver_collections_view(request):
    d_from, d_to = date_range(request.query_params)
    qs = collection_rows(d_from, d_to, request.query_params.get("driver"))
    summary = {}
    for p in qs:
        s = summary.setdefault(p.driver_id, {"driver_id": p.driver_id, "code": p.driver.code, "name": p.driver.name,
                                             "count": 0, "collected": ZERO, "cash": ZERO, "upi": ZERO, "other": ZERO,
                                             "handed_over": ZERO, "pending": ZERO})
        s["count"] += 1
        s["collected"] += p.amount
        key = "cash" if p.payment_method == "CASH" else "upi" if p.payment_method == "UPI" else "other"
        s[key] += p.amount
        s["handed_over" if p.collection_status == CollectionStatus.HANDED_OVER else "pending"] += p.amount
    return Response({"date_from": d_from, "date_to": d_to, "summary": list(summary.values()),
                     "collections": PaymentSerializer(qs, many=True).data})


@api_view(["GET"])
def driver_collections_export(request):
    d_from, d_to = date_range(request.query_params)
    qs = collection_rows(d_from, d_to, request.query_params.get("driver"))
    headers = ["Date", "Driver", "Customer", "Delivery No.", "Payment ID", "Amount", "Method", "Collection Status"]
    rows = [[fmt_date(p.payment_date), p.driver.name, f"{p.customer.name} ({p.customer.code})", p.delivery.code if p.delivery else "-",
             p.code, p.amount, p.get_payment_method_display(), p.get_collection_status_display()] for p in qs]
    total = sum((p.amount for p in qs), ZERO)
    pending = sum((p.amount for p in qs if p.collection_status == CollectionStatus.PENDING), ZERO)
    return export_response(request.query_params.get("export", "pdf"), f"driver-collections-{d_from}-to-{d_to}",
                           "Driver Cash Collection Report", f"Period: {range_label(d_from, d_to)}", headers, rows,
                           ["TOTAL", "", "", "", "", total, "", f"Pending handover: {pending:,.2f}"])


# ---------------------------------------------------------------- backup & restore

BACKUP_MODELS = [Sequence, BusinessSettings, Driver, Customer, Delivery, Payment]


@api_view(["GET"])
@permission_classes([IsAdminUser])
def backup_view(request):
    data = {"app": "jj-selvam-water", "version": 1, "created_at": timezone.now().isoformat(), "records": {}}
    for m in BACKUP_MODELS:
        data["records"][m._meta.label] = json.loads(dj_serializers.serialize("json", m.objects.all().order_by("pk")))
    body = json.dumps(data, indent=1)
    resp = HttpResponse(body, content_type="application/json")
    stamp = timezone.localtime().strftime("%Y%m%d-%H%M")
    resp["Content-Disposition"] = f'attachment; filename="jj-selvam-backup-{stamp}.json"'
    return resp


@api_view(["POST"])
@permission_classes([IsAdminUser])
def restore_view(request):
    f = request.FILES.get("file")
    if not f:
        return Response({"detail": "Choose a backup file (.json)."}, status=400)
    try:
        data = json.loads(f.read().decode("utf-8"))
        assert data.get("app") == "jj-selvam-water"
        records = data["records"]
    except Exception:
        return Response({"detail": "This is not a valid JJ Selvam backup file."}, status=400)
    from django.contrib.auth import get_user_model
    user_ids = set(get_user_model().objects.values_list("id", flat=True))
    counts = {}
    try:
        with transaction.atomic():
            for m in reversed(BACKUP_MODELS):
                m.objects.all().delete()
            for m in BACKUP_MODELS:
                items = records.get(m._meta.label, [])
                for item in items:
                    fields = item.get("fields", {})
                    if "created_by" in fields and fields["created_by"] not in user_ids:
                        fields["created_by"] = None
                objs = list(dj_serializers.deserialize("json", json.dumps(items)))
                for o in objs:
                    o.save()
                counts[m._meta.verbose_name_plural.title()] = len(objs)
            recalculate_all()
    except Exception as e:  # pragma: no cover - reported to user
        return Response({"detail": f"Restore failed, nothing was changed: {e}"}, status=400)
    return Response({"detail": "Restore completed.", "counts": counts})


@api_view(["POST"])
@permission_classes([IsAdminUser])
def recalculate_view(request):
    recalculate_all()
    return Response({"detail": "All customer balances recalculated from deliveries and payments."})


@api_view(["GET"])
@permission_classes([AllowAny])
def health_view(request):
    return Response({"status": "ok", "time": timezone.now()}, status=status.HTTP_200_OK)
