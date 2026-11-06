from django.db import transaction
from django.db.models import Count, Prefetch, Q, Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .exports import export_response
from .models import (
    CollectionStatus, Customer, Delivery, Driver, DriverLeave, Payment, PaymentStatus,
    ReceivedBy, WaterType,
)
from .serializers import (
    CustomerSerializer, DeliverySerializer, DriverLeaveSerializer, DriverSerializer, PaymentSerializer,
)
from .services import recalculate_customer, recalculate_customers
from .utils import ZERO, fmt_date, get_date, nz, range_label


def truthy(v):
    return str(v).lower() in ("1", "true", "yes")


# ---------------------------------------------------------------- filters

def filter_deliveries(qs, p):
    if p.get("date"):
        qs = qs.filter(delivery_date=get_date(p, "date"))
    if p.get("date_from"):
        qs = qs.filter(delivery_date__gte=get_date(p, "date_from"))
    if p.get("date_to"):
        qs = qs.filter(delivery_date__lte=get_date(p, "date_to"))
    for key, field in (("customer", "customer_id"), ("driver", "driver_id"), ("water_type", "water_type"),
                       ("status", "payment_status"), ("customer_type", "customer_type")):
        if p.get(key):
            qs = qs.filter(**{field: p[key]})
    if truthy(p.get("outstanding", "")):
        qs = qs.filter(balance__gt=0)
    s = (p.get("search") or "").strip()
    if s:
        qs = qs.filter(Q(customer_name__icontains=s) | Q(customer__code__iexact=s) | Q(code__iexact=s)
                       | Q(customer__phone__icontains=s) | Q(driver_name__icontains=s))
    return qs


def filter_payments(qs, p):
    if p.get("date"):
        qs = qs.filter(payment_date=get_date(p, "date"))
    if p.get("date_from"):
        qs = qs.filter(payment_date__gte=get_date(p, "date_from"))
    if p.get("date_to"):
        qs = qs.filter(payment_date__lte=get_date(p, "date_to"))
    for key, field in (("customer", "customer_id"), ("driver", "driver_id"), ("received_by", "received_by"),
                       ("payment_method", "payment_method"), ("collection_status", "collection_status"),
                       ("delivery", "delivery_id")):
        if p.get(key):
            qs = qs.filter(**{field: p[key]})
    s = (p.get("search") or "").strip()
    if s:
        qs = qs.filter(Q(customer__name__icontains=s) | Q(customer__code__iexact=s) | Q(code__iexact=s)
                       | Q(reference__icontains=s) | Q(customer__phone__icontains=s))
    return qs


def delivery_totals(qs):
    agg = qs.aggregate(
        count=Count("id"), litres=Sum("quantity_litres"),
        drinking=Sum("quantity_litres", filter=Q(water_type=WaterType.DRINKING)),
        salt=Sum("quantity_litres", filter=Q(water_type=WaterType.SALT)),
        bill=Sum("total_amount"), paid=Sum("paid_amount"), balance=Sum("balance"),
    )
    return {k: (v or 0) for k, v in agg.items()}


# ---------------------------------------------------------------- drivers

class DriverViewSet(viewsets.ModelViewSet):
    serializer_class = DriverSerializer

    def get_queryset(self):
        qs = Driver.objects.annotate(delivery_count=Count("deliveries"))
        p = self.request.query_params
        if p.get("is_active") in ("true", "false"):
            qs = qs.filter(is_active=p["is_active"] == "true")
        s = (p.get("search") or "").strip()
        if s:
            qs = qs.filter(Q(name__icontains=s) | Q(code__iexact=s) | Q(phone__icontains=s))
        return qs.order_by("id")

    def destroy(self, request, *args, **kwargs):
        driver = self.get_object()
        n_del = driver.deliveries.count()
        n_col = driver.collections.count()
        if n_del or n_col:
            return Response(
                {"detail": f"{driver.name} has {n_del} deliveries and {n_col} collections in history, so the record "
                           f"cannot be deleted. Mark the driver as inactive instead to keep the history."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        driver.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DriverLeaveViewSet(viewsets.ModelViewSet):
    serializer_class = DriverLeaveSerializer
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        qs = DriverLeave.objects.select_related("driver")
        params = self.request.query_params
        if params.get("driver"):
            qs = qs.filter(driver_id=params["driver"])
        if params.get("date_from"):
            qs = qs.filter(date__gte=get_date(params, "date_from"))
        if params.get("date_to"):
            qs = qs.filter(date__lte=get_date(params, "date_to"))
        return qs


# ---------------------------------------------------------------- customers

class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer

    def get_queryset(self):
        qs = Customer.objects.all()
        p = self.request.query_params
        s = (p.get("search") or "").strip()
        if s:
            qs = qs.filter(Q(name__icontains=s) | Q(code__iexact=s) | Q(code__icontains=s) | Q(phone__icontains=s))
        if p.get("customer_type"):
            qs = qs.filter(customer_type=p["customer_type"])
        if p.get("water_type"):
            qs = qs.filter(water_type__in=[p["water_type"], "BOTH"])
        if p.get("is_active") in ("true", "false"):
            qs = qs.filter(is_active=p["is_active"] == "true")
        if p.get("status"):
            qs = apply_balance_status(qs, p["status"])
        ordering = p.get("ordering")
        allowed = {"name", "-name", "code", "id", "-id", "current_balance", "-current_balance", "-last_delivery_date"}
        return qs.order_by(ordering if ordering in allowed else "id")

    def perform_create(self, serializer):
        with transaction.atomic():
            c = serializer.save()
            recalculate_customer(c.id)

    def perform_update(self, serializer):
        with transaction.atomic():
            c = serializer.save()
            recalculate_customer(c.id)

    def destroy(self, request, *args, **kwargs):
        c = self.get_object()
        n_del, n_pay = c.deliveries.count(), c.payments.count()
        if n_del or n_pay:
            return Response(
                {"detail": f"{c.name} has {n_del} deliveries and {n_pay} payments in history, so the record cannot be "
                           f"deleted. Mark the customer as inactive instead to keep the history and balances."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        c.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # -------- payment filter page: All / Not Paid / Partially Paid / Balance Pending / Fully Paid
    def _balances_queryset(self):
        p = self.request.query_params
        qs = Customer.objects.all()
        s = (p.get("search") or "").strip()
        if s:
            qs = qs.filter(Q(name__icontains=s) | Q(code__iexact=s) | Q(code__icontains=s) | Q(phone__icontains=s))
        if p.get("customer_type"):
            qs = qs.filter(customer_type=p["customer_type"])
        qs = apply_balance_status(qs, p.get("status") or "ALL")

        dq = Q()
        filtered = False
        if p.get("water_type"):
            dq &= Q(deliveries__water_type=p["water_type"])
            filtered = True
        if p.get("driver"):
            dq &= Q(deliveries__driver_id=p["driver"])
            filtered = True
        if p.get("date_from"):
            dq &= Q(deliveries__delivery_date__gte=get_date(p, "date_from"))
            filtered = True
        if p.get("date_to"):
            dq &= Q(deliveries__delivery_date__lte=get_date(p, "date_to"))
            filtered = True
        if filtered:
            qs = qs.annotate(
                f_count=Count("deliveries", filter=dq), f_litres=Sum("deliveries__quantity_litres", filter=dq),
                f_bill=Sum("deliveries__total_amount", filter=dq),
            ).filter(f_count__gt=0)
        ordering = p.get("ordering") or "-current_balance"
        allowed = {"-current_balance", "current_balance", "name", "code", "-last_delivery_date", "last_payment_date"}
        return qs.order_by(ordering if ordering in allowed else "-current_balance", "id"), filtered

    def _balance_row(self, c, filtered):
        return {
            "id": c.id, "code": c.code, "name": c.name, "phone": c.phone, "customer_type": c.customer_type,
            "customer_type_label": c.get_customer_type_display(), "water_type": c.water_type,
            "total_litres": c.total_litres, "total_billed": c.total_billed + c.opening_balance,
            "opening_balance": c.opening_balance, "total_paid": c.total_paid,
            "current_balance": c.current_balance, "payment_status": c.payment_status,
            "payment_status_label": c.get_payment_status_display(),
            "last_payment_date": c.last_payment_date, "last_delivery_date": c.last_delivery_date,
            "period_litres": getattr(c, "f_litres", None) if filtered else None,
            "period_bill": getattr(c, "f_bill", None) if filtered else None,
        }

    @action(detail=False, methods=["get"])
    def balances(self, request):
        qs, filtered = self._balances_queryset()
        totals = qs.aggregate(outstanding=Sum("current_balance", filter=Q(current_balance__gt=0)), count=Count("id"),
                              billed=Sum("total_billed"), paid=Sum("total_paid"), opening=Sum("opening_balance"))
        page = self.paginate_queryset(qs)
        rows = [self._balance_row(c, filtered) for c in page]
        extra = {"totals": {
            "count": totals["count"] or 0, "outstanding": nz(totals["outstanding"]),
            "billed": nz(totals["billed"]) + nz(totals["opening"]), "paid": nz(totals["paid"]),
        }, "delivery_filtered": filtered}
        return self.paginator.get_paginated_response(rows, extra)

    @action(detail=False, methods=["get"], url_path="balances/export")
    def balances_export(self, request):
        qs, filtered = self._balances_queryset()
        status_label = {"ALL": "All Customers", "UNPAID": "Not Paid", "PARTIAL": "Partially Paid",
                        "PENDING": "Balance Pending", "PAID": "Fully Paid"}.get(request.query_params.get("status") or "ALL", "All")
        headers = ["Customer ID", "Name", "Contact", "Type", "Total Litres", "Total Bill", "Total Paid",
                   "Balance", "Status", "Last Payment", "Last Delivery"]
        rows, total = [], ZERO
        for c in qs:
            r = self._balance_row(c, filtered)
            total += max(c.current_balance, ZERO)
            rows.append([c.code, c.name, c.phone, r["customer_type_label"], c.total_litres, r["total_billed"],
                         c.total_paid, c.current_balance, r["payment_status_label"], fmt_date(c.last_payment_date),
                         fmt_date(c.last_delivery_date)])
        totals = ["TOTAL OUTSTANDING", "", "", "", "", "", "", total, "", "", ""]
        return export_response(request.query_params.get("export", "xlsx"), f"customers-{status_label.lower().replace(' ', '-')}",
                               f"Customer Balances - {status_label}", f"{len(rows)} customers", headers, rows, totals)

    # -------- ledger
    def _ledger(self, customer, d_from, d_to):
        deliveries = customer.deliveries.all()
        payments = customer.payments.select_related("delivery", "driver")
        opening = customer.opening_balance
        if d_from:
            before_bill = nz(deliveries.filter(delivery_date__lt=d_from).aggregate(s=Sum("total_amount"))["s"])
            before_paid = nz(payments.filter(payment_date__lt=d_from).aggregate(s=Sum("amount"))["s"])
            opening = opening + before_bill - before_paid
            deliveries = deliveries.filter(delivery_date__gte=d_from)
            payments = payments.filter(payment_date__gte=d_from)
        if d_to:
            deliveries = deliveries.filter(delivery_date__lte=d_to)
            payments = payments.filter(payment_date__lte=d_to)
        events = []
        for d in deliveries:
            events.append(((d.delivery_date, 0, d.delivery_time.isoformat(), d.id), {
                "type": "DELIVERY", "date": d.delivery_date, "ref": d.code, "id": d.id,
                "description": f"{d.get_water_type_display()} - {d.quantity_litres} L by {d.driver_name}",
                "water_type": d.water_type, "water_type_label": d.get_water_type_display(),
                "litres": d.quantity_litres, "bill": d.total_amount, "payment": None, "payment_date": None,
                "payment_method": None, "status": d.payment_status, "status_label": d.get_payment_status_display(),
                "delivery_balance": d.balance,
            }))
        for p in payments:
            via = f"{p.get_payment_method_display()} - {p.get_received_by_display()}"
            if p.driver:
                via += f" ({p.driver.name})"
            events.append(((p.payment_date, 1, p.created_at.isoformat(), p.id), {
                "type": "PAYMENT", "date": p.payment_date, "ref": p.code, "id": p.id,
                "description": f"Payment received - {via}" + (f" for {p.delivery.code}" if p.delivery else ""),
                "water_type": None, "water_type_label": None, "litres": None, "bill": None, "payment": p.amount,
                "payment_date": p.payment_date, "payment_method": p.get_payment_method_display(),
                "status": None, "status_label": None, "delivery_balance": None,
            }))
        events.sort(key=lambda e: e[0])
        running = opening
        rows = []
        tot_bill = tot_paid = ZERO
        tot_litres = 0
        for _, e in events:
            if e["bill"] is not None:
                running += e["bill"]
                tot_bill += e["bill"]
                tot_litres += e["litres"]
            if e["payment"] is not None:
                running -= e["payment"]
                tot_paid += e["payment"]
            e["balance"] = running
            rows.append(e)
        return {
            "customer": CustomerSerializer(customer).data,
            "date_from": d_from, "date_to": d_to,
            "opening_balance": opening, "closing_balance": running,
            "total_bill": tot_bill, "total_paid": tot_paid, "total_litres": tot_litres,
            "current_outstanding": customer.current_balance, "entries": rows,
        }

    @action(detail=True, methods=["get"])
    def ledger(self, request, pk=None):
        c = self.get_object()
        p = request.query_params
        return Response(self._ledger(c, get_date(p, "date_from"), get_date(p, "date_to")))

    @action(detail=True, methods=["get"], url_path="ledger/export")
    def ledger_export(self, request, pk=None):
        c = self.get_object()
        p = request.query_params
        d_from, d_to = get_date(p, "date_from"), get_date(p, "date_to")
        led = self._ledger(c, d_from, d_to)
        headers = ["Date", "Type", "Ref No.", "Details", "Litres", "Bill Amount", "Payment Received", "Balance"]
        rows = [[fmt_date(led["date_from"]) if d_from else "", "Opening", "", "Previous outstanding balance", "", "", "",
                 led["opening_balance"]]]
        for e in led["entries"]:
            rows.append([fmt_date(e["date"]), e["type"].title(), e["ref"], e["description"], e["litres"] or "",
                         e["bill"] if e["bill"] is not None else "", e["payment"] if e["payment"] is not None else "", e["balance"]])
        totals = ["", "", "", "TOTAL", led["total_litres"], led["total_bill"], led["total_paid"], led["closing_balance"]]
        period = range_label(d_from, d_to) if d_from and d_to else "Full history"
        summary = [("Customer", f"{c.code} - {c.name}"), ("Type", c.get_customer_type_display()), ("Contact", c.phone),
                   ("Address", c.address.replace("\n", ", ")), ("Period", period),
                   ("Opening balance", led["opening_balance"]), ("Total billed", led["total_bill"]),
                   ("Total paid", led["total_paid"]), ("Closing balance", led["closing_balance"]),
                   ("Current outstanding (today)", c.current_balance)]
        return export_response(p.get("export", "pdf"), f"statement-{c.code}", "Customer Statement",
                               f"{c.code} - {c.name}", headers, rows, totals, summary=summary)


def apply_balance_status(qs, st):
    st = (st or "ALL").upper()
    if st == "UNPAID":
        return qs.filter(current_balance__gt=0, payment_status=PaymentStatus.UNPAID)
    if st == "PARTIAL":
        return qs.filter(current_balance__gt=0, payment_status=PaymentStatus.PARTIAL)
    if st == "PENDING":
        return qs.filter(current_balance__gt=0)
    if st == "PAID":
        return qs.filter(current_balance__lte=0).filter(Q(total_billed__gt=0) | Q(opening_balance__gt=0))
    return qs


# ---------------------------------------------------------------- deliveries

class DeliveryViewSet(viewsets.ModelViewSet):
    serializer_class = DeliverySerializer

    def get_queryset(self):
        qs = Delivery.objects.select_related("customer", "driver").prefetch_related(
            Prefetch("payments", queryset=Payment.objects.filter(is_delivery_payment=True))
        )
        return filter_deliveries(qs, self.request.query_params)

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        totals = delivery_totals(qs)
        page = self.paginate_queryset(qs)
        data = self.get_serializer(page, many=True).data
        return self.paginator.get_paginated_response(data, {"totals": totals})

    def destroy(self, request, *args, **kwargs):
        d = self.get_object()
        with transaction.atomic():
            cid = d.customer_id
            # the payment typed into this delivery form is part of this entry: remove it too.
            # later payments linked to it stay and are re-applied to the customer's other dues.
            d.payments.filter(is_delivery_payment=True).delete()
            d.delete()
            recalculate_customers(cid)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"])
    def export(self, request):
        p = request.query_params
        qs = self.get_queryset().order_by("delivery_date", "delivery_time", "id")
        headers = ["Delivery No.", "Date", "Time", "Customer", "Type", "Driver", "Water Type", "Litres",
                   "Bill Amount", "Paid Amount", "Balance", "Status"]
        rows = [[d.code, fmt_date(d.delivery_date), d.delivery_time.strftime("%H:%M"), f"{d.customer_name} ({d.customer.code})",
                 d.get_customer_type_display(), d.driver_name, d.get_water_type_display(), d.quantity_litres,
                 d.total_amount, d.paid_amount, d.balance, d.get_payment_status_display()] for d in qs]
        t = delivery_totals(qs)
        totals = ["TOTAL", "", "", f"{t['count']} deliveries", "", "", "", t["litres"], t["bill"], t["paid"], t["balance"], ""]
        if p.get("date"):
            sub = f"Date: {fmt_date(get_date(p, 'date'))}"
            name = f"logbook-{p['date']}"
        else:
            sub = f"Period: {range_label(get_date(p, 'date_from'), get_date(p, 'date_to'))}" if p.get("date_from") and p.get("date_to") else "All dates"
            name = "deliveries"
        summary = [("Drinking water (L)", t["drinking"]), ("Salt water (L)", t["salt"]), ("Total litres", t["litres"]),
                   ("Total bill", t["bill"]), ("Paid", t["paid"]), ("Balance", t["balance"])]
        return export_response(p.get("export", "xlsx"), name, "Daily Delivery Logbook" if p.get("date") else "Water Deliveries",
                               sub, headers, rows, totals, summary=summary)


# ---------------------------------------------------------------- payments

class PaymentViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentSerializer

    def get_queryset(self):
        qs = Payment.objects.select_related("customer", "delivery", "driver")
        return filter_payments(qs, self.request.query_params)

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        agg = qs.aggregate(
            count=Count("id"), total=Sum("amount"),
            owner=Sum("amount", filter=Q(received_by=ReceivedBy.OWNER)),
            driver=Sum("amount", filter=Q(received_by=ReceivedBy.DRIVER)),
            pending_handover=Sum("amount", filter=Q(collection_status=CollectionStatus.PENDING)),
            handed_over=Sum("amount", filter=Q(collection_status=CollectionStatus.HANDED_OVER)),
        )
        page = self.paginate_queryset(qs)
        return self.paginator.get_paginated_response(self.get_serializer(page, many=True).data,
                                                     {"totals": {k: (v or 0) for k, v in agg.items()}})

    def perform_destroy(self, instance):
        with transaction.atomic():
            cid = instance.customer_id
            instance.delete()
            recalculate_customers(cid)

    @action(detail=False, methods=["post"], url_path="mark-handed-over")
    def mark_handed_over(self, request):
        ids = request.data.get("ids") or []
        undo = bool(request.data.get("undo"))
        if not isinstance(ids, list) or not ids:
            return Response({"detail": "Select at least one collection."}, status=400)
        qs = Payment.objects.filter(id__in=ids, received_by=ReceivedBy.DRIVER)
        if undo:
            n = qs.update(collection_status=CollectionStatus.PENDING, handed_over_at=None)
        else:
            n = qs.filter(collection_status=CollectionStatus.PENDING).update(
                collection_status=CollectionStatus.HANDED_OVER, handed_over_at=timezone.now())
        return Response({"updated": n})

    @action(detail=False, methods=["get"])
    def export(self, request):
        p = request.query_params
        qs = self.get_queryset().order_by("payment_date", "id")
        headers = ["Payment ID", "Date", "Customer", "Delivery No.", "Amount", "Method", "Received By", "Driver",
                   "Collection Status", "Reference"]
        rows = [[x.code, fmt_date(x.payment_date), f"{x.customer.name} ({x.customer.code})", x.delivery.code if x.delivery else "",
                 x.amount, x.get_payment_method_display(), x.get_received_by_display(), x.driver.name if x.driver else "",
                 x.get_collection_status_display(), x.reference] for x in qs]
        total = qs.aggregate(s=Sum("amount"))["s"] or ZERO
        sub = range_label(get_date(p, "date_from"), get_date(p, "date_to")) if p.get("date_from") and p.get("date_to") else "All dates"
        return export_response(p.get("export", "xlsx"), "payments", "Payment Transactions", sub, headers, rows,
                               ["TOTAL", "", f"{len(rows)} payments", "", total, "", "", "", "", ""])
