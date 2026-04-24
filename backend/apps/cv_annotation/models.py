from __future__ import annotations

from datetime import datetime

from mongoengine import (
    BooleanField,
    CASCADE,
    DateTimeField,
    DictField,
    Document,
    FloatField,
    IntField,
    ListField,
    ReferenceField,
    StringField,
)

from apps.projects.models import Project
from apps.users.models import User


class ImportSession(Document):
    STATUS_DRAFT = "draft"
    STATUS_READY = "ready"
    STATUS_FINALIZED = "finalized"
    STATUS_FAILED = "failed"

    project = ReferenceField(Project, required=True, reverse_delete_rule=CASCADE)
    created_by = ReferenceField(User, required=True, reverse_delete_rule=CASCADE)
    status = StringField(required=True, default=STATUS_DRAFT, choices=[STATUS_DRAFT, STATUS_READY, STATUS_FINALIZED, STATUS_FAILED])
    summary = DictField(default=dict)
    preview = DictField(default=dict)
    errors = ListField(StringField(), default=list)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "cv_import_sessions",
        "indexes": ["project", "status", "created_by"],
    }

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        return super().save(*args, **kwargs)


class ImportAsset(Document):
    TYPE_IMAGE = "image"
    TYPE_VIDEO = "video"

    STATUS_UPLOADED = "uploaded"
    STATUS_PROCESSED = "processed"
    STATUS_FAILED = "failed"

    import_session = ReferenceField(ImportSession, required=True, reverse_delete_rule=CASCADE)
    project = ReferenceField(Project, required=True, reverse_delete_rule=CASCADE)
    file_uri = StringField(required=True)
    file_name = StringField(required=True)
    file_size = IntField(required=True)
    mime_type = StringField(required=True)
    asset_type = StringField(required=True, choices=[TYPE_IMAGE, TYPE_VIDEO])
    processing_status = StringField(required=True, default=STATUS_UPLOADED, choices=[STATUS_UPLOADED, STATUS_PROCESSED, STATUS_FAILED])
    frame_count = IntField(default=0)
    error_message = StringField(default="")
    metadata = DictField(default=dict)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "cv_import_assets",
        "indexes": ["project", "import_session", "processing_status", "asset_type"],
    }

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        return super().save(*args, **kwargs)


class FrameItem(Document):
    project = ReferenceField(Project, required=True, reverse_delete_rule=CASCADE)
    asset = ReferenceField(ImportAsset, required=True, reverse_delete_rule=CASCADE)
    frame_uri = StringField(required=True)
    frame_number = IntField(default=0)
    timestamp_sec = FloatField(default=0.0)
    width = IntField(default=0)
    height = IntField(default=0)
    created_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "cv_frame_items",
        "indexes": ["project", "asset", ("asset", "frame_number")],
    }


class WorkItem(Document):
    STATUS_PENDING = "pending"
    STATUS_IN_REVIEW = "in_review"
    STATUS_COMPLETED = "completed"

    project = ReferenceField(Project, required=True, reverse_delete_rule=CASCADE)
    frame = ReferenceField(FrameItem, required=True, reverse_delete_rule=CASCADE)
    status = StringField(required=True, default=STATUS_PENDING, choices=[STATUS_PENDING, STATUS_IN_REVIEW, STATUS_COMPLETED])
    agreement_score = FloatField(default=0.0)
    final_annotation = DictField(default=dict)
    final_source = StringField(default="")
    review_required = BooleanField(default=False)
    review_status = StringField(default="none")
    pre_annotations = DictField(default=dict)
    pre_annotation_model = StringField(default="")
    pre_annotation_confidence_threshold = FloatField(default=0.7)
    workflow_meta = DictField(default=dict)
    video_qc = DictField(default=dict)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "cv_work_items",
        "indexes": ["project", "status", "review_status"],
    }

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        return super().save(*args, **kwargs)


class Assignment(Document):
    STATUS_ASSIGNED = "assigned"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_DRAFT = "draft"
    STATUS_SUBMITTED = "submitted"
    STATUS_ACCEPTED = "accepted"
    STATUS_REJECTED = "rejected"
    STATUS_DISPUTED = "disputed"

    project = ReferenceField(Project, required=True, reverse_delete_rule=CASCADE)
    work_item = ReferenceField(WorkItem, required=True, reverse_delete_rule=CASCADE)
    annotator = ReferenceField(User, required=True, reverse_delete_rule=CASCADE)
    order_index = IntField(default=0)
    queue_position = IntField(default=0)
    status = StringField(
        required=True,
        default=STATUS_ASSIGNED,
        choices=[STATUS_ASSIGNED, STATUS_IN_PROGRESS, STATUS_DRAFT, STATUS_SUBMITTED, STATUS_ACCEPTED, STATUS_REJECTED, STATUS_DISPUTED],
    )
    quality_signals = DictField(default=dict)
    started_at = DateTimeField(null=True)
    submitted_at = DateTimeField(null=True)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "cv_assignments",
        "indexes": [
            {"fields": ["work_item", "annotator"], "unique": True},
            "annotator",
            "project",
            "status",
        ],
    }

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        return super().save(*args, **kwargs)


class WorkAnnotation(Document):
    STATUS_DRAFT = "draft"
    STATUS_SUBMITTED = "submitted"
    STATUS_ACCEPTED = "accepted"
    STATUS_REJECTED = "rejected"

    assignment = ReferenceField(Assignment, required=True, reverse_delete_rule=CASCADE, unique=True)
    work_item = ReferenceField(WorkItem, required=True, reverse_delete_rule=CASCADE)
    annotator = ReferenceField(User, required=True, reverse_delete_rule=CASCADE)
    annotation_format = StringField(default="bbox")
    label_data = DictField(required=True)
    comment = StringField(default="")
    status = StringField(required=True, default=STATUS_DRAFT, choices=[STATUS_DRAFT, STATUS_SUBMITTED, STATUS_ACCEPTED, STATUS_REJECTED])
    is_final = BooleanField(default=False)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "cv_work_annotations",
        "indexes": ["work_item", "annotator", "status"],
    }

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        return super().save(*args, **kwargs)


class ReviewRecord(Document):
    STATUS_PENDING = "pending"
    STATUS_RESOLVED = "resolved"

    project = ReferenceField(Project, required=True, reverse_delete_rule=CASCADE)
    work_item = ReferenceField(WorkItem, required=True, reverse_delete_rule=CASCADE, unique=True)
    reviewer = ReferenceField(User, null=True, reverse_delete_rule=CASCADE)
    status = StringField(required=True, default=STATUS_PENDING, choices=[STATUS_PENDING, STATUS_RESOLVED])
    agreement_score = FloatField(default=0.0)
    metrics = DictField(default=dict)
    dispute_reason = StringField(default="")
    resolution = DictField(default=dict)
    golden_frame_ids = ListField(StringField(), default=list)
    golden_total = IntField(default=0)
    golden_errors = IntField(default=0)
    golden_score = FloatField(default=0.0)
    created_at = DateTimeField(default=datetime.utcnow)
    resolved_at = DateTimeField(null=True)

    meta = {
        "collection": "cv_review_records",
        "indexes": ["project", "status", "reviewer"],
    }


class GoldenFrame(Document):
    project = ReferenceField(Project, required=True, reverse_delete_rule=CASCADE)
    frame = ReferenceField(FrameItem, required=True, reverse_delete_rule=CASCADE)
    reference_annotation = DictField(required=True, default=dict)
    is_active = BooleanField(default=True)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "cv_golden_frames",
        "indexes": ["project", "is_active"],
    }

    def save(self, *args, **kwargs):
        self.updated_at = datetime.utcnow()
        return super().save(*args, **kwargs)


class SecurityEvent(Document):
    EVENT_IMPORT_CLEANUP = "import_cleanup"
    EVENT_PREANNOTATION = "preannotation"
    EVENT_REVIEW_RESOLVE = "review_resolve"
    EVENT_VIDEO_QC = "video_qc"
    EVENT_ASSIGNMENT_DISTRIBUTION = "assignment_distribution"

    project = ReferenceField(Project, required=True, reverse_delete_rule=CASCADE)
    actor = ReferenceField(User, null=True, reverse_delete_rule=CASCADE)
    event_type = StringField(required=True)
    severity = StringField(default="info")
    payload = DictField(default=dict)
    created_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "cv_security_events",
        "indexes": ["project", "event_type", "severity", "created_at"],
    }
