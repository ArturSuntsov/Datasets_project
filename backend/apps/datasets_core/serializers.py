from __future__ import annotations

from typing import Any, Dict, Optional

from rest_framework import serializers

from .models import Dataset


DATASET_STATUS_CHOICES = [c[0] for c in Dataset.STATUS_CHOICES]


class DatasetSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)

    owner_id = serializers.CharField(source="owner.id", read_only=True)

    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, default="")

    status = serializers.ChoiceField(choices=DATASET_STATUS_CHOICES, default=Dataset.STATUS_DRAFT)

    file_uri = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    schema_version = serializers.IntegerField(required=False, min_value=1, default=1)

    metadata = serializers.DictField(required=False, default=dict)

    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def _get_instance(self, obj_id: str) -> Dataset:
        # MongoEngine id is ObjectId; DRF передаем строкой.
        dataset = Dataset.objects(id=obj_id).first()
        if not dataset:
            raise serializers.ValidationError("Dataset not found.")
        return dataset

    def create(self, validated_data: Dict[str, Any]) -> Dataset:
        request = self.context.get("request")
        if not request or not getattr(request, "user", None):
            raise serializers.ValidationError("Authentication required.")
        user = request.user

        return Dataset.objects.create(owner=user, **validated_data)

    def update(self, instance: Dataset, validated_data: Dict[str, Any]) -> Dataset:
        # Обновляем только разрешенные поля.
        for field in ("name", "description", "status", "file_uri", "schema_version", "metadata"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save()
        return instance

    def to_representation(self, instance: Dataset) -> Dict[str, Any]:
        rep = super().to_representation(instance)
        # Нормализуем id.
        rep["id"] = str(instance.id)
        return rep

