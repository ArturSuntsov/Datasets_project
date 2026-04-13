from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from mongoengine import BooleanField, CASCADE, DateTimeField, DictField, Document, FloatField, ReferenceField, StringField

from ..datasets_core.models import Dataset
from ..projects.models import Task
from ..users.models import User


class LabelingSession(Document):
    """
    Сессия разметки: связывает исполнителя (annotator) и задачу (Task),
    а также конкретный датасет.
    """

    STATUS_ACTIVE = "active"
    STATUS_COMPLETED = "completed"
    STATUS_CANCELLED = "cancelled"

    STATUS_CHOICES = (
        (STATUS_ACTIVE, "active"),
        (STATUS_COMPLETED, "completed"),
        (STATUS_CANCELLED, "cancelled"),
    )

    annotator = ReferenceField(User, required=True, reverse_delete_rule=CASCADE)
    task = ReferenceField(Task, required=True, reverse_delete_rule=CASCADE)
    dataset = ReferenceField(Dataset, required=True, reverse_delete_rule=CASCADE)

    status = StringField(required=True, choices=[c[0] for c in STATUS_CHOICES], default=STATUS_ACTIVE)
    ai_assisted = BooleanField(default=True)  # сессия поддерживает AI-assisted предразметку

    started_at = DateTimeField(default=datetime.utcnow)
    completed_at = DateTimeField(null=True)

    meta = {"collection": "labeling_sessions"}

    def save(self, *args, **kwargs):
        return super().save(*args, **kwargs)

    def complete(self) -> None:
        """Завершает сессию разметки."""
        self.status = self.STATUS_COMPLETED
        self.completed_at = datetime.utcnow()
        self.save()

    def auto_label(self, *, input_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        AI-предразметка (заглушка ML-модели).

        В учебном MVP возвращаем детерминированный результат на основе input_context.
        В дальнейшей версии подменится на вызов Transformers/PyTorch.
        """

        input_context = input_context or {}
        dataset_hint = (self.dataset.metadata or {}).get("annotation_format", "generic_v1")
        # MVP: под капотом "модель" просто возвращает структуру по формату.
        if dataset_hint == "classification_v1":
            # Заглушка: выбираем метку "unknown" если признак не передан.
            return {"class_label": input_context.get("class_label", "unknown")}
        if dataset_hint == "ner_v1":
            return {"spans": input_context.get("spans", [])}
        # generic_v1
        return {"result": input_context.get("result", {})}


class Annotation(Document):
    """
    Аннотация: хранит результат разметки.
    """

    STATUS_DRAFT = "draft"
    STATUS_SUBMITTED = "submitted"
    STATUS_ACCEPTED = "accepted"
    STATUS_REJECTED = "rejected"
    STATUS_PENDING_REVIEW = "pending_review"

    STATUS_CHOICES = (
        (STATUS_DRAFT, "draft"),
        (STATUS_SUBMITTED, "submitted"),
        (STATUS_PENDING_REVIEW, "pending_review"),
        (STATUS_ACCEPTED, "accepted"),
        (STATUS_REJECTED, "rejected"),
    )

    annotator = ReferenceField(User, required=True, reverse_delete_rule=CASCADE)
    task = ReferenceField(Task, required=True, reverse_delete_rule=CASCADE)
    dataset = ReferenceField(Dataset, required=True, reverse_delete_rule=CASCADE)

    session = ReferenceField(LabelingSession, null=True, reverse_delete_rule=CASCADE)

    # Формат аннотаций: определяется схемой датасета.
    annotation_format = StringField(required=True, default="generic_v1")

    # Итоговые данные разметки.
    label_data = DictField(required=True)

    # Предсказание AI (для UI/арбитража).
    predicted_data = DictField(null=True)

    # Флаги жизненного цикла.
    status = StringField(required=True, choices=[c[0] for c in STATUS_CHOICES], default=STATUS_SUBMITTED)
    is_final = BooleanField(default=False)

    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "annotations",
        "indexes": [
            "task",
            "dataset",
            "annotator",
            ("status", "created_at"),
        ],
    }

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        return super().save(*args, **kwargs)

