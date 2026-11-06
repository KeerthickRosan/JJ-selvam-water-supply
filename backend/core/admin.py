from django.contrib import admin

from .models import BusinessSettings, Customer, Delivery, Driver, DriverLeave, Payment, Sequence


@admin.register(Driver)
class DriverAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "phone", "weekly_salary", "is_active")
    search_fields = ("code", "name", "phone")


@admin.register(DriverLeave)
class DriverLeaveAdmin(admin.ModelAdmin):
    list_display = ("driver", "date", "notes")
    list_filter = ("date",)
    search_fields = ("driver__name", "driver__code")


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "customer_type", "phone", "current_balance", "payment_status", "is_active")
    list_filter = ("customer_type", "payment_status", "is_active")
    search_fields = ("code", "name", "phone")
    readonly_fields = ("total_litres", "total_billed", "total_paid", "current_balance", "payment_status",
                       "last_payment_date", "last_delivery_date")


@admin.register(Delivery)
class DeliveryAdmin(admin.ModelAdmin):
    list_display = ("code", "delivery_date", "customer_name", "driver_name", "water_type", "quantity_litres",
                    "total_amount", "paid_amount", "balance", "payment_status")
    list_filter = ("water_type", "payment_status", "delivery_date")
    search_fields = ("code", "customer_name")
    readonly_fields = ("paid_amount", "balance", "payment_status")


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("code", "payment_date", "customer", "amount", "payment_method", "received_by", "driver", "collection_status")
    list_filter = ("payment_method", "received_by", "collection_status")
    search_fields = ("code", "customer__name", "reference")


admin.site.register(BusinessSettings)
admin.site.register(Sequence)
