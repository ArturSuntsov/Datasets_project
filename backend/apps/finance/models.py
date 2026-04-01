from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from mongoengine import CASCADE, DecimalField, DateTimeField, DictField, Document, ReferenceField, StringField

from ..projects.models import Task
from ..users.models import User


class Transaction(Document):
    """
    Транзакции: покупки/выплаты/начисления.
    """

    TYPE_PAYMENT = "payment"
    TYPE_PAYOUT = "payout"
    TYPE_EARNINGS = "earnings"

    STATUS_PENDING = "pending"
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed"
    STATUS_REVERSED = "reversed"

    type = StringField(required=True, choices=[TYPE_PAYMENT, TYPE_PAYOUT, TYPE_EARNINGS])
    status = StringField(required=True, choices=[STATUS_PENDING, STATUS_COMPLETED, STATUS_FAILED, STATUS_REVERSED], default=STATUS_PENDING)

    user = ReferenceField(User, required=True, reverse_delete_rule=CASCADE)
    task = ReferenceField(Task, null=True, reverse_delete_rule=CASCADE)

    amount = DecimalField(required=True, precision=20, rounding=None)
    currency = StringField(required=True, default="USD", max_length=10)

    # Для внешних платежных систем (Stripe).
    external_id = StringField(required=False, null=True, max_length=128)
    metadata = DictField(default=dict)

    created_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "transactions",
        "indexes": [
            "user",
            "status",
            ("created_at",),
            ("external_id",),
        ],
    }


class PaymentRequest(Document):
    """
    Запрос на платеж/выплату (Stripe stub).
    """

    PAYMENT_PAY = "pay"
    PAYMENT_WITHDRAW = "withdraw"

    STATUS_PENDING = "pending"
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed"

    payment_type = StringField(required=True, choices=[PAYMENT_PAY, PAYMENT_WITHDRAW])
    status = StringField(required=True, choices=[STATUS_PENDING, STATUS_COMPLETED, STATUS_FAILED], default=STATUS_PENDING)

    transaction = ReferenceField(Transaction, required=True, reverse_delete_rule=CASCADE)

    stripe_payment_intent_id = StringField(required=False, null=True, max_length=128)
    webhook_payload = DictField(null=True)

    created_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "payment_requests",
        "indexes": [
            "status",
            "payment_type",
            ("stripe_payment_intent_id",),
        ],
    }

    def mark_completed(self, *, amount_delta: Decimal) -> None:
        """
        В MVP: сразу помечаем completed и атомарно обновляем баланс пользователя через $inc.
        """

        self.status = self.STATUS_COMPLETED
        self.save()

        # Атомарный $inc по Mongo коллекции.
        coll = User._get_collection()
        coll.update_one({"_id": self.transaction.user.id}, {"$inc": {"balance": float(amount_delta)}})

