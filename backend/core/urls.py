from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import reports, views

router = DefaultRouter()
router.register("drivers", views.DriverViewSet, basename="driver")
router.register("driver-leaves", views.DriverLeaveViewSet, basename="driver-leave")
router.register("customers", views.CustomerViewSet, basename="customer")
router.register("deliveries", views.DeliveryViewSet, basename="delivery")
router.register("payments", views.PaymentViewSet, basename="payment")

urlpatterns = [
    path("health/", reports.health_view),
    path("auth/login/", reports.login_view),
    path("auth/logout/", reports.logout_view),
    path("auth/me/", reports.me_view),
    path("auth/change-password/", reports.change_password_view),
    path("settings/", reports.settings_view),
    path("dashboard/", reports.dashboard_view),
    path("reports/business/", reports.business_report_view),
    path("reports/business/export/", reports.business_report_export),
    path("reports/drivers/", reports.driver_report_view),
    path("reports/drivers/export/", reports.driver_report_export),
    path("reports/driver-collections/", reports.driver_collections_view),
    path("reports/driver-collections/export/", reports.driver_collections_export),
    path("backup/", reports.backup_view),
    path("restore/", reports.restore_view),
    path("recalculate/", reports.recalculate_view),
    path("", include(router.urls)),
]
