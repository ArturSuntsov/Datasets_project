from django.db import models
from datetime import datetime

from mongoengine import (
    Document,
    StringField,
    ReferenceField,
    DateTimeField,
    IntField,
    FloatField,
    DictField,
    CASCADE,
)

from apps.users.models import User


# Create your models here.
class CVProject(Document):
    """
    Проект компьютерного зрения:
    объединяет задачи разметки изображений/видео.
    """

    ANNOTATION_SEGMENTATION = "segmentation"
    ANNOTATION_BBOX = "bbox"

    owner = ReferenceField(User, null=True, reverse_delete_rule=CASCADE)  # null=True для MVP

    title = StringField(required=True, max_length=255)
    description = StringField(default="")

    annotation_type = StringField(
        required=True,
        choices=[ANNOTATION_SEGMENTATION, ANNOTATION_BBOX],
        default=ANNOTATION_BBOX
    )

    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "cv_projects"}

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        return super().save(*args, **kwargs)


class MediaAsset(Document):
    """
    Загруженный image/video файл.
    """

    TYPE_IMAGE = "image"
    TYPE_VIDEO = "video"

    project = ReferenceField(CVProject, required=True, reverse_delete_rule=CASCADE)

    file_uri = StringField(required=True)
    file_name = StringField(required=True)
    file_size = IntField(required=True)
    mime_type = StringField(required=True)

    asset_type = StringField(
        required=True,
        choices=[TYPE_IMAGE, TYPE_VIDEO]
    )

    created_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "cv_media_assets"}


class MediaFrame(Document):
    """
    Кадр изображения/видео для разметки.
    """

    asset = ReferenceField(MediaAsset, required=True, reverse_delete_rule=CASCADE)

    frame_uri = StringField(required=True)

    frame_number = IntField(default=0)
    timestamp = FloatField(default=0)

    meta = {"collection": "cv_media_frames"}


class AnnotationTask(Document):
    """
    Задача разметки одного кадра.
    """

    STATUS_PENDING = "pending"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_DONE = "done"

    frame = ReferenceField(MediaFrame, required=True, reverse_delete_rule=CASCADE)

    assigned_to = ReferenceField(User, null=True)

    status = StringField(
        required=True,
        choices=[STATUS_PENDING, STATUS_IN_PROGRESS, STATUS_DONE],
        default=STATUS_PENDING
    )

    meta = {"collection": "cv_annotation_tasks"}


class PreprocessingArtifact(Document):
    """
    Результаты preprocessing (SAM masks / embeddings).
    """

    TYPE_SAM_MASKS = "sam_masks"

    frame = ReferenceField(MediaFrame, required=True, reverse_delete_rule=CASCADE)

    artifact_type = StringField(
        required=True,
        choices=[TYPE_SAM_MASKS]
    )

    data_uri = StringField(required=True)

    metadata = DictField(default=dict)

    meta = {"collection": "cv_preprocessing_artifacts"}


class Annotation(Document):
    """
    Финальная разметка пользователя.
    """

    task = ReferenceField(AnnotationTask, required=True, reverse_delete_rule=CASCADE)

    annotator = ReferenceField(User, null=True, reverse_delete_rule=CASCADE)  # null=True для MVP

    data = DictField(required=True)

    created_at = DateTimeField(default=datetime.utcnow)

    meta = {"collection": "cv_annotations"}