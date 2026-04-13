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
    
    # Новые поля
    from_user_id = serializers.CharField(source="from_user.id", read_only=True, allow_null=True)
    to_user_id = serializers.CharField(source="to_user.id", read_only=True, allow_null=True)
    from_user_name = serializers.SerializerMethodField()
    to_user_name = serializers.SerializerMethodField()
    description = serializers.CharField(required=False, allow_blank=True, default="")
    
    task_id = serializers.CharField(source="task.id", read_only=True, allow_null=True)
    amount = serializers.DecimalField(max_digits=24, decimal_places=2)
    currency = serializers.CharField()
    external_id = serializers.CharField(required=False, allow_null=True)
    metadata = serializers.DictField(required=False, default=dict)
    created_at = serializers.DateTimeField(read_only=True)

    def get_from_user_name(self, obj: Transaction) -> Optional[str]:
        if obj.from_user:
            return obj.from_user.username
        return None

    def get_to_user_name(self, obj: Transaction) -> Optional[str]:
        if obj.to_user:
            return obj.to_user.username
        return None

    def to_representation(self, instance: Transaction) -> Dict[str, Any]:
        return {
            "id": str(instance.id),
            "type": instance.type,
            "status": instance.status,
            "user_id": str(instance.user.id),
            "from_user_id": str(instance.from_user.id) if instance.from_user else None,
            "to_user_id": str(instance.to_user.id) if instance.to_user else None,
            "from_user_name": instance.from_user.username if instance.from_user else None,
            "to_user_name": instance.to_user.username if instance.to_user else None,
            "description": instance.description,
            "task_id": str(instance.task.id) if instance.task else None,
            "amount": str(instance.amount),
            "currency": instance.currency,
            "external_id": instance.external_id,
            "metadata": instance.metadata,
            "created_at": instance.created_at,
        }


class PaymentSerializer(serializers.Serializer):
    """ Сериализатор для заглушек платежей (pay/withdraw). """
    payment_type = serializers.ChoiceField(choices=[PaymentRequest.PAYMENT_PAY, PaymentRequest.PAYMENT_WITHDRAW])
    amount = serializers.DecimalField(max_digits=24, decimal_places=2)
    currency = serializers.CharField(required=False, default="USD", max_length=10)
    task_id = serializers.CharField(required=False, allow_null=True)
    to_user_id = serializers.CharField(required=False, allow_null=True)  # Для переводов
    description = serializers.CharField(required=False, allow_blank=True, default="")
    metadata = serializers.DictField(required=False, default=dict)

    def validate_amount(self, value):
        value = Decimal(value)
        if value <= 0:
            raise serializers.ValidationError("Сумма должна быть > 0.")
        return value
