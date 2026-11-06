import re
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import password_validation
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .models import (
    ZERO, BusinessSettings, CollectionStatus, Customer, CustomerWaterType, Delivery, Driver, DriverLeave,
    Payment, PaymentMethod, PricingMode, ReceivedBy,
)
from .services import money, recalculate_customers

PHONE_RE = re.compile(r"^\+?[0-9 \-]{7,15}$")


def clean_phone(value, required=True):
    value = (value or "").strip()
    if not value:
        if required:
            raise serializers.ValidationError("Contact number is required.")
        return value
    if not PHONE_RE.match(value):
        raise serializers.ValidationError("Enter a valid contact number (digits only, 7-15 characters).")
    return value


class BusinessSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessSettings
        fields = ["business_name", "address", "phone", "email", "drinking_water_rate", "salt_water_rate", "updated_at"]
        read_only_fields = ["updated_at"]


class DriverSerializer(serializers.ModelSerializer):
    delivery_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Driver
        fields = ["id", "code", "name", "phone", "weekly_salary", "address", "notes", "is_active", "delivery_count", "created_at", "updated_at"]
        read_only_fields = ["code", "created_at", "updated_at"]

    def validate_name(self, v):
        v = v.strip()
        if len(v) < 2:
            raise serializers.ValidationError("Driver name is too short.")
        return v

    def validate_phone(self, v):
        v = clean_phone(v)
        qs = Driver.objects.filter(phone=v)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Another driver already uses this contact number.")
        return v


class DriverLeaveSerializer(serializers.ModelSerializer):
    driver_name = serializers.CharField(source="driver.name", read_only=True)

    class Meta:
        model = DriverLeave
        fields = ["id", "driver", "driver_name", "date", "notes", "created_at"]
        read_only_fields = ["created_at"]


class CustomerSerializer(serializers.ModelSerializer):
    customer_type_label = serializers.CharField(source="get_customer_type_display", read_only=True)
    water_type_label = serializers.CharField(source="get_water_type_display", read_only=True)
    payment_status_label = serializers.CharField(source="get_payment_status_display", read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id", "code", "name", "customer_type", "customer_type_label", "phone", "address", "water_type",
            "water_type_label", "regular_quantity", "opening_balance", "notes", "is_active",
            "total_litres", "total_billed", "total_paid", "current_balance", "payment_status",
            "payment_status_label", "last_payment_date", "last_delivery_date", "created_at", "updated_at",
        ]
        read_only_fields = [
            "code", "total_litres", "total_billed", "total_paid", "current_balance", "payment_status",
            "last_payment_date", "last_delivery_date", "created_at", "updated_at",
        ]

    def validate_name(self, v):
        v = " ".join(v.split())
        if len(v) < 2:
            raise serializers.ValidationError("Customer name is too short.")
        return v

    def validate_phone(self, v):
        return clean_phone(v, required=False)

    def validate(self, attrs):
        name = attrs.get("name", getattr(self.instance, "name", ""))
        phone = attrs.get("phone", getattr(self.instance, "phone", ""))
        qs = Customer.objects.filter(name__iexact=name, phone=phone)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {"name": f"Customer '{name}' with this contact number already exists ({qs.first().code})."}
            )
        return attrs


class CustomerMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["id", "code", "name", "customer_type", "phone", "water_type", "regular_quantity", "current_balance", "is_active"]


class DeliverySerializer(serializers.ModelSerializer):
    # write-only fields for the payment received at the time of delivery
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, write_only=True, required=False, min_value=Decimal("0"))
    payment_method = serializers.ChoiceField(choices=PaymentMethod.choices, write_only=True, required=False)
    received_by = serializers.ChoiceField(choices=ReceivedBy.choices, write_only=True, required=False)

    customer_code = serializers.CharField(source="customer.code", read_only=True)
    driver_code = serializers.CharField(source="driver.code", read_only=True)
    customer_type_label = serializers.CharField(source="get_customer_type_display", read_only=True)
    water_type_label = serializers.CharField(source="get_water_type_display", read_only=True)
    payment_status_label = serializers.CharField(source="get_payment_status_display", read_only=True)
    initial_payment = serializers.SerializerMethodField()
    total_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, min_value=Decimal("0"))
    rate_per_litre = serializers.DecimalField(max_digits=10, decimal_places=4, required=False, min_value=Decimal("0"))

    class Meta:
        model = Delivery
        fields = [
            "id", "code", "delivery_date", "delivery_time", "customer", "customer_code", "customer_name",
            "customer_type", "customer_type_label", "driver", "driver_code", "driver_name", "water_type",
            "water_type_label", "quantity_litres", "pricing_mode", "rate_per_litre", "total_amount",
            "paid_amount", "balance", "payment_status", "payment_status_label", "notes",
            "amount_paid", "payment_method", "received_by", "initial_payment", "created_at", "updated_at",
        ]
        read_only_fields = [
            "code", "customer_name", "customer_type", "driver_name", "paid_amount", "balance",
            "payment_status", "created_at", "updated_at",
        ]

    def get_initial_payment(self, obj):
        p = next((p for p in obj.payments.all() if p.is_delivery_payment), None)
        if not p:
            return None
        return {"id": p.id, "code": p.code, "amount": p.amount, "payment_method": p.payment_method, "received_by": p.received_by}

    def validate(self, attrs):
        inst = self.instance
        get = lambda k: attrs.get(k, getattr(inst, k, None) if inst else None)  # noqa: E731
        customer, driver = get("customer"), get("driver")
        if not customer:
            raise serializers.ValidationError({"customer": "Select a customer."})
        if not driver:
            raise serializers.ValidationError({"driver": "Select a driver."})
        changing_customer = inst is None or attrs.get("customer") not in (None, inst.customer)
        if changing_customer and not customer.is_active:
            raise serializers.ValidationError({"customer": "This customer is inactive."})
        if (inst is None or attrs.get("driver") not in (None, inst.driver)) and not driver.is_active:
            raise serializers.ValidationError({"driver": "This driver is inactive."})

        water = get("water_type")
        if not water:
            raise serializers.ValidationError({"water_type": "Select Salt Water or Drinking Water."})
        if customer.water_type != CustomerWaterType.BOTH and customer.water_type != water and changing_customer:
            pass  # allowed: customer may occasionally take another type; frontend shows a hint
        qty = get("quantity_litres")
        if not qty or qty <= 0:
            raise serializers.ValidationError({"quantity_litres": "Quantity in litres must be greater than 0."})

        mode = get("pricing_mode") or PricingMode.PER_LITRE
        attrs["pricing_mode"] = mode
        if mode == PricingMode.PER_LITRE:
            rate = attrs.get("rate_per_litre")
            if rate is None:
                rate = getattr(inst, "rate_per_litre", None) if inst and "water_type" not in attrs else None
            if rate is None:
                rate = BusinessSettings.load().rate_for(water)
            attrs["rate_per_litre"] = rate
            attrs["total_amount"] = money(Decimal(qty) * rate)
        else:
            total = attrs.get("total_amount", getattr(inst, "total_amount", None) if inst else None)
            if total is None:
                raise serializers.ValidationError({"total_amount": "Enter the total delivery price."})
            attrs["total_amount"] = money(total)
            attrs["rate_per_litre"] = (Decimal(total) / Decimal(qty)).quantize(Decimal("0.0001"))

        if attrs.get("received_by") == ReceivedBy.DRIVER and not driver:
            raise serializers.ValidationError({"received_by": "A driver is required."})
        return attrs

    def _sync_initial_payment(self, delivery, pay):
        existing = delivery.payments.filter(is_delivery_payment=True).first()
        amount = pay.get("amount_paid")
        if amount is None:  # not sent: keep payment but keep it in sync with delivery
            if existing:
                existing.customer = delivery.customer
                existing.payment_date = delivery.delivery_date
                if existing.received_by == ReceivedBy.DRIVER:
                    existing.driver = delivery.driver
                existing.save()
            return
        amount = money(amount)
        if amount <= 0:
            if existing:
                existing.delete()
            return
        received_by = pay.get("received_by") or (existing.received_by if existing else ReceivedBy.DRIVER)
        method = pay.get("payment_method") or (existing.payment_method if existing else PaymentMethod.CASH)
        p = existing or Payment(is_delivery_payment=True, delivery=delivery, created_by=self._user())
        p.customer = delivery.customer
        p.amount = amount
        p.payment_date = delivery.delivery_date
        p.payment_method = method
        p.received_by = received_by
        if received_by == ReceivedBy.DRIVER:
            p.driver = delivery.driver
            if p.collection_status == CollectionStatus.NA or not existing:
                p.collection_status = CollectionStatus.PENDING
        else:
            p.driver = None
            p.collection_status = CollectionStatus.NA
            p.handed_over_at = None
        p.save()

    def _user(self):
        req = self.context.get("request")
        return req.user if req and req.user.is_authenticated else None

    def _pop_pay(self, data):
        return {k: data.pop(k) for k in ("amount_paid", "payment_method", "received_by") if k in data}

    def create(self, validated):
        pay = self._pop_pay(validated)
        with transaction.atomic():
            c, d = validated["customer"], validated["driver"]
            delivery = Delivery.objects.create(
                **validated, customer_name=c.name, customer_type=c.customer_type, driver_name=d.name, created_by=self._user()
            )
            self._sync_initial_payment(delivery, pay)
            recalculate_customers(c.id)
        delivery.refresh_from_db()
        return delivery

    def update(self, instance, validated):
        pay = self._pop_pay(validated)
        old_customer_id = instance.customer_id
        with transaction.atomic():
            for k, v in validated.items():
                setattr(instance, k, v)
            instance.customer_name = instance.customer.name
            instance.customer_type = instance.customer.customer_type
            instance.driver_name = instance.driver.name
            instance.save()
            if instance.customer_id != old_customer_id:
                # payments made for this delivery move with it to the right customer
                instance.payments.update(customer=instance.customer)
            self._sync_initial_payment(instance, pay)
            recalculate_customers(old_customer_id, instance.customer_id)
        instance.refresh_from_db()
        return instance


class PaymentSerializer(serializers.ModelSerializer):
    allow_duplicate = serializers.BooleanField(write_only=True, required=False, default=False)
    customer_code = serializers.CharField(source="customer.code", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    delivery_code = serializers.CharField(source="delivery.code", read_only=True, default=None)
    driver_name = serializers.CharField(source="driver.name", read_only=True, default=None)
    driver_code = serializers.CharField(source="driver.code", read_only=True, default=None)
    payment_method_label = serializers.CharField(source="get_payment_method_display", read_only=True)
    received_by_label = serializers.CharField(source="get_received_by_display", read_only=True)
    collection_status_label = serializers.CharField(source="get_collection_status_display", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id", "code", "customer", "customer_code", "customer_name", "customer_phone", "delivery", "delivery_code",
            "is_delivery_payment", "amount", "payment_date", "payment_method", "payment_method_label",
            "received_by", "received_by_label", "driver", "driver_name", "driver_code", "collection_status",
            "collection_status_label", "handed_over_at", "reference", "notes", "allow_duplicate", "created_at",
        ]
        read_only_fields = ["code", "is_delivery_payment", "collection_status", "handed_over_at", "created_at"]

    def validate(self, attrs):
        inst = self.instance
        get = lambda k: attrs.get(k, getattr(inst, k, None) if inst else None)  # noqa: E731
        customer = get("customer")
        if not customer:
            raise serializers.ValidationError({"customer": "Select the customer who paid."})
        delivery = get("delivery")
        if delivery and delivery.customer_id != customer.id:
            raise serializers.ValidationError({"delivery": "This delivery belongs to a different customer."})
        received_by = get("received_by") or ReceivedBy.OWNER
        if received_by == ReceivedBy.DRIVER:
            if not get("driver"):
                raise serializers.ValidationError({"driver": "Select the driver who collected the money."})
        else:
            attrs["driver"] = None
        amount = get("amount")
        if amount is None or amount <= 0:
            raise serializers.ValidationError({"amount": "Amount must be greater than 0."})
        if not get("payment_date"):
            raise serializers.ValidationError({"payment_date": "Payment date is required."})

        if inst is None and not attrs.get("allow_duplicate"):
            recent = Payment.objects.filter(
                customer=customer, amount=money(amount), payment_date=attrs["payment_date"],
                received_by=received_by, created_at__gte=timezone.now() - timedelta(minutes=10),
            ).first()
            if recent:
                raise serializers.ValidationError({
                    "duplicate": f"A payment of the same amount for this customer was just recorded ({recent.code}). "
                                 f"Submit again only if this is a separate payment."
                })
        return attrs

    def create(self, validated):
        validated.pop("allow_duplicate", None)
        req = self.context.get("request")
        with transaction.atomic():
            if validated.get("received_by") == ReceivedBy.DRIVER:
                validated["collection_status"] = CollectionStatus.PENDING
            payment = Payment.objects.create(**validated, created_by=req.user if req else None)
            recalculate_customers(payment.customer_id)
        return payment

    def update(self, instance, validated):
        validated.pop("allow_duplicate", None)
        old_customer = instance.customer_id
        with transaction.atomic():
            for k, v in validated.items():
                setattr(instance, k, v)
            if instance.received_by == ReceivedBy.DRIVER:
                if instance.collection_status == CollectionStatus.NA:
                    instance.collection_status = CollectionStatus.PENDING
            else:
                instance.collection_status = CollectionStatus.NA
                instance.handed_over_at = None
            instance.save()
            recalculate_customers(old_customer, instance.customer_id)
        return instance


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField()
    new_password = serializers.CharField()

    def validate_current_password(self, v):
        if not self.context["request"].user.check_password(v):
            raise serializers.ValidationError("Current password is incorrect.")
        return v

    def validate_new_password(self, v):
        password_validation.validate_password(v, self.context["request"].user)
        return v

