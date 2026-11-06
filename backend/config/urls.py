from django.contrib import admin
from django.urls import include, path

admin.site.site_header = "JJ Selvam Water Supply — Admin"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
]
