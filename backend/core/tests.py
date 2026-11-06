from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from .models import Customer, Delivery, Payment

D = Decimal


class WaterSupplyAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_superuser("admin", "a@a.com", "Str0ngPass!23")
        r = self.client.post("/api/auth/login/", {"username": "admin", "password": "Str0ngPass!23"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.client.credentials(HTTP_AUTHORIZATION="Token " + r.data["token"])
        self.client.patch("/api/settings/", {"drinking_water_rate": "0.50", "salt_water_rate": "0.20"}, format="json")
        self.driver = self.client.post("/api/drivers/", {"name": "Murugan", "phone": "9000000001"}, format="json").data
        self.driver2 = self.client.post("/api/drivers/", {"name": "Karthik", "phone": "9000000002"}, format="json").data
        self.cust = self.client.post("/api/customers/", {
            "name": "Hotel Saravana", "customer_type": "HOTEL", "phone": "9840000001",
            "water_type": "DRINKING", "opening_balance": "300.00"}, format="json").data

    def deliver(self, qty=1000, paid="0", water="DRINKING", date="2026-11-01", **extra):
        body = {"delivery_date": date, "delivery_time": "09:30", "customer": self.cust["id"], "driver": self.driver["id"],
                "water_type": water, "quantity_litres": qty, "amount_paid": paid, "payment_method": "CASH",
                "received_by": "DRIVER", **extra}
        r = self.client.post("/api/deliveries/", body, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        return r.data

    def customer(self):
        return Customer.objects.get(pk=self.cust["id"])

    def test_codes_auto_increment(self):
        self.assertEqual(self.driver["code"], "DRV001")
        self.assertEqual(self.driver2["code"], "DRV002")
        self.assertEqual(self.cust["code"], "CUST001")
        d = self.deliver(paid="100")
        self.assertEqual(d["code"], "DEL001")
        self.assertEqual(Payment.objects.get().code, "PAY001")

    def test_driver_salary_and_monthly_leave_tracking(self):
        response = self.client.patch(f"/api/drivers/{self.driver['id']}/", {"weekly_salary": "700.00"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(D(str(response.data["weekly_salary"])), D("700.00"))

        leave = self.client.post("/api/driver-leaves/", {
            "driver": self.driver["id"], "date": "2026-11-03", "notes": "Personal",
        }, format="json")
        self.assertEqual(leave.status_code, 201, leave.data)
        self.assertEqual(leave.data["driver_name"], "Murugan")

        duplicate = self.client.post("/api/driver-leaves/", {
            "driver": self.driver["id"], "date": "2026-11-03",
        }, format="json")
        self.assertEqual(duplicate.status_code, 400)

        month = self.client.get(
            f"/api/driver-leaves/?driver={self.driver['id']}&date_from=2026-11-01&date_to=2026-11-30"
        )
        self.assertEqual(month.status_code, 200)
        self.assertEqual(month.data["count"], 1)

        deleted = self.client.delete(f"/api/driver-leaves/{leave.data['id']}/")
        self.assertEqual(deleted.status_code, 204)

    def test_bill_calculation_and_status(self):
        d = self.deliver(qty=1000, paid="200")  # 1000 x 0.50 = 500
        self.assertEqual(D(str(d["total_amount"])), D("500.00"))
        self.assertEqual(d["payment_status"], "PARTIAL")
        self.assertEqual(D(str(d["balance"])), D("300.00"))
        c = self.customer()
        self.assertEqual(c.current_balance, D("600.00"))  # 300 opening + 500 - 200
        self.assertEqual(c.payment_status, "PARTIAL")

    def test_fixed_price(self):
        d = self.deliver(qty=250, pricing_mode="FIXED", total_amount="180")
        self.assertEqual(D(str(d["total_amount"])), D("180.00"))
        self.assertEqual(d["payment_status"], "UNPAID")

    def test_later_payment_clears_oldest_first_and_never_double_counts(self):
        d1 = self.deliver(qty=1000, date="2026-11-01")  # 500
        d2 = self.deliver(qty=1000, date="2026-11-02")  # 500
        self.assertEqual(self.customer().payment_status, "UNPAID")
        r = self.client.post("/api/payments/", {"customer": self.cust["id"], "amount": "600", "payment_date": "2026-11-05",
                                                "payment_method": "UPI", "received_by": "OWNER"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        # 600 -> opening 300, then 300 to d1
        self.assertEqual(Delivery.objects.get(pk=d1["id"]).payment_status, "PARTIAL")
        self.assertEqual(Delivery.objects.get(pk=d2["id"]).payment_status, "UNPAID")
        c = self.customer()
        self.assertEqual(c.current_balance, D("700.00"))
        # duplicate guard
        r2 = self.client.post("/api/payments/", {"customer": self.cust["id"], "amount": "600", "payment_date": "2026-11-05",
                                                 "payment_method": "UPI", "received_by": "OWNER"}, format="json")
        self.assertEqual(r2.status_code, 400)
        self.assertIn("duplicate", r2.data)
        self.assertEqual(Payment.objects.count(), 1)
        # no delivery was created for a payment
        self.assertEqual(Delivery.objects.count(), 2)
        # editing the payment rebuilds balances instead of adding
        self.client.patch(f"/api/payments/{r.data['id']}/", {"amount": "1300"}, format="json")
        c = self.customer()
        self.assertEqual(c.current_balance, D("0.00"))
        self.assertEqual(c.payment_status, "PAID")
        # deleting the payment restores the balance
        self.client.delete(f"/api/payments/{r.data['id']}/")
        self.assertEqual(self.customer().current_balance, D("1300.00"))

    def test_edit_and_delete_delivery_updates_balance(self):
        d = self.deliver(qty=1000, paid="500")
        self.assertEqual(d["payment_status"], "PAID")
        r = self.client.patch(f"/api/deliveries/{d['id']}/", {"quantity_litres": 2000}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["payment_status"], "PARTIAL")
        self.assertEqual(self.customer().current_balance, D("800.00"))  # 300 + 1000 - 500
        self.client.delete(f"/api/deliveries/{d['id']}/")
        c = self.customer()
        self.assertEqual(c.current_balance, D("300.00"))
        self.assertEqual(Payment.objects.count(), 0)

    def test_balance_filters(self):
        self.deliver(qty=1000, paid="0")
        other = self.client.post("/api/customers/", {"name": "Kumar House", "customer_type": "HOUSE", "phone": "9840000002",
                                                     "water_type": "SALT"}, format="json").data
        self.client.post("/api/deliveries/", {"delivery_date": "2026-11-01", "delivery_time": "10:00", "customer": other["id"],
                                              "driver": self.driver2["id"], "water_type": "SALT", "quantity_litres": 500,
                                              "amount_paid": "40", "received_by": "OWNER", "payment_method": "CASH"}, format="json")
        unpaid = self.client.get("/api/customers/balances/?status=UNPAID").data
        self.assertEqual([r["code"] for r in unpaid["results"]], ["CUST001"])
        self.assertEqual(D(str(unpaid["totals"]["outstanding"])), D("800.00"))
        partial = self.client.get("/api/customers/balances/?status=PARTIAL").data
        self.assertEqual([r["code"] for r in partial["results"]], ["CUST002"])
        pending = self.client.get("/api/customers/balances/?status=PENDING").data
        self.assertEqual(pending["count"], 2)
        by_driver = self.client.get(f"/api/customers/balances/?status=PENDING&driver={self.driver2['id']}").data
        self.assertEqual(by_driver["count"], 1)

    def test_ledger_running_balance(self):
        self.deliver(qty=1000, paid="100")
        led = self.client.get(f"/api/customers/{self.cust['id']}/ledger/").data
        self.assertEqual(D(str(led["opening_balance"])), D("300.00"))
        self.assertEqual(D(str(led["closing_balance"])), D("700.00"))
        self.assertEqual(len(led["entries"]), 2)

    def test_driver_collection_and_reports(self):
        self.deliver(qty=1000, paid="500")
        cols = self.client.get("/api/reports/driver-collections/?date_from=2026-11-01&date_to=2026-11-01").data
        self.assertEqual(D(str(cols["summary"][0]["pending"])), D("500.00"))
        pid = cols["collections"][0]["id"]
        self.client.post("/api/payments/mark-handed-over/", {"ids": [pid]}, format="json")
        rep = self.client.get("/api/reports/drivers/?date_from=2026-11-01&date_to=2026-11-01").data
        row = next(r for r in rep["drivers"] if r["code"] == "DRV001")
        self.assertEqual(row["litres"], 1000)
        self.assertEqual(D(str(row["handed_over"])), D("500.00"))
        biz = self.client.get("/api/reports/business/?date_from=2026-11-01&date_to=2026-11-01").data
        self.assertEqual(biz["summary"]["drinking"], 1000)
        self.assertEqual(self.client.get("/api/dashboard/?date=2026-11-01").status_code, 200)

    def test_exports(self):
        self.deliver()
        for url in ["/api/deliveries/export/?date=2026-11-01&export=xlsx", "/api/deliveries/export/?date=2026-11-01&export=pdf",
                    f"/api/customers/{self.cust['id']}/ledger/export/?export=pdf",
                    "/api/reports/business/export/?date_from=2026-11-01&date_to=2026-11-01&export=xlsx",
                    "/api/reports/drivers/export/?date_from=2026-11-01&date_to=2026-11-01&export=pdf",
                    "/api/customers/balances/export/?status=PENDING&export=xlsx"]:
            r = self.client.get(url)
            self.assertEqual(r.status_code, 200, url)
            self.assertGreater(len(r.content), 500)

    def test_backup_restore_roundtrip(self):
        self.deliver(paid="100")
        backup = self.client.get("/api/backup/")
        self.assertEqual(backup.status_code, 200)
        self.deliver(qty=500)
        from django.core.files.uploadedfile import SimpleUploadedFile
        f = SimpleUploadedFile("b.json", backup.content, content_type="application/json")
        r = self.client.post("/api/restore/", {"file": f}, format="multipart")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(Delivery.objects.count(), 1)
        self.assertEqual(self.customer().current_balance, D("700.00"))
        # sequence restored too: next delivery is DEL002 again, not a duplicate
        self.assertEqual(self.deliver()["code"], "DEL002")

    def test_cannot_delete_customer_with_history(self):
        self.deliver()
        r = self.client.delete(f"/api/customers/{self.cust['id']}/")
        self.assertEqual(r.status_code, 400)

    def test_requires_login(self):
        self.client.credentials()
        self.assertEqual(self.client.get("/api/customers/").status_code, 401)
