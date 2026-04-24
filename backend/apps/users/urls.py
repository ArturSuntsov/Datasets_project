from __future__ import annotations

from django.urls import path

from .views import register, login, me_view, participants_view, BulkCreateAnnotatorsView


urlpatterns = [
    path("register/", register, name="auth-register"),
    path("login/", login, name="auth-login"),
    path("me/", me_view, name="user-me"),
    path("participants/", participants_view, name="user-participants"),
    path("bulk-create-annotators/", BulkCreateAnnotatorsView.as_view(), name="bulk-create-annotators"),
]
