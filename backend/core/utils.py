from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError

ZERO = Decimal("0.00")


def today():
    return timezone.localdate()


def get_date(params, key, default=None):
    raw = params.get(key)
    if not raw:
        return default
    d = parse_date(raw)
    if not d:
        raise ValidationError({key: "Use date format YYYY-MM-DD."})
    return d


def date_range(params, default_days=0):
    """Return (date_from, date_to) from ?date_from=&date_to= (defaults to today)."""
    t = today()
    d_to = get_date(params, "date_to", t)
    d_from = get_date(params, "date_from", d_to - timedelta(days=default_days))
    if d_from > d_to:
        raise ValidationError({"date_from": "Start date must be before end date."})
    return d_from, d_to


def nz(v):
    return v if v is not None else ZERO


def fmt_date(d):
    if not d:
        return ""
    if isinstance(d, date):
        return d.strftime("%d-%m-%Y")
    return str(d)


def range_label(d_from, d_to):
    return fmt_date(d_from) if d_from == d_to else f"{fmt_date(d_from)} to {fmt_date(d_to)}"
