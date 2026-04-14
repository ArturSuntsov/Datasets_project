from __future__ import annotations

from typing import Any, Dict, Optional

from bson import ObjectId
from rest_framework import serializers

from ..datasets_core.models import Dataset
from ..users.models import User
from .models import Project, Task


class ProjectSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    owner_id = serializers.CharField(source="owner.id", read_only=True)

    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    status = serializers.ChoiceField(choices=[c[0] for c in Project.STATUS_CHOICES], default=Project.STATUS_ACTIVE)

    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def create(self, validated_data: Dict[str, Any]) -> Project:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user:
            raise serializers.ValidationError("Authentication required.")
        project = Project(owner=user, **validated_data)
        project.save()
        return project

    def update(self, instance: Project, validated_data: Dict[str, Any]) -> Project:
        for field in ("title", "description", "status"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save()
        return instance

    def to_representation(self, instance: Project) -> Dict[str, Any]:
        return {
            "id": str(instance.id),
            "owner_id": str(instance.owner.id),
            "title": instance.title,
            "description": instance.description,
            "status": instance.status,
            "created_at": instance.created_at,
            "updated_at": instance.updated_at,
        }


class TaskSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)

    project_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    dataset_id = serializers.CharField()

    annotator_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    status = serializers.ChoiceField(choices=[c[0] for c in Task.STATUS_CHOICES], default=Task.STATUS_PENDING)
    difficulty_score = serializers.FloatField(required=False, default=0.5, min_value=0)
    deadline_at = serializers.DateTimeField(required=False, allow_null=True)
    input_ref = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        dataset_id = attrs.get("dataset_id")
        project_id = attrs.get("project_id")
        annotator_id = attrs.get("annotator_id")

        try:
            dataset = Dataset.objects(id=dataset_id).first()
            if not dataset:
                raise serializers.ValidationError("Dataset не найден.")
        except Exception:
            raise serializers.ValidationError("Dataset не найден.")

        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user:
            raise serializers.ValidationError("Authentication required.")

        # Безопасность: датасет может создавать только владелец.
        if str(dataset.owner.id) != str(user.id):
            raise serializers.ValidationError("Вы не являетесь владельцем dataset.")

        project = None
        if project_id:
            project = Project.objects(id=project_id, owner=user).first()
            if not project:
                raise serializers.ValidationError("Project не найден или не принадлежит вам.")

        annotator = None
        if annotator_id:
            annotator = User.objects(id=annotator_id, role=User.ROLE_ANNOTATOR).first()
            if not annotator:
                raise serializers.ValidationError("annotator_id не найден или не является исполнителем.")

        attrs["_dataset"] = dataset
        attrs["_project"] = project
        attrs["_annotator"] = annotator
        return attrs

    def create(self, validated_data: Dict[str, Any]) -> Task:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user:
            raise serializers.ValidationError("Authentication required.")

        dataset: Dataset = validated_data.pop("_dataset")
        project = validated_data.pop("_project")
        annotator = validated_data.pop("_annotator")

        # Если нет annotator — остаемся в pending.
        status = validated_data.get("status") or Task.STATUS_PENDING
        if not annotator:
            status = Task.STATUS_PENDING
        if annotator and status == Task.STATUS_PENDING:
            # Если исполнитель назначен, логичнее перевести в in_progress.
            status = Task.STATUS_IN_PROGRESS

        task = Task(
            project=project,
            dataset=dataset,
            annotator=annotator,
            status=status,
            difficulty_score=validated_data.get("difficulty_score", 0.5),
            deadline_at=validated_data.get("deadline_at"),
            input_ref=validated_data.get("input_ref"),
        )
        task.save()
        return task

    def update(self, instance: Task, validated_data: Dict[str, Any]) -> Task:
        # Разрешаем менять только некоторые поля.
        if "status" in validated_data:
            instance.status = validated_data["status"]
        if "difficulty_score" in validated_data:
            instance.difficulty_score = validated_data["difficulty_score"]
        if "deadline_at" in validated_data:
            instance.deadline_at = validated_data["deadline_at"]
        if "input_ref" in validated_data:
            instance.input_ref = validated_data["input_ref"]

        # assignment: если передали annotator_id.
        if "annotator_id" in validated_data:
            annotator_id = validated_data.get("annotator_id")
            if not annotator_id:
                instance.annotator = None
            else:
                instance.annotator = User.objects(id=annotator_id).first()

        # project_id: опционально
        if "project_id" in validated_data:
            pid = validated_data.get("project_id")
            if pid:
                instance.project = Project.objects(id=pid).first()
            else:
                instance.project = None

        instance.save()
        return instance

    def to_representation(self, instance: Task) -> Dict[str, Any]:
        return {
            "id": str(instance.id),
            "task_id": str(instance.id),  # Для совместимости с фронтендом
            "project_id": str(instance.project.id) if instance.project else None,
            "dataset_id": str(instance.dataset.id),
            "annotator_id": str(instance.annotator.id) if instance.annotator else None,
            "status": instance.status,
            "difficulty_score": instance.difficulty_score,
            "deadline_at": instance.deadline_at,
            "input_ref": instance.input_ref,
            "frame_url": instance.input_ref,  # Для MVP: используем input_ref как URL изображения
            "created_at": instance.created_at,
            "updated_at": instance.updated_at,
        }

