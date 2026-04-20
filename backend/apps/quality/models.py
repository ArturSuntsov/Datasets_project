from __future__ import annotations

from datetime import datetime
from typing import Dict, Optional

from mongoengine import CASCADE, DateTimeField, DictField, Document, FloatField, ReferenceField, StringField, BooleanField

from ..datasets_core.models import Dataset
from ..labeling.models import Annotation
from ..projects.models import Task
from ..users.models import User


class QualityMetric(Document):
    """
    Агрегированные метрики качества по задаче/датасету.
    """

    dataset = ReferenceField(Dataset, required=True, reverse_delete_rule=CASCADE)
    task = ReferenceField(Task, required=True, reverse_delete_rule=CASCADE)

    precision = FloatField(required=True, default=0.0, min_value=0.0, max_value=1.0)
    recall = FloatField(required=True, default=0.0, min_value=0.0, max_value=1.0)
    f1 = FloatField(required=True, default=0.0, min_value=0.0, max_value=1.0)

    details = DictField(default=dict)

    created_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "quality_metrics",
        "strict": False,
        "indexes": [
            ("dataset", "task"),
            ("created_at",),
        ],
    }


class QualityReview(Document):
    """
    Проверка качества (cross-check) на основе 2+ аннотаций.
    """

    STATUS_PENDING = "pending"
    STATUS_COMPLETED = "completed"
    STATUS_ARBITRATED = "arbitrated"
    STATUS_REJECTED = "rejected"

    STATUS_CHOICES = (
        (STATUS_PENDING, "pending"),
        (STATUS_COMPLETED, "completed"),
        (STATUS_ARBITRATED, "arbitrated"),
        (STATUS_REJECTED, "rejected"),
    )

    task = ReferenceField(Task, required=True, reverse_delete_rule=CASCADE, unique=True)
    dataset = ReferenceField(Dataset, required=True, reverse_delete_rule=CASCADE)

    # Храним минимум 2 аннотации для cross-check.
    annotation_a = ReferenceField(Annotation, required=True, reverse_delete_rule=CASCADE)
    annotation_b = ReferenceField(Annotation, required=True, reverse_delete_rule=CASCADE)

    review_status = StringField(required=True, choices=[c[0] for c in STATUS_CHOICES], default=STATUS_PENDING)

    metrics = DictField(default=dict)  # precision/recall/f1 + вспомогательные поля
    final_label_data = DictField(null=True)

    arbitration_requested = BooleanField(default=False)
    arbitration_comment = StringField(null=True)
    arbitrator = ReferenceField(User, null=True, reverse_delete_rule=CASCADE)

    created_at = DateTimeField(default=datetime.utcnow)
    completed_at = DateTimeField(null=True)

    meta = {
        "collection": "quality_reviews",
        "strict": False,
        "indexes": [
            ("task", "review_status"),
            ("dataset", "created_at"),
        ],
    }

    def save(self, *args, **kwargs):
        # Для создания: оставляем completed_at null.
        return super().save(*args, **kwargs)

