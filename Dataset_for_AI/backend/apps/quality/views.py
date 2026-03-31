from __future__ import annotations

from typing import Any, Dict, Optional

from bson import ObjectId
from django.http import HttpRequest
from mongoengine import ValidationError as MongoValidationError
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from ..datasets_core.models import Dataset
from ..projects.models import Task
from ..users.models import User
from ..users.views import authenticate_from_jwt
from .models import QualityMetric, QualityReview
from .serializers import ReviewSerializer


class ReviewViewSet(ViewSet):
    """
    Качество:
    POST /api/quality/review/ - создать кросс-проверку по 2 аннотациям.
    """

    permission_classes = [permissions.AllowAny]

    def _get_user(self, request: HttpRequest):
        try:
            return authenticate_from_jwt(request)
        except PermissionError:
            return None

    def create(self, request, *args, **kwargs) -> Response:
        user = self._get_user(request)
        if not user:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = ReviewSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        review: QualityReview = serializer.create(serializer.validated_data)

        # После завершения QC обновляем статус задачи и рейтинг исполнителей.
        metrics_f1 = float((review.metrics or {}).get("f1", 0.0))
        if review.review_status in (QualityReview.STATUS_COMPLETED, QualityReview.STATUS_ARBITRATED):
            task = review.task
            task.status = Task.STATUS_COMPLETED
            task.save()

            # Атомарное обновление рейтинга (MVP): $inc по обеим сторонам cross-check.
            coll = User._get_collection()
            coll.update_one({"_id": review.annotation_a.annotator.id}, {"$inc": {"rating": metrics_f1}})
            coll.update_one({"_id": review.annotation_b.annotator.id}, {"$inc": {"rating": metrics_f1}})

        return Response(
            {
                "id": str(review.id),
                "task_id": str(review.task.id),
                "dataset_id": str(review.dataset.id),
                "review_status": review.review_status,
                "metrics": review.metrics,
                "final_label_data": review.final_label_data,
            },
            status=status.HTTP_201_CREATED,
        )


class MetricsViewSet(ViewSet):
    """
    Метрики качества:
    GET /api/quality/metrics/{dataset_id}/
    """

    permission_classes = [permissions.AllowAny]

    def _get_user(self, request: HttpRequest):
        try:
            return authenticate_from_jwt(request)
        except PermissionError:
            return None

    def retrieve(self, request, dataset_id: str = None, pk: str = None, *args, **kwargs) -> Response:
        user = self._get_user(request)
        if not user:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED})
        dataset_id = dataset_id or pk
        if not dataset_id or not ObjectId.is_valid(dataset_id):
            return Response({"detail": "Invalid dataset_id"}, status=status.HTTP_400_BAD_REQUEST)

        dataset = Dataset.objects(id=ObjectId(dataset_id)).first()
        if not dataset:
            return Response({"detail": "Dataset not found"}, status=status.HTTP_404_NOT_FOUND)
        if str(dataset.owner.id) != str(user.id) and user.role != User.ROLE_ADMIN:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        try:
            limit = int(request.query_params.get("limit", 20))
        except ValueError:
            limit = 20
        limit = max(1, min(limit, 100))
        try:
            offset = int(request.query_params.get("offset", 0))
        except ValueError:
            offset = 0

        metrics_qs = QualityMetric.objects(dataset=dataset).order_by("-created_at")
        total = metrics_qs.count()
        items = list(metrics_qs.skip(offset).limit(limit))
        return Response(
            {
                "dataset_id": str(dataset.id),
                "items": [
                    {
                        "task_id": str(m.task.id),
                        "precision": m.precision,
                        "recall": m.recall,
                        "f1": m.f1,
                        "details": m.details,
                        "created_at": m.created_at,
                    }
                    for m in items
                ],
                "limit": limit,
                "offset": offset,
                "total": total,
            },
            status=status.HTTP_200_OK,
        )

