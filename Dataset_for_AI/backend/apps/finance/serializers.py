from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, Optional

from rest_framework import serializers

from ..projects.models import Task
from ..users.models import User
from .models import PaymentRequest, Transaction


class TransactionSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)

    type = serializers.CharField()
    status = serializers.CharField()

    user_id = serializers.CharField(source="user.id", read_only=True)
    task_id = serializers.CharField(source="task.id", read_only=True, allow_null=True)

    amount = serializers.DecimalField(max_digits=24, decimal_places=2)
    currency = serializers.CharField()

    external_id = serializers.CharField(required=False, allow_null=True)
    metadata = serializers.DictField()

    created_at = serializers.DateTimeField(read_only=True)

    def to_representation(self, instance: Transaction) -> Dict[str, Any]:
        return {
            "id": str(instance.id),
            "type": instance.type,
            "status": instance.status,
            "user_id": str(instance.user.id),
            "task_id": str(instance.task.id) if instance.task else None,
            "amount": str(instance.amount),
            "currency": instance.currency,
            "external_id": instance.external_id,
            "metadata": instance.metadata,
            "created_at": instance.created_at,
        }


class PaymentSerializer(serializers.Serializer):
    """
    Сериализатор для заглушек платежей (pay/withdraw).
    """

    payment_type = serializers.ChoiceField(choices=[PaymentRequest.PAYMENT_PAY, PaymentRequest.PAYMENT_WITHDRAW])
    amount = serializers.DecimalField(max_digits=24, decimal_places=2)
    currency = serializers.CharField(required=False, default="USD", max_length=10)

    # Для MVP: опционально привязываем к task (например, выплаты за разметку).
    task_id = serializers.CharField(required=False, allow_null=True)

    metadata = serializers.DictField(required=False, default=dict)

    def validate_amount(self, value):
        value = Decimal(value)
        if value <= 0:
            raise serializers.ValidationError("Сумма должна быть > 0.")
        return value

