"""Create sample drivers, customers, deliveries and payments for trying the app.

    python manage.py seed_demo

Do NOT run this on your live business database.
"""
import random
from datetime import time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from core.models import BusinessSettings, Customer, Delivery, Driver, Payment, ReceivedBy, CollectionStatus
from core.services import money, recalculate_all


class Command(BaseCommand):
    help = "Load demo data (for testing only)"

    def handle(self, *args, **opts):
        if Customer.objects.exists():
            self.stdout.write(self.style.WARNING("Customers already exist - demo data not loaded."))
            return
        random.seed(7)
        with transaction.atomic():
            s = BusinessSettings.load()
            s.drinking_water_rate = Decimal("0.40")
            s.salt_water_rate = Decimal("0.20")
            s.save()
            drivers = [Driver.objects.create(name="Murugan", phone="9000000001"),
                       Driver.objects.create(name="Karthik", phone="9000000002")]
            specs = [("Hotel Saravana Bhavan", "HOTEL", "DRINKING", 2000), ("Annapoorna Restaurant", "RESTAURANT", "DRINKING", 1000),
                     ("Kumar Residence", "HOUSE", "SALT", 500), ("Lakshmi Textiles", "SHOP", "SALT", 750),
                     ("Sri Balaji Complex", "COMMERCIAL", "BOTH", 5000), ("Green Park Hotel", "HOTEL", "BOTH", 3000)]
            customers = [Customer.objects.create(name=n, customer_type=t, water_type=w, regular_quantity=q,
                                                 phone=f"98400000{i:02d}", address="Chennai",
                                                 opening_balance=Decimal("1500") if i == 2 else Decimal("0"))
                         for i, (n, t, w, q) in enumerate(specs)]
            today = timezone.localdate()
            for day in range(20, -1, -1):
                d = today - timedelta(days=day)
                for c in random.sample(customers, 3):
                    wt = c.water_type if c.water_type != "BOTH" else random.choice(["DRINKING", "SALT"])
                    qty = c.regular_quantity or 500
                    drv = random.choice(drivers)
                    rate = s.rate_for(wt)
                    dl = Delivery.objects.create(delivery_date=d, delivery_time=time(random.randint(6, 18), 0), customer=c, driver=drv,
                                                 customer_name=c.name, customer_type=c.customer_type, driver_name=drv.name,
                                                 water_type=wt, quantity_litres=qty, rate_per_litre=rate, total_amount=money(qty * rate))
                    roll = random.random()
                    paid = dl.total_amount if roll < 0.5 else money(dl.total_amount / 2) if roll < 0.75 else Decimal("0")
                    if paid > 0:
                        Payment.objects.create(customer=c, delivery=dl, is_delivery_payment=True, amount=paid, payment_date=d,
                                               payment_method=random.choice(["CASH", "UPI"]), received_by=ReceivedBy.DRIVER, driver=drv,
                                               collection_status=CollectionStatus.HANDED_OVER if day > 1 else CollectionStatus.PENDING)
            Payment.objects.create(customer=customers[2], amount=Decimal("1000"), payment_date=today - timedelta(days=3),
                                   payment_method="BANK", received_by=ReceivedBy.OWNER)
            recalculate_all()
        self.stdout.write(self.style.SUCCESS("Demo data loaded."))
