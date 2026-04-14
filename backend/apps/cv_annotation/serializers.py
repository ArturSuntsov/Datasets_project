from rest_framework import serializers
from .models import CVProject, MediaAsset, MediaFrame, AnnotationTask, Annotation


class CVProjectSerializer(serializers.Serializer):
    id = serializers.CharField(read_only=True)

    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)

    annotation_type = serializers.ChoiceField(
        choices=["bbox", "segmentation"],
        default="bbox"
    )


class MediaUploadResponseSerializer(serializers.Serializer):
    asset_id = serializers.CharField()
    type = serializers.ChoiceField(choices=["image", "video"])

    frames_created = serializers.IntegerField(required=False)


class MediaFrameSerializer(serializers.Serializer):
    id = serializers.CharField()

    frame_url = serializers.CharField()

    frame_index = serializers.IntegerField()
    timestamp = serializers.FloatField(required=False)


# class AnnotationTaskSerializer(serializers.Serializer):
#     id = serializers.CharField()

#     project_id = serializers.CharField()
#     asset_id = serializers.CharField()

#     status = serializers.ChoiceField(
#         choices=["pending", "in_progress", "completed"],
#         default="pending"
#     )

class AnnotationTaskSerializer(serializers.Serializer):
    task_id = serializers.CharField()

    frame = MediaFrameSerializer()

    annotation_type = serializers.ChoiceField(
        choices=["bbox", "segmentation"]
    )

    suggested_data = serializers.DictField(required=False)


class BoundingBoxSerializer(serializers.Serializer):
    x = serializers.FloatField()
    y = serializers.FloatField()
    width = serializers.FloatField()
    height = serializers.FloatField()
    label = serializers.CharField()


class AnnotationSubmitSerializer(serializers.Serializer):
    boxes = BoundingBoxSerializer(many=True, required=False)

    polygons = serializers.ListField(
        child=serializers.ListField(child=serializers.FloatField()),
        required=False
    )


class AnnotationResponseSerializer(serializers.Serializer):
    annotation_id = serializers.CharField()
    status = serializers.CharField()


class NextTaskResponseSerializer(serializers.Serializer):
    task_id = serializers.CharField()

    frame_url = serializers.CharField()

    annotation_type = serializers.CharField()

    suggested_data = serializers.DictField(required=False)


