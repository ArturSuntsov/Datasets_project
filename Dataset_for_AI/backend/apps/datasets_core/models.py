from __future__ import annotations

from datetime import datetime

from mongoengine import CASCADE, DateTimeField, DictField, Document, IntField, ReferenceField, StringField

from ..users.models import User


class Dataset(Document):
    """
    Базовая сущность датасета.

    Храним только метаданные в MongoDB; данные файлов обычно лежат в S3/MinIO/GridFS,
    поэтому `file_uri` держим как ссылку.
    """

    STATUS_DRAFT = "draft"
    STATUS_ACTIVE = "active"
    STATUS_ARCHIVED = "archived"

    STATUS_CHOICES = (
        (STATUS_DRAFT, "draft"),
        (STATUS_ACTIVE, "active"),
        (STATUS_ARCHIVED, "archived"),
    )

    owner = ReferenceField(User, required=True, reverse_delete_rule=CASCADE)

    name = StringField(required=True, max_length=255)
    description = StringField(default="")

    status = StringField(required=True, choices=[c[0] for c in STATUS_CHOICES], default=STATUS_DRAFT)

    # Ссылка на файл/пакет (S3/MinIO URL или путь).
    file_uri = StringField(required=False, null=True)

    # Версионирование схемы датасета/формата меток (упрощенный MVP).
    schema_version = IntField(required=True, min_value=1, default=1)

    metadata = DictField(default=dict)

    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "datasets"}

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        return super().save(*args, **kwargs)

