from __future__ import annotations

from typing import Any, Dict, Optional

from rest_framework import serializers

from .models import Dataset


DATASET_STATUS_CHOICES = [c[0] for c in Dataset.STATUS_CHOICES]
UPLOAD_STATUS_CHOICES = ["pending", "uploading", "uploaded", "failed"]


class DatasetSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    owner_id = serializers.CharField(source="owner.id", read_only=True)

    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    status = serializers.ChoiceField(choices=DATASET_STATUS_CHOICES, default=Dataset.STATUS_DRAFT)

    # Data Lake поля (только для чтения или опциональные)
    file_uri = serializers.CharField(required=False, allow_blank=True, allow_null=True, read_only=True)
    file_size_bytes = serializers.IntegerField(read_only=True, required=False)
    file_hash = serializers.CharField(read_only=True, required=False, allow_blank=True)
    storage_path = serializers.CharField(read_only=True, required=False, allow_blank=True)
    upload_status = serializers.ChoiceField(
        choices=UPLOAD_STATUS_CHOICES,
        read_only=True,
        default="pending"
    )
    mime_type = serializers.CharField(read_only=True, required=False, allow_blank=True)

    schema_version = serializers.IntegerField(required=False, min_value=1, default=1)
    metadata = serializers.DictField(required=False, default=dict)

    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def _get_instance(self, obj_id: str) -> Dataset:
        dataset = Dataset.objects(id=obj_id).first()
        if not dataset:
            raise serializers.ValidationError("Dataset not found.")
        return dataset

    def create(self, validated_data: Dict[str, Any]) -> Dataset:
        request = self.context.get("request")
        if not request or not getattr(request, "user", None):
            raise serializers.ValidationError("Authentication required.")
        user = request.user

        # При создании датасета файл ещё не загружен
        return Dataset.objects.create(owner=user, **validated_data)

    def update(self, instance: Dataset, validated_data: Dict[str, Any]) -> Dataset:
        # Обновляем только разрешенные поля
        for field in ("name", "description", "status", "schema_version", "metadata"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save()
        return instance

    def to_representation(self, instance: Dataset) -> Dict[str, Any]:
        rep = super().to_representation(instance)
        rep["id"] = str(instance.id)
        return rep


class DatasetUploadSerializer(serializers.Serializer):
    """Сериализатор для загрузки файла датасета."""
    
    file = serializers.FileField(required=True)
    
    def validate_file(self, value):
        """Валидация загруженного файла."""
        from django.conf import settings
        
        # Проверка размера
        if value.size > settings.MAX_DATASET_SIZE_MB * 1024 * 1024:
            raise serializers.ValidationError(
                f"File too large. Max size: {settings.MAX_DATASET_SIZE_MB}MB"
            )
        
        # Проверка расширения
        import os
        ext = os.path.splitext(value.name)[1].lower().lstrip('.')
        if ext not in settings.ALLOWED_DATASET_EXTENSIONS:
            raise serializers.ValidationError(
                f"File extension not allowed. Allowed: {', '.join(settings.ALLOWED_DATASET_EXTENSIONS)}"
            )
        
        return value


class DatasetUploadStatusSerializer(serializers.Serializer):
    """Сериализатор для статуса загрузки."""
    
    status = serializers.CharField()
    progress = serializers.IntegerField(required=False, min_value=0, max_value=100)
    file_size_bytes = serializers.IntegerField(required=False)
    file_hash = serializers.CharField(required=False)
    error = serializers.CharField(required=False)


class DatasetDownloadSerializer(serializers.Serializer):
    """Сериализатор для ссылки на скачивание."""
    
    download_url = serializers.CharField()
    expires_in = serializers.IntegerField()
    file_name = serializers.CharField()
    file_size = serializers.IntegerField()
