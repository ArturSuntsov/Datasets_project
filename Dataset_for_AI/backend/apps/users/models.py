from __future__ import annotations

from datetime import datetime

from django.contrib.auth.hashers import check_password, make_password
from mongoengine import BooleanField, DateTimeField, Document, DecimalField, EmailField, FloatField, StringField


class User(Document):
    """
    Кастомный пользователь (MongoEngine).
    Пароль хранится только в виде хеша.
    """

    ROLE_CUSTOMER = "customer"   # Заказчик
    ROLE_ANNOTATOR = "annotator"  # Исполнитель
    ROLE_ADMIN = "admin"

    ROLE_CHOICES = (
        (ROLE_CUSTOMER, "customer"),
        (ROLE_ANNOTATOR, "annotator"),
        (ROLE_ADMIN, "admin"),
    )

    email = EmailField(required=True, unique=True)
    username = StringField(required=True, unique=True, max_length=150)
    role = StringField(required=True, choices=[c[0] for c in ROLE_CHOICES], default=ROLE_CUSTOMER)

    password_hash = StringField(required=True)
    is_active = BooleanField(default=True)

    # Рейтинг исполнителя (обновляется после QC-арбитража/метрик).
    rating = FloatField(default=0.0)
    # Баланс пользователя для выплат/расчетов (обновляется атомарными $inc в finance).
    balance = DecimalField(default=0, precision=20, rounding=None)

    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "users"}

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        return super().save(*args, **kwargs)

    def set_password(self, raw_password: str) -> None:
        self.password_hash = make_password(raw_password)

    def check_password(self, raw_password: str) -> bool:
        return check_password(raw_password, self.password_hash)

