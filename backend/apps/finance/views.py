from __future__ import annotations

from decimal import Decimal
from typing import Any, Dict, Optional

from bson import ObjectId
from django.http import HttpRequest
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from ..projects.models import Task
from ..users.models import User
from ..users.views import authenticate_from_jwt
from .models import PaymentRequest, Transaction
from .serializers import PaymentSerializer, TransactionSerializer


class JWTRequiredMixin:
    permission_classes = [permissions.AllowAny]

    def _get_user(self, request: HttpRequest):
        try:
            return authenticate_from_jwt(request)
        except PermissionError:
            return None

    def _require_user(self, request: HttpRequest):
        user = self._get_user(request)
        if not user:
            return None, Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        return user, None


class TransactionViewSet(JWTRequiredMixin, ViewSet):
    """
    История транзакций:
      GET /api/finance/transactions/
    """

    def list(self, request, *args, **kwargs) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp

        try:
            limit = int(request.query_params.get("limit", 20))
        except ValueError:
            limit = 20
        limit = max(1, min(limit, 100))
        try:
            offset = int(request.query_params.get("offset", 0))
        except ValueError:
            offset = 0

        status_filter = request.query_params.get("status")
        qs = Transaction.objects(user=user).order_by("-created_at")
        if status_filter:
            qs = qs.filter(status=status_filter)

        total = qs.count()
        items = list(qs.skip(offset).limit(limit))
        return Response(
            {
                "items": [TransactionSerializer(item).to_representation(item) for item in items],
                "limit": limit,
                "offset": offset,
                "total": total,
            },
            status=status.HTTP_200_OK,
        )


class PaymentViewSet(JWTRequiredMixin, ViewSet):
    """
    Заглушка платёжного шлюза.
      POST /api/finance/pay/
      POST /api/finance/withdraw/
    """

    @action(detail=False, methods=["post"], url_path="pay")
    def pay(self, request, *args, **kwargs) -> Response:
        return self._handle_payment(request, payment_type=PaymentRequest.PAYMENT_PAY)

    @action(detail=False, methods=["post"], url_path="withdraw")
    def withdraw(self, request, *args, **kwargs) -> Response:
        return self._handle_payment(request, payment_type=PaymentRequest.PAYMENT_WITHDRAW)

    def _handle_payment(self, request, *, payment_type: str) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp

        data = dict(request.data)
        data["payment_type"] = payment_type

        serializer = PaymentSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        amount: Decimal = serializer.validated_data["amount"]
        currency: str = serializer.validated_data["currency"]
        task_id = serializer.validated_data.get("task_id")
        metadata = serializer.validated_data.get("metadata") or {}

        task: Optional[Task] = None
        if task_id:
            if ObjectId.is_valid(task_id):
                task = Task.objects(id=ObjectId(task_id)).first()
            if not task:
                return Response({"detail": "task_id not found"}, status=status.HTTP_400_BAD_REQUEST)

        # Создаем транзакцию в pending.
        tx_type = Transaction.TYPE_PAYMENT if payment_type == PaymentRequest.PAYMENT_PAY else Transaction.TYPE_PAYOUT
        tx = Transaction(
            user=user,
            task=task,
            type=tx_type,
            status=Transaction.STATUS_PENDING,
            amount=amount,
            currency=currency,
            external_id=None,
            metadata=metadata,
        )
        tx.save()

        # Создаем payment request.
        pr = PaymentRequest(payment_type=payment_type, status=PaymentRequest.STATUS_PENDING, transaction=tx)
        pr.stripe_payment_intent_id = f"stub_pi_{str(tx.id)}"
        pr.webhook_payload = {"stub": True, "payment_type": payment_type}
        pr.save()

        # Stripe webhook stub: в дипломе обрабатываем синхронно.
        if payment_type == PaymentRequest.PAYMENT_PAY:
            amount_delta = amount
        else:
            # withdraw: уменьшаем баланс, если хватает.
            # MVP: проверяем в Python (не идеально атомарно, но в учебном проекте достаточно).
            if user.balance < amount:
                tx.status = Transaction.STATUS_FAILED
                tx.save()
                pr.status = PaymentRequest.STATUS_FAILED
                pr.save()
                return Response({"detail": "Insufficient balance"}, status=status.HTTP_400_BAD_REQUEST)
            amount_delta = -amount

        # Обновляем баланс и статусы.
        pr.mark_completed(amount_delta=amount_delta)
        tx.status = Transaction.STATUS_COMPLETED
        tx.save()

        tx_data = TransactionSerializer().to_representation(tx)
        return Response(
            {
                "transaction": tx_data,
                "transaction_id": str(tx.id),
                "payment_request_id": str(pr.id),
                "status": pr.status,
            },
            status=status.HTTP_201_CREATED,
        )

