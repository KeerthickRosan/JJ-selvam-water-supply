"""
Financial engine. Every change to a delivery or payment calls recalculate_customer(),
which rebuilds that customer's balances from the real records inside a locked
database transaction. Because figures are rebuilt (not incremented), editing or
deleting anything can never double-count a payment or leave a stale balance.

Allocation rules
  1. A payment linked to a specific delivery pays that delivery first.
  2. Any extra money, plus payments not linked to a delivery, clears the
     previous (opening) balance first, then the oldest unpaid deliveries.
  3. Money left over is an advance (customer balance goes negative).
"""
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction

from .models import ZERO, Customer, Delivery, PaymentStatus

CENT = Decimal("0.01")


def money(value):
    return Decimal(value or 0).quantize(CENT, rounding=ROUND_HALF_UP)


def status_for(total, paid):
    total, paid = money(total), money(paid)
    if paid >= total:
        return PaymentStatus.PAID
    if paid > ZERO:
        return PaymentStatus.PARTIAL
    return PaymentStatus.UNPAID


def recalculate_customer(customer_id):
    if not customer_id:
        return None
    with transaction.atomic():
        customer = Customer.objects.select_for_update().get(pk=customer_id)
        deliveries = list(customer.deliveries.order_by("delivery_date", "delivery_time", "id"))
        payments = list(customer.payments.all())

        linked = defaultdict(lambda: ZERO)
        pool = ZERO
        delivery_ids = {d.id for d in deliveries}
        for p in payments:
            if p.delivery_id and p.delivery_id in delivery_ids:
                linked[p.delivery_id] += p.amount
            else:
                pool += p.amount

        allocated = {}
        for d in deliveries:
            direct = min(linked[d.id], d.total_amount)
            allocated[d.id] = direct
            pool += linked[d.id] - direct

        opening_paid = min(pool, customer.opening_balance) if customer.opening_balance > 0 else ZERO
        pool -= opening_paid

        for d in deliveries:
            due = d.total_amount - allocated[d.id]
            if due > 0 and pool > 0:
                take = min(due, pool)
                allocated[d.id] += take
                pool -= take

        changed = []
        any_partial = False
        any_unpaid = False
        if customer.opening_balance > opening_paid:
            any_partial |= opening_paid > 0
            any_unpaid |= opening_paid == 0
        for d in deliveries:
            paid = money(allocated[d.id])
            bal = money(d.total_amount - paid)
            st = status_for(d.total_amount, paid)
            if st == PaymentStatus.PARTIAL:
                any_partial = True
            elif st == PaymentStatus.UNPAID and d.total_amount > 0:
                any_unpaid = True
            if (d.paid_amount, d.balance, d.payment_status) != (paid, bal, st):
                d.paid_amount, d.balance, d.payment_status = paid, bal, st
                changed.append(d)
        if changed:
            Delivery.objects.bulk_update(changed, ["paid_amount", "balance", "payment_status"])

        total_billed = money(sum((d.total_amount for d in deliveries), ZERO))
        total_paid = money(sum((p.amount for p in payments), ZERO))
        customer.total_billed = total_billed
        customer.total_paid = total_paid
        customer.total_litres = sum(d.quantity_litres for d in deliveries)
        customer.current_balance = money(customer.opening_balance + total_billed - total_paid)
        if customer.current_balance <= 0:
            customer.payment_status = PaymentStatus.PAID
        elif any_partial:
            customer.payment_status = PaymentStatus.PARTIAL
        else:
            customer.payment_status = PaymentStatus.UNPAID
        customer.last_payment_date = max((p.payment_date for p in payments), default=None)
        customer.last_delivery_date = max((d.delivery_date for d in deliveries), default=None)
        customer.save(update_fields=[
            "total_billed", "total_paid", "total_litres", "current_balance", "payment_status",
            "last_payment_date", "last_delivery_date", "updated_at",
        ])
        return customer


def recalculate_customers(*ids):
    for cid in sorted({i for i in ids if i}):
        recalculate_customer(cid)


def recalculate_all():
    for cid in Customer.objects.values_list("id", flat=True):
        recalculate_customer(cid)
