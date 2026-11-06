"""
Database design for JJ Selvam Water Supply.

Tables (MySQL):
  core_sequence          - counters for CUST001 / DRV001 / DEL001 / PAY001 codes
  core_businesssettings  - business name, water rates per litre (single row)
  core_driver            - drivers
  core_customer          - customers + cached balance figures
  core_delivery          - every water delivery (bill)
  core_payment           - every payment received (owner or driver collection)
  auth_user / authtoken  - login users and API tokens (Django built-in)

The customer ledger is derived from deliveries + payments (never stored twice),
so it can never drift from the real transactions.
"""
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models, transaction

ZERO = Decimal("0.00")


class WaterType(models.TextChoices):
    DRINKING = "DRINKING", "Drinking Water"
    SALT = "SALT", "Salt Water"


class CustomerWaterType(models.TextChoices):
    DRINKING = "DRINKING", "Drinking Water"
    SALT = "SALT", "Salt Water"
    BOTH = "BOTH", "Both"


class CustomerType(models.TextChoices):
    HOTEL = "HOTEL", "Hotel"
    HOUSE = "HOUSE", "House"
    RESTAURANT = "RESTAURANT", "Restaurant"
    SHOP = "SHOP", "Shop"
    COMMERCIAL = "COMMERCIAL", "Commercial Building"
    OTHER = "OTHER", "Other Business"


class PaymentStatus(models.TextChoices):
    PAID = "PAID", "Paid"
    PARTIAL = "PARTIAL", "Partially Paid"
    UNPAID = "UNPAID", "Unpaid"


class PaymentMethod(models.TextChoices):
    CASH = "CASH", "Cash"
    UPI = "UPI", "UPI"
    BANK = "BANK", "Bank Transfer"
    CHEQUE = "CHEQUE", "Cheque"
    OTHER = "OTHER", "Other"


class ReceivedBy(models.TextChoices):
    OWNER = "OWNER", "Owner / Office"
    DRIVER = "DRIVER", "Driver"


class CollectionStatus(models.TextChoices):
    NA = "NA", "Not applicable"
    PENDING = "PENDING", "Pending handover"
    HANDED_OVER = "HANDED_OVER", "Handed over"


class PricingMode(models.TextChoices):
    PER_LITRE = "PER_LITRE", "Price per litre"
    FIXED = "FIXED", "Fixed total price"


class Sequence(models.Model):
    """Row-locked counter so codes never duplicate, even with simultaneous users."""

    prefix = models.CharField(max_length=10, unique=True)
    last_value = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"{self.prefix}: {self.last_value}"

    @classmethod
    def next_code(cls, prefix):
        with transaction.atomic():
            cls.objects.get_or_create(prefix=prefix)
            seq = cls.objects.select_for_update().get(prefix=prefix)
            seq.last_value += 1
            seq.save(update_fields=["last_value"])
            return f"{prefix}{seq.last_value:03d}"


class CodedModel(models.Model):
    CODE_PREFIX = ""
    code = models.CharField(max_length=20, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = Sequence.next_code(self.CODE_PREFIX)
        super().save(*args, **kwargs)


class BusinessSettings(models.Model):
    business_name = models.CharField(max_length=150, default="JJ Selvam Water Supply")
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    drinking_water_rate = models.DecimalField(
        max_digits=10, decimal_places=4, default=Decimal("0"), validators=[MinValueValidator(0)],
        help_text="Default price per litre for drinking water",
    )
    salt_water_rate = models.DecimalField(
        max_digits=10, decimal_places=4, default=Decimal("0"), validators=[MinValueValidator(0)],
        help_text="Default price per litre for salt water",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Business settings"

    def __str__(self):
        return self.business_name

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def rate_for(self, water_type):
        return self.drinking_water_rate if water_type == WaterType.DRINKING else self.salt_water_rate


class Driver(CodedModel):
    CODE_PREFIX = "DRV"
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20, unique=True)
    weekly_salary = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(0)])
    address = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.code} - {self.name}"


class DriverLeave(models.Model):
    driver = models.ForeignKey(Driver, on_delete=models.CASCADE, related_name="leave_days")
    date = models.DateField()
    notes = models.CharField(max_length=250, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["driver", "date"], name="unique_driver_leave_date"),
        ]

    def __str__(self):
        return f"{self.driver.name} - {self.date}"


class Customer(CodedModel):
    CODE_PREFIX = "CUST"
    name = models.CharField(max_length=150, db_index=True)
    customer_type = models.CharField(max_length=20, choices=CustomerType.choices, default=CustomerType.HOUSE)
    phone = models.CharField(max_length=20, blank=True, db_index=True)
    address = models.TextField(blank=True)
    water_type = models.CharField(max_length=10, choices=CustomerWaterType.choices, default=CustomerWaterType.DRINKING)
    regular_quantity = models.PositiveIntegerField(null=True, blank=True, help_text="Usual litres per delivery")
    opening_balance = models.DecimalField(
        max_digits=12, decimal_places=2, default=ZERO, validators=[MinValueValidator(0)],
        help_text="Previous outstanding balance before using this system",
    )
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    # Cached figures, always rebuilt by services.recalculate_customer()
    total_litres = models.PositiveBigIntegerField(default=0)
    total_billed = models.DecimalField(max_digits=14, decimal_places=2, default=ZERO)
    total_paid = models.DecimalField(max_digits=14, decimal_places=2, default=ZERO)
    current_balance = models.DecimalField(max_digits=14, decimal_places=2, default=ZERO, db_index=True)
    payment_status = models.CharField(max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.PAID, db_index=True)
    last_payment_date = models.DateField(null=True, blank=True)
    last_delivery_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["customer_type"]), models.Index(fields=["payment_status", "current_balance"])]

    def __str__(self):
        return f"{self.code} - {self.name}"


class Delivery(CodedModel):
    CODE_PREFIX = "DEL"
    delivery_date = models.DateField(db_index=True)
    delivery_time = models.TimeField()
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="deliveries")
    driver = models.ForeignKey(Driver, on_delete=models.PROTECT, related_name="deliveries")
    # Snapshots so history stays correct even if names change later
    customer_name = models.CharField(max_length=150)
    customer_type = models.CharField(max_length=20, choices=CustomerType.choices)
    driver_name = models.CharField(max_length=120)

    water_type = models.CharField(max_length=10, choices=WaterType.choices)
    quantity_litres = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    pricing_mode = models.CharField(max_length=10, choices=PricingMode.choices, default=PricingMode.PER_LITRE)
    rate_per_litre = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal("0"))
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])

    # Cached allocation results (rebuilt by services.recalculate_customer)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    payment_status = models.CharField(max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.UNPAID, db_index=True)

    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-delivery_date", "-delivery_time", "-id"]
        verbose_name_plural = "Deliveries"
        indexes = [
            models.Index(fields=["customer", "delivery_date"]),
            models.Index(fields=["driver", "delivery_date"]),
            models.Index(fields=["water_type", "delivery_date"]),
        ]

    def __str__(self):
        return f"{self.code} - {self.customer_name} - {self.quantity_litres}L"


class Payment(CodedModel):
    CODE_PREFIX = "PAY"
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="payments")
    delivery = models.ForeignKey(
        Delivery, null=True, blank=True, on_delete=models.SET_NULL, related_name="payments",
        help_text="Optional: delivery this payment is for. Empty = applied to oldest outstanding dues.",
    )
    is_delivery_payment = models.BooleanField(default=False, help_text="Entered together with the delivery form")
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    payment_date = models.DateField(db_index=True)
    payment_method = models.CharField(max_length=10, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    received_by = models.CharField(max_length=10, choices=ReceivedBy.choices, default=ReceivedBy.OWNER, db_index=True)
    driver = models.ForeignKey(Driver, null=True, blank=True, on_delete=models.PROTECT, related_name="collections")
    collection_status = models.CharField(max_length=12, choices=CollectionStatus.choices, default=CollectionStatus.NA, db_index=True)
    handed_over_at = models.DateTimeField(null=True, blank=True)
    reference = models.CharField(max_length=100, blank=True, help_text="UPI ref / cheque no.")
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-payment_date", "-id"]
        indexes = [
            models.Index(fields=["customer", "payment_date"]),
            models.Index(fields=["driver", "payment_date"]),
        ]

    def __str__(self):
        return f"{self.code} - {self.customer} - {self.amount}"
