from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from mongoengine import (
    CASCADE,
    BooleanField,
    DateTimeField,
    DictField,
    Document,
    FloatField,
    IntField,
    ListField,
    ReferenceField,
    StringField,
)

from ..datasets_core.models import Dataset
from ..labeling.models import Annotation
from ..projects.models import Task
from ..users.models import User


class RatingHistory(Document):
    """
    История изменений рейтинга аннотатора.
    Каждая запись — одно выполненное задание.
    """

    user = ReferenceField(User, required=True, reverse_delete_rule=CASCADE)
    task = ReferenceField(Task, required=True, reverse_delete_rule=CASCADE)
    dataset = ReferenceField(Dataset, required=True, reverse_delete_rule=CASCADE)

    # Метрики качества за это задание
    f1_score = FloatField(required=True, default=0.0, min_value=0.0, max_value=1.0)
    difficulty = FloatField(default=0.5, min_value=0.0, max_value=1.0)
    accuracy = FloatField(default=0.0, min_value=0.0, max_value=1.0)          # доля правильных ответов (из confusion matrix)

    # Итоговый балл за задание и изменение рейтинга
    task_score = FloatField(default=0.0, min_value=0.0, max_value=1.0)         # accuracy × complexity_weight
    rating_delta = FloatField(default=0.0)                                      # изменение рейтинга (может быть отрицательным)
    rating_before = FloatField(default=0.0)
    rating_after = FloatField(default=0.0)

    # Технические поля
    iteration_count = IntField(default=0)                                        # сколько итераций EM потребовалось
    annotation_format = StringField(default="generic_v1", max_length=50)
    created_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "rating_history",
        "strict": False,
        "indexes": [
            ("user", "-created_at"),
            ("task",),
            ("dataset",),
        ],
    }


class QualityMetric(Document):
    """
    Агрегированные метрики качества по задаче/датасету.
    """

    dataset = ReferenceField(Dataset, required=True, reverse_delete_rule=CASCADE)
    task = ReferenceField(Task, required=True, reverse_delete_rule=CASCADE)

    # Новое: связь с конкретным аннотатором (если метрика персональная)
    annotator = ReferenceField(User, null=True, reverse_delete_rule=CASCADE)

    precision = FloatField(required=True, default=0.0, min_value=0.0, max_value=1.0)
    recall = FloatField(required=True, default=0.0, min_value=0.0, max_value=1.0)
    f1 = FloatField(required=True, default=0.0, min_value=0.0, max_value=1.0)

    # Новое: confusion matrix аннотатора (для Dawid-Skene)
    confusion_matrix = DictField(default=dict)

    details = DictField(default=dict)

    created_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "quality_metrics",
        "strict": False,
        "indexes": [
            ("dataset", "task"),
            ("annotator",),
            ("created_at",),
        ],
    }


class QualityReview(Document):
    """
    Проверка качества (cross-check) на основе 2+ аннотаций.
    Поддерживает multi-annotator сравнение через Dawid-Skene.
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

    # Новое: список аннотаций вместо жёсткой пары
    annotations = ListField(ReferenceField(Annotation, reverse_delete_rule=CASCADE), default=list)

    review_status = StringField(required=True, choices=[c[0] for c in STATUS_CHOICES], default=STATUS_PENDING)

    metrics = DictField(default=dict)  # precision/recall/f1 + confusion_matrix по каждому аннотатору
    final_label_data = DictField(null=True)  # итоговая метка после Dawid-Skene

    # Параметры Dawid-Skene
    em_iterations = IntField(default=0)  # сколько итераций EM потребовалось
    convergence_achieved = BooleanField(default=False)

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
        if self.review_status in (self.STATUS_COMPLETED, self.STATUS_ARBITRATED) and not self.completed_at:
            self.completed_at = datetime.utcnow()
        return super().save(*args, **kwargs)
