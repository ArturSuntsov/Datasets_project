from __future__ import annotations

from datetime import datetime

from mongoengine import CASCADE, DateTimeField, DictField, Document, IntField, ReferenceField, StringField

from ..users.models import User


class Dataset(Document):
    """Базовая сущность датасета."""
    
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
    file_uri = StringField(required=False, null=True)
    schema_version = IntField(required=True, min_value=1, default=1)
    metadata = DictField(default=dict)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    # Data Lake поля (MinIO)
    file_size_bytes = IntField(min_value=0, default=0)
    file_hash = StringField(max_length=64, default="")  # SHA256
    storage_path = StringField(max_length=512, default="")  # путь в MinIO
    upload_status = StringField(
        choices=["pending", "uploading", "uploaded", "failed"],
        default="pending"
    )
    mime_type = StringField(max_length=127, default="application/octet-stream")

    meta = {"collection": "datasets"}

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        return super().save(*args, **kwargs)
