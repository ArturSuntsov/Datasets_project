from __future__ import annotations

import logging
import time
from datetime import datetime

import bcrypt
from django.conf import settings
from mongoengine import (
    BooleanField,
    DateTimeField,
    DecimalField,
    EmailField,
    FloatField,
    IntField,
    ListField,
    StringField,
    Document,
)

logger = logging.getLogger(__name__)


class User(Document):
    """Application user stored in MongoDB."""

    ROLE_CUSTOMER = "customer"
    ROLE_ANNOTATOR = "annotator"
    ROLE_REVIEWER = "reviewer"
    ROLE_ADMIN = "admin"

    ROLE_CHOICES = (
        (ROLE_CUSTOMER, "customer"),
        (ROLE_ANNOTATOR, "annotator"),
        (ROLE_REVIEWER, "reviewer"),
        (ROLE_ADMIN, "admin"),
    )

    email = EmailField(required=True, unique=True)
    username = StringField(required=True, unique=True, max_length=150)
    role = StringField(required=True, choices=[c[0] for c in ROLE_CHOICES], default=ROLE_CUSTOMER)

    password_hash = StringField(required=True)
    is_active = BooleanField(default=True)

    full_name = StringField(default="", max_length=255)
    specialization = StringField(default="", max_length=255)
    group_name = StringField(default="", max_length=255)
    experience_level = StringField(default="", max_length=120)
    available_task_types = ListField(StringField(max_length=100), default=list)

    rating = FloatField(default=0.0)
    completed_assignments = IntField(default=0)
    conflict_rate = FloatField(default=0.0)
    balance = DecimalField(default=0, precision=20, rounding=None)

    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "users",
        "strict": False,
        "indexes": [
            {"fields": ["email"], "unique": True},
            {"fields": ["username"], "unique": True},
            {"fields": ["role", "is_active"]},
            "specialization",
            "group_name",
        ],
    }

    @property
    def is_authenticated(self):
        """
        Возвращает True для аутентифицированных пользователей.
        Требуется для DRF authentication.
        """
        return True

    @property
    def is_anonymous(self):
        """
        Возвращает False для реальных пользователей.
        Требуется для DRF authentication.
        """
        return False

    def save(self, *args, **kwargs):
        start_time = time.time()
        self.updated_at = datetime.utcnow()
        result = super().save(*args, **kwargs)
        logger.info("Saved user %s in %.3fs", self.email, time.time() - start_time)
        return result

    def set_password(self, raw_password: str) -> None:
        rounds = getattr(settings, "BCRYPT_ROUNDS", 4)
        salt = bcrypt.gensalt(rounds=rounds)
        self.password_hash = bcrypt.hashpw(raw_password.encode("utf-8"), salt).decode("utf-8")

    def check_password(self, raw_password: str) -> bool:
        try:
            return bcrypt.checkpw(raw_password.encode("utf-8"), self.password_hash.encode("utf-8"))
        except Exception:
            logger.exception("Password validation failed for %s", self.email)
            return False
