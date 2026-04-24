from __future__ import annotations

from typing import Any, Dict, List, Optional

from mongoengine import DoesNotExist, ValidationError as MongoValidationError
from rest_framework import serializers

from ..datasets_core.models import Dataset
from ..projects.models import Task
from ..users.models import User
from .models import Annotation, LabelingSession


class AnnotationSerializer(serializers.Serializer):
    """
    Сериализатор аннотации разметки.
    Поддерживает валидацию формата на основе `annotation_format`.
    """

    id = serializers.CharField(read_only=True)

    task_id = serializers.CharField(write_only=True)
    dataset_id = serializers.CharField(write_only=True)

    session_id = serializers.CharField(required=False, allow_null=True, write_only=True)
    annotation_format = serializers.CharField(required=False, allow_blank=True, default="generic_v1")

    # Основные данные разметки.
    label_data = serializers.DictField(required=True)
    predicted_data = serializers.DictField(required=False, allow_null=True)

    status = serializers.ChoiceField(
        choices=Annotation.STATUS_CHOICES and [c[0] for c in Annotation.STATUS_CHOICES],
        required=False,
        default=Annotation.STATUS_SUBMITTED,
    )
    is_final = serializers.BooleanField(required=False, default=False)

    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def validate_task_id(self, value: str) -> str:
        if not value:
            raise serializers.ValidationError("task_id обязателен.")
        return value

    def validate_dataset_id(self, value: str) -> str:
        if not value:
            raise serializers.ValidationError("dataset_id обязателен.")
        return value

    def _expected_format(self, dataset: Dataset) -> str:
        # Если dataset.metadata содержит формат - используем его.
        return (dataset.metadata or {}).get("annotation_format", "generic_v1")

    def _validate_label_data_by_format(self, *, annotation_format: str, label_data: Dict[str, Any]) -> None:
        """
        Валидация формата разметки.
        Для MVP поддерживаем 3 схемы:
        - classification_v1
        - ner_v1
        - generic_v1 (без строгой схемы)
        """

        if not isinstance(label_data, dict):
            raise serializers.ValidationError("label_data должен быть объектом JSON.")

        if annotation_format == "classification_v1":
            class_label = label_data.get("class_label")
            if not isinstance(class_label, str) or not class_label.strip():
                raise serializers.ValidationError("Для classification_v1 требуется строка `class_label`.")
            return

        if annotation_format == "ner_v1":
            spans = label_data.get("spans")
            if not isinstance(spans, list):
                raise serializers.ValidationError("Для ner_v1 требуется список `spans`.")
            for i, span in enumerate(spans):
                if not isinstance(span, dict):
                    raise serializers.ValidationError(f"span[{i}] должен быть объектом.")
                start = span.get("start")
                end = span.get("end")
                tag = span.get("tag")
                if not isinstance(start, int) or start < 0:
                    raise serializers.ValidationError(f"span[{i}].start должен быть int >= 0.")
                if not isinstance(end, int) or end < 0 or end < start:
                    raise serializers.ValidationError(f"span[{i}].end должен быть int >= start.")
                if not isinstance(tag, str) or not tag.strip():
                    raise serializers.ValidationError(f"span[{i}].tag должен быть непустой строкой.")
            return

        # generic_v1
        # Минимум: не пустой объект.
        if not label_data:
            raise serializers.ValidationError("Для generic_v1 label_data не должен быть пустым.")

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        dataset_id = attrs.get("dataset_id")
        task_id = attrs.get("task_id")
        annotation_format = attrs.get("annotation_format") or "generic_v1"

        # Редкая, но важная защита: dataset/task должны согласоваться.
        try:
            dataset = Dataset.objects(id=dataset_id).first()
            if not dataset:
                raise serializers.ValidationError("Dataset не найден.")
        except Exception:
            raise serializers.ValidationError("Dataset не найден.")

        try:
            task = Task.objects(id=task_id).first()
            if not task:
                raise serializers.ValidationError("Task не найден.")
        except Exception:
            raise serializers.ValidationError("Task не найден.")

        if str(task.dataset.id) != str(dataset.id):
            raise serializers.ValidationError("task.dataset_id и dataset_id не совпадают.")

        expected = self._expected_format(dataset)
        # Если UI прислал annotation_format, разрешаем только совпадение с expected,
        # чтобы не было "несогласованных" схем.
        if annotation_format != expected:
            raise serializers.ValidationError(
                f"annotation_format не соответствует ожидаемому: expected={expected}, got={annotation_format}"
            )

        label_data = attrs.get("label_data") or {}
        self._validate_label_data_by_format(annotation_format=annotation_format, label_data=label_data)

        attrs["_dataset"] = dataset
        attrs["_task"] = task
        attrs["_expected_format"] = expected
        return attrs

    def create(self, validated_data: Dict[str, Any]) -> Annotation:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user:
            raise serializers.ValidationError("Authentication required.")

        task: Task = validated_data.pop("_task")
        dataset: Dataset = validated_data.pop("_dataset")
        annotation_format = validated_data.get("annotation_format") or self._expected_format(dataset)

        session_id = validated_data.pop("session_id", None)
        session: Optional[LabelingSession] = None
        if session_id:
            session = LabelingSession.objects(id=session_id, annotator=user, task=task).first()
            if not session:
                raise serializers.ValidationError("session_id не найден или не принадлежит вам.")

        annotation = Annotation(
            annotator=user,
            task=task,
            dataset=dataset,
            session=session,
            annotation_format=annotation_format,
            **validated_data,
        )
        annotation.save()
        return annotation

    def update(self, instance: Annotation, validated_data: Dict[str, Any]) -> Annotation:
        # Разрешаем обновлять label_data/статус/is_final/predicted_data.
        for field in ("label_data", "predicted_data", "status", "is_final"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save()
        return instance

    def to_representation(self, instance: Annotation) -> Dict[str, Any]:
        return {
            "id": str(instance.id),
            "task_id": str(instance.task.id),
            "dataset_id": str(instance.dataset.id),
            "session_id": str(instance.session.id) if instance.session else None,
            "annotation_format": instance.annotation_format,
            "label_data": instance.label_data,
            "predicted_data": instance.predicted_data,
            "status": instance.status,
            "is_final": instance.is_final,
            "created_at": instance.created_at,
            "updated_at": instance.updated_at,
        }

