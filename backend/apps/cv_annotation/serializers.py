from __future__ import annotations

from bson import ObjectId
from rest_framework import serializers

from apps.projects.models import Project
from apps.users.models import User
from .models import Assignment, ImportSession, ReviewRecord


class ImportFinalizeSerializer(serializers.Serializer):
    import_id = serializers.CharField()

    def validate_import_id(self, value: str) -> str:
        if not ObjectId.is_valid(value):
            raise serializers.ValidationError("Invalid import_id")
        return value


class AssignmentSubmitSerializer(serializers.Serializer):
    label_data = serializers.DictField()
    comment = serializers.CharField(required=False, allow_blank=True, default="")
    is_final = serializers.BooleanField(required=False, default=True)

    def validate_label_data(self, value):
        boxes = value.get("boxes", [])
        if not isinstance(boxes, list):
            raise serializers.ValidationError("label_data.boxes must be a list")
        for box in boxes:
            for key in ("x", "y", "width", "height", "label"):
                if key not in box:
                    raise serializers.ValidationError(f"Each box must include '{key}'")
        return value


class ReviewResolveSerializer(serializers.Serializer):
    resolution = serializers.DictField()
    comment = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_resolution(self, value):
        boxes = value.get("boxes", [])
        if not isinstance(boxes, list):
            raise serializers.ValidationError("resolution.boxes must be a list")
        return value


class ParticipantSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)
    username = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)
    role = serializers.CharField(read_only=True)
    rating = serializers.FloatField(read_only=True)
    specialization = serializers.CharField(read_only=True)
    group_name = serializers.CharField(read_only=True)


class ProjectOverviewSerializer(serializers.Serializer):
    project_id = serializers.CharField()
    project = serializers.DictField()
    imports = serializers.DictField()
    work_items = serializers.DictField()
    assignments = serializers.DictField()
    reviews = serializers.DictField()
    annotators = serializers.ListField(child=serializers.DictField())


class QueueItemSerializer(serializers.Serializer):
    assignment_id = serializers.CharField()
    project_id = serializers.CharField()
    project_title = serializers.CharField()
    work_item_id = serializers.CharField()
    frame_url = serializers.CharField()
    status = serializers.CharField()
    instruction = serializers.CharField()
    label_schema = serializers.ListField(child=serializers.DictField())
    created_at = serializers.DateTimeField()


class ReviewQueueItemSerializer(serializers.Serializer):
    review_id = serializers.CharField()
    project_id = serializers.CharField()
    project_title = serializers.CharField()
    work_item_id = serializers.CharField()
    frame_url = serializers.CharField()
    agreement_score = serializers.FloatField()
    metrics = serializers.DictField()
    annotations = serializers.ListField(child=serializers.DictField())
