from __future__ import annotations

from datetime import datetime

from mongoengine import CASCADE, DateTimeField, FloatField, IntField, Document, ReferenceField, StringField

from ..datasets_core.models import Dataset
from ..users.models import User


class Project(Document):
    """
    Проект заказчика: объединяет датасеты и задачи разметки.
    """

    STATUS_OPEN = "open"
    STATUS_ACTIVE = "active"
    STATUS_CLOSED = "closed"

    STATUS_CHOICES = (
        (STATUS_OPEN, "open"),
        (STATUS_ACTIVE, "active"),
        (STATUS_CLOSED, "closed"),
    )

    owner = ReferenceField(User, required=True, reverse_delete_rule=CASCADE)
    title = StringField(required=True, max_length=255)
    description = StringField(default="", max_length=2000)
    status = StringField(required=True, choices=[c[0] for c in STATUS_CHOICES], default=STATUS_ACTIVE)

    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "projects",
        "indexes": [
            "owner",
            "status",
            ("created_at", "-created_at"),
        ],
    }

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        return super().save(*args, **kwargs)


class Task(Document):
    """
    Задача на разметку (labeling job).
    Поддерживает состояние Kanban:
    pending → in_progress → review → completed → rejected
    """

    STATUS_PENDING = "pending"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_REVIEW = "review"
    STATUS_COMPLETED = "completed"
    STATUS_REJECTED = "rejected"

    STATUS_CHOICES = (
        (STATUS_PENDING, "pending"),
        (STATUS_IN_PROGRESS, "in_progress"),
        (STATUS_REVIEW, "review"),
        (STATUS_COMPLETED, "completed"),
        (STATUS_REJECTED, "rejected"),
    )

    project = ReferenceField(Project, null=True, reverse_delete_rule=CASCADE)
    dataset = ReferenceField(Dataset, required=True, reverse_delete_rule=CASCADE)

    # Исполнитель (аннотатора) назначается для in_progress.
    annotator = ReferenceField(User, null=True, reverse_delete_rule=CASCADE)

    # Active Learning: чем выше difficulty_score, тем раньше задача будет выбрана.
    difficulty_score = FloatField(required=True, default=0.5, min_value=0)

    # Для контроля жизненного цикла.
    status = StringField(required=True, choices=[c[0] for c in STATUS_CHOICES], default=STATUS_PENDING)
    deadline_at = DateTimeField(null=True)

    # Для MVP: какой именно фрагмент датасета размечается (chunk_id / item_id).
    # Реальные данные будут в отдельном хранилище (S3/MinIO/GridFS).
    input_ref = StringField(required=False, null=True, max_length=512)

    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "tasks",
        "indexes": [
            "status",
            ("difficulty_score", "-difficulty_score"),
            "annotator",
            ("dataset", "created_at"),
            ("deadline_at",),
        ],
    }

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        return super().save(*args, **kwargs)

