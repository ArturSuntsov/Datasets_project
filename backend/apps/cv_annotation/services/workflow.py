from __future__ import annotations

from datetime import datetime
import hashlib
import io
import json
import random
import zipfile
from typing import Dict, Iterable, List, Optional, Tuple

from mongoengine import Q

from apps.projects.models import Project, ProjectMembership
from apps.users.models import User
from ..models import Assignment, FrameItem, GoldenFrame, ImportAsset, ImportSession, ReviewRecord, WorkAnnotation, WorkItem, SecurityEvent
from .frames import FrameExtractionError, extract_video_frames
from .preannotation import generate_preannotation_for_frame
from .security import log_security_event
from .upload import absolute_media_path, image_dimensions
from .video_qc import build_video_qc_payload, interpolate_boxes

DEFAULT_TASK_BATCH_SIZE = 10
DEFAULT_MIN_SEQUENCE_SIZE = 3


def _next_queue_position(project: Project) -> int:
    last_assignment = Assignment.objects(project=project).order_by("-queue_position").first()
    return int(last_assignment.queue_position or 0) + 1 if last_assignment else 0


def _batch_work_items(project: Project, task_batch_id: str) -> List[WorkItem]:
    items = [
        item
        for item in WorkItem.objects(project=project)
        if (item.workflow_meta or {}).get("task_batch_id") == task_batch_id
    ]
    return sorted(
        items,
        key=lambda item: (
            int((item.workflow_meta or {}).get("task_batch_number") or 0),
            int((item.workflow_meta or {}).get("task_batch_index") or 0),
            int(item.frame.frame_number or 0),
        ),
    )


def _work_item_payload(work_item: WorkItem, assignment: Optional[Assignment] = None) -> dict:
    frame = work_item.frame
    final_boxes = _normalize_boxes(work_item.final_annotation)
    return {
        "work_item_id": str(work_item.id),
        "frame_id": str(frame.id),
        "frame_url": frame.frame_uri,
        "frame_number": frame.frame_number,
        "timestamp_sec": frame.timestamp_sec,
        "width": frame.width,
        "height": frame.height,
        "status": work_item.status,
        "assignment_id": str(assignment.id) if assignment else None,
        "assignment_status": assignment.status if assignment else None,
        "queue_position": assignment.queue_position if assignment else None,
        "workflow_meta": work_item.workflow_meta or {},
        "agreement_score": float(work_item.agreement_score or 0.0),
        "final_annotation": {"boxes": final_boxes},
        "final_box_count": len(final_boxes),
        "video_qc": work_item.video_qc or {},
        "validation_status": work_item.validation_status or WorkItem.VALIDATION_PENDING,
        "validation_comment": work_item.validation_comment or "",
    }


def annotator_batch_payload(project: Project, annotator: User, current_assignment: Assignment) -> dict:
    task_batch_id = str((current_assignment.work_item.workflow_meta or {}).get("task_batch_id") or "").strip()
    if not task_batch_id:
        return {"task_batch_id": "", "items": [], "current_index": 0, "total": 0}
    batch_items = _batch_work_items(project, task_batch_id)
    assignments = {
        str(item.work_item.id): item
        for item in Assignment.objects(project=project, annotator=annotator, work_item__in=batch_items)
    }
    items_payload = []
    current_index = 0
    for index, work_item in enumerate(batch_items, start=1):
        assignment = assignments.get(str(work_item.id))
        payload = _work_item_payload(work_item, assignment=assignment)
        items_payload.append(payload)
        if assignment and str(assignment.id) == str(current_assignment.id):
            current_index = index
    return {
        "task_batch_id": task_batch_id,
        "batch_number": int((current_assignment.work_item.workflow_meta or {}).get("task_batch_number") or 0),
        "total_batches": int((current_assignment.work_item.workflow_meta or {}).get("task_batch_total") or 0),
        "current_index": current_index,
        "total": len(items_payload),
        "items": items_payload,
    }


def validation_queue(projects: List[Project]) -> List[dict]:
    items: List[dict] = []
    for project in projects:
        work_items = list(WorkItem.objects(project=project))
        batch_ids = sorted({str(item.workflow_meta.get("task_batch_id") or "") for item in work_items if item.workflow_meta.get("task_batch_id")})
        for batch_id in batch_ids:
            batch_items = _batch_work_items(project, batch_id)
            if not batch_items:
                continue
            ready_items = [item for item in batch_items if item.status == WorkItem.STATUS_COMPLETED]
            if len(ready_items) != len(batch_items):
                continue
            has_pending = any(item.validation_status != WorkItem.VALIDATION_APPROVED for item in batch_items)
            if not has_pending:
                continue
            needs_changes = sum(1 for item in batch_items if item.validation_status == WorkItem.VALIDATION_NEEDS_CHANGES)
            flagged_items = sum(1 for item in batch_items if (item.video_qc or {}).get("flag_for_review"))
            items.append(
                {
                    "project_id": str(project.id),
                    "project_title": project.title,
                    "task_batch_id": batch_id,
                    "batch_number": int((batch_items[0].workflow_meta or {}).get("task_batch_number") or 0),
                    "frames_total": len(batch_items),
                    "approved_frames": sum(1 for item in batch_items if item.validation_status == WorkItem.VALIDATION_APPROVED),
                    "needs_changes_frames": needs_changes,
                    "flagged_frames": flagged_items,
                    "average_agreement": round(sum(float(item.agreement_score or 0.0) for item in batch_items) / len(batch_items), 4),
                    "validation_status": "needs_changes" if needs_changes else "pending",
                }
            )
    items.sort(key=lambda item: (item["project_title"], item["batch_number"]))
    return items


def validation_batch_detail(project: Project, task_batch_id: str) -> dict:
    batch_items = _batch_work_items(project, task_batch_id)
    return {
        "project_id": str(project.id),
        "project_title": project.title,
        "task_batch_id": task_batch_id,
        "batch_number": int((batch_items[0].workflow_meta or {}).get("task_batch_number") or 0) if batch_items else 0,
        "frames_total": len(batch_items),
        "items": [_work_item_payload(item) for item in batch_items],
        "all_approved": all(item.validation_status == WorkItem.VALIDATION_APPROVED for item in batch_items) if batch_items else False,
    }


def build_import_preview(import_session: ImportSession) -> dict:
    assets = list(ImportAsset.objects(import_session=import_session))
    processed = [asset for asset in assets if asset.processing_status == ImportAsset.STATUS_PROCESSED]
    failed = [asset for asset in assets if asset.processing_status == ImportAsset.STATUS_FAILED]
    preview_frames = list(FrameItem.objects(project=import_session.project, asset__in=[asset.id for asset in processed]).limit(5))
    return {
        "assets_total": len(assets),
        "assets_processed": len(processed),
        "assets_failed": len(failed),
        "frames_total": sum(asset.frame_count for asset in processed),
        "errors": [asset.error_message for asset in failed if asset.error_message],
        "sample_frames": [frame.frame_uri for frame in preview_frames],
        "cleanup": import_session.summary.get("cleanup", {}) if isinstance(import_session.summary, dict) else {},
    }


def process_import_asset(asset: ImportAsset, interval_sec: float) -> ImportAsset:
    try:
        if asset.asset_type == ImportAsset.TYPE_IMAGE:
            dims = image_dimensions(asset.file_uri)
            FrameItem.objects(project=asset.project, asset=asset).delete()
            FrameItem(
                project=asset.project,
                asset=asset,
                frame_uri=asset.file_uri,
                frame_number=0,
                timestamp_sec=0.0,
                width=dims["width"],
                height=dims["height"],
            ).save()
            asset.frame_count = 1
            asset.metadata = dims
        else:
            FrameItem.objects(project=asset.project, asset=asset).delete()
            extracted = extract_video_frames(asset.file_uri, str(asset.project.id), str(asset.import_session.id), interval_sec)
            for frame in extracted:
                FrameItem(project=asset.project, asset=asset, **frame).save()
            asset.frame_count = len(extracted)
            asset.metadata = {
                "frame_interval_sec": interval_sec,
                "video_frames_extracted": len(extracted),
            }
        asset.processing_status = ImportAsset.STATUS_PROCESSED
        asset.error_message = ""
    except FrameExtractionError as exc:
        asset.processing_status = ImportAsset.STATUS_FAILED
        asset.error_message = f"Frame extraction failed: {exc}"
        asset.frame_count = 0
        asset.metadata = {"frame_interval_sec": interval_sec, "failed_stage": "frame_extraction"}
    except Exception as exc:
        asset.processing_status = ImportAsset.STATUS_FAILED
        asset.error_message = str(exc)
        asset.frame_count = 0
    asset.save()
    cleanup = _cleanup_processed_asset(asset)
    if cleanup:
        asset.metadata = {**(asset.metadata or {}), "cleanup": cleanup}
        asset.save()
    return asset


def _file_sha256(file_uri: str) -> str:
    path = absolute_media_path(file_uri)
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _cleanup_processed_asset(asset: ImportAsset) -> dict:
    removed_duplicates = 0
    removed_invalid_frames = 0
    duplicate_of_asset_id = ""
    duplicate = (
        ImportAsset.objects(
            project=asset.project,
            processing_status=ImportAsset.STATUS_PROCESSED,
            id__ne=asset.id,
            file_size=asset.file_size,
            file_name=asset.file_name,
        )
        .first()
    )
    current_hash = ""
    try:
        current_hash = _file_sha256(asset.file_uri)
    except Exception:
        current_hash = ""
    if duplicate:
        duplicate_hash = duplicate.metadata.get("sha256", "")
        if not duplicate_hash:
            try:
                duplicate_hash = _file_sha256(duplicate.file_uri)
            except Exception:
                duplicate_hash = ""
        if current_hash and duplicate_hash and current_hash == duplicate_hash:
            duplicate_of_asset_id = str(duplicate.id)
            FrameItem.objects(project=asset.project, asset=asset).delete()
            removed_duplicates = asset.frame_count
            asset.processing_status = ImportAsset.STATUS_FAILED
            asset.error_message = f"Duplicate asset detected (same content as {duplicate_of_asset_id})"
            asset.frame_count = 0
    valid_frames = []
    for frame in FrameItem.objects(project=asset.project, asset=asset):
        if frame.width <= 0 or frame.height <= 0:
            frame.delete()
            removed_invalid_frames += 1
            continue
        valid_frames.append(frame)
    if asset.processing_status == ImportAsset.STATUS_PROCESSED:
        asset.frame_count = len(valid_frames)
    metadata = asset.metadata or {}
    if current_hash:
        metadata["sha256"] = current_hash
    cleanup = {
        "removed_duplicates": removed_duplicates,
        "removed_invalid_frames": removed_invalid_frames,
        "duplicate_of_asset_id": duplicate_of_asset_id,
    }
    metadata["cleanup"] = cleanup
    asset.metadata = metadata
    asset.save()
    if removed_duplicates or removed_invalid_frames:
        log_security_event(
            project=asset.project,
            event_type=SecurityEvent.EVENT_IMPORT_CLEANUP,
            payload={"asset_id": str(asset.id), **cleanup},
            severity="warning" if removed_duplicates else "info",
        )
    return cleanup


def select_annotators_for_project(project: Project, limit: int) -> List[User]:
    membership_qs = ProjectMembership.objects(project=project, role=ProjectMembership.ROLE_ANNOTATOR, is_active=True)
    memberships = list(membership_qs)
    allowed_ids = {str(user.id) for user in (project.allowed_annotators or [])}
    rules = project.participant_rules or {}
    assignment_scope = str(rules.get("assignment_scope") or "selected_only").strip().lower()
    required_specialization = str(rules.get("specialization") or "").strip().lower()
    required_group = str(rules.get("group") or "").strip().lower()

    if allowed_ids and assignment_scope != "all":
        memberships = [membership for membership in memberships if str(membership.user.id) in allowed_ids]

    if not memberships and allowed_ids:
        allowed_users = list(User.objects(id__in=list(allowed_ids), role=User.ROLE_ANNOTATOR, is_active=True))
        memberships = []
        for user in allowed_users:
            membership = ProjectMembership.objects(
                project=project,
                user=user,
                role=ProjectMembership.ROLE_ANNOTATOR,
            ).first()
            if not membership:
                membership = ProjectMembership(
                    project=project,
                    user=user,
                    role=ProjectMembership.ROLE_ANNOTATOR,
                )
            membership.is_active = True
            membership.specialization = user.specialization
            membership.group_name = user.group_name
            membership.save()
            memberships.append(membership)

    if not memberships and assignment_scope == "all":
        fallback = list(User.objects(role=User.ROLE_ANNOTATOR, is_active=True))
        memberships = [
            ProjectMembership(
                project=project,
                user=user,
                role=ProjectMembership.ROLE_ANNOTATOR,
                is_active=True,
                specialization=user.specialization,
                group_name=user.group_name,
            )
            for user in fallback
        ]

    if required_group and assignment_scope == "group_only":
        memberships = [membership for membership in memberships if membership.group_name.lower() == required_group]

    if assignment_scope == "selected_only" and allowed_ids:
        memberships = [membership for membership in memberships if str(membership.user.id) in allowed_ids]

    def open_load(user: User) -> int:
        return Assignment.objects(
            annotator=user,
            status__in=[Assignment.STATUS_ASSIGNED, Assignment.STATUS_IN_PROGRESS, Assignment.STATUS_DRAFT],
        ).count()

    sorted_memberships = sorted(
        memberships,
        key=lambda membership: (
            0 if not required_specialization or membership.specialization.lower() == required_specialization else 1,
            0 if not required_group or membership.group_name.lower() == required_group else 1,
            open_load(membership.user),
            -float(membership.user.rating or 0.0),
            membership.user.created_at,
        ),
    )

    picked: List[User] = []
    seen = set()
    for membership in sorted_memberships:
        user_id = str(membership.user.id)
        if user_id in seen:
            continue
        seen.add(user_id)
        picked.append(membership.user)
        if len(picked) >= limit:
            break
    return picked


def _workflow_settings(project: Project) -> dict:
    rules = project.participant_rules or {}
    task_batch_size = max(1, int(rules.get("task_batch_size") or DEFAULT_TASK_BATCH_SIZE))
    min_sequence_size = max(1, int(rules.get("min_sequence_size") or DEFAULT_MIN_SEQUENCE_SIZE))
    return {
        "task_batch_size": task_batch_size,
        "min_sequence_size": min_sequence_size,
    }


def _build_asset_batches(asset: ImportAsset, frames: List[FrameItem], project: Project) -> List[dict]:
    settings = _workflow_settings(project)
    task_batch_size = settings["task_batch_size"]
    min_sequence_size = settings["min_sequence_size"]
    batches: List[dict] = []
    total_batches = (len(frames) + task_batch_size - 1) // task_batch_size if frames else 0
    for batch_number, start in enumerate(range(0, len(frames), task_batch_size), start=1):
        batch_frames = frames[start : start + task_batch_size]
        batch_id = f"{asset.id}:batch:{batch_number}"
        batch_size = len(batch_frames)
        for index, frame in enumerate(batch_frames, start=1):
            batches.append(
                {
                    "frame": frame,
                    "workflow_meta": {
                        "task_batch_id": batch_id,
                        "task_batch_number": batch_number,
                        "task_batch_size": batch_size,
                        "task_batch_target_size": task_batch_size,
                        "task_batch_total": total_batches,
                        "task_batch_index": index,
                        "sequence_id": batch_id,
                        "sequence_index": index,
                        "sequence_length": batch_size,
                        "min_sequence_size": min_sequence_size,
                        "validation_ready": batch_size >= min_sequence_size,
                        "asset_id": str(asset.id),
                    },
                }
            )
    return batches


def create_work_items_for_import(import_session: ImportSession) -> Dict[str, int]:
    project = import_session.project
    processed_assets = list(ImportAsset.objects(import_session=import_session, processing_status=ImportAsset.STATUS_PROCESSED))
    frame_ids = []
    created_work_items = 0
    created_assignments = 0
    workflow_batches_total = 0
    validation_ready_items = 0
    queue_position = _next_queue_position(project)
    for asset in processed_assets:
        asset_frames = list(FrameItem.objects(project=project, asset=asset).order_by("frame_number", "created_at"))
        batch_entries = _build_asset_batches(asset, asset_frames, project)
        if batch_entries:
            workflow_batches_total += max(int(item["workflow_meta"]["task_batch_number"]) for item in batch_entries)
        for entry in batch_entries:
            frame = entry["frame"]
            workflow_meta = entry["workflow_meta"]
            work_item = WorkItem.objects(project=project, frame=frame).first()
            if not work_item:
                work_item = WorkItem(project=project, frame=frame)
                work_item.workflow_meta = workflow_meta
                work_item.validation_status = WorkItem.VALIDATION_PENDING
                ai_enabled = bool((project.participant_rules or {}).get("ai_prelabel_enabled", True))
                if ai_enabled:
                    model_name = str((project.participant_rules or {}).get("ai_model") or "baseline-box-v1")
                    confidence_threshold = float((project.participant_rules or {}).get("ai_confidence_threshold") or 0.7)
                    preannotation = generate_preannotation_for_frame(frame, model_name=model_name, confidence_threshold=confidence_threshold)
                    work_item.pre_annotations = preannotation
                    work_item.pre_annotation_model = model_name
                    work_item.pre_annotation_confidence_threshold = confidence_threshold
                    log_security_event(
                        project=project,
                        event_type=SecurityEvent.EVENT_PREANNOTATION,
                        payload={"frame_id": str(frame.id), "model": model_name, "threshold": confidence_threshold, "boxes": len(preannotation.get("boxes", []))},
                    )
                work_item.save()
                created_work_items += 1
            else:
                work_item.workflow_meta = workflow_meta
                work_item.save()
            if workflow_meta.get("validation_ready"):
                validation_ready_items += 1
            selected_annotators = select_annotators_for_project(project, project.assignments_per_task)
            existing_annotators = {str(assignment.annotator.id) for assignment in Assignment.objects(work_item=work_item)}
            next_order = Assignment.objects(work_item=work_item).count()
            for annotator in selected_annotators:
                if str(annotator.id) in existing_annotators:
                    continue
                assignment = Assignment(
                    project=project,
                    work_item=work_item,
                    annotator=annotator,
                    order_index=next_order,
                    queue_position=queue_position,
                    status=Assignment.STATUS_ASSIGNED,
                )
                assignment.save()
                created_assignments += 1
                queue_position += 1
                log_security_event(
                    project=project,
                    event_type=SecurityEvent.EVENT_ASSIGNMENT_DISTRIBUTION,
                    payload={"work_item_id": str(work_item.id), "annotator_id": str(annotator.id)},
                )
                next_order += 1
            frame_ids.append(str(frame.id))

    preview = build_import_preview(import_session)
    import_session.preview = preview
    cleanup_summary = {
        "duplicates_removed": sum(int((asset.metadata or {}).get("cleanup", {}).get("removed_duplicates", 0)) for asset in processed_assets),
        "invalid_frames_removed": sum(int((asset.metadata or {}).get("cleanup", {}).get("removed_invalid_frames", 0)) for asset in processed_assets),
        "duplicate_assets": [str(asset.id) for asset in ImportAsset.objects(import_session=import_session, processing_status=ImportAsset.STATUS_FAILED) if "Duplicate asset" in (asset.error_message or "")],
    }
    import_session.summary = {
        "work_items_created": created_work_items,
        "assignments_created": created_assignments,
        "frame_ids": frame_ids,
        "workflow_batches_total": workflow_batches_total,
        "validation_ready_items": validation_ready_items,
        "workflow_settings": _workflow_settings(project),
        "cleanup": cleanup_summary,
    }
    import_session.status = ImportSession.STATUS_FINALIZED if created_work_items or processed_assets else ImportSession.STATUS_FAILED
    import_session.save()
    return import_session.summary


def _normalize_boxes(label_data: dict) -> List[dict]:
    boxes = label_data.get("boxes", []) if isinstance(label_data, dict) else []
    normalized = []
    for raw in boxes:
        try:
            normalized.append(
                {
                    "x": float(raw["x"]),
                    "y": float(raw["y"]),
                    "width": float(raw["width"]),
                    "height": float(raw["height"]),
                    "label": str(raw["label"]),
                }
            )
        except Exception:
            continue
    return normalized


def _iou(box_a: dict, box_b: dict) -> float:
    ax1, ay1 = box_a["x"], box_a["y"]
    ax2, ay2 = ax1 + box_a["width"], ay1 + box_a["height"]
    bx1, by1 = box_b["x"], box_b["y"]
    bx2, by2 = bx1 + box_b["width"], by1 + box_b["height"]

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    if inter_x2 <= inter_x1 or inter_y2 <= inter_y1:
        return 0.0
    intersection = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
    union = box_a["width"] * box_a["height"] + box_b["width"] * box_b["height"] - intersection
    return 0.0 if union <= 0 else intersection / union


def compare_bbox_annotations(label_a: dict, label_b: dict, iou_threshold: float) -> dict:
    boxes_a = _normalize_boxes(label_a)
    boxes_b = _normalize_boxes(label_b)
    if not boxes_a and not boxes_b:
        return {"precision": 1.0, "recall": 1.0, "f1": 1.0, "matches": []}

    used_b = set()
    matches = []
    tp = 0
    for index_a, box_a in enumerate(boxes_a):
        best_match = None
        best_iou = 0.0
        for index_b, box_b in enumerate(boxes_b):
            if index_b in used_b or box_a["label"] != box_b["label"]:
                continue
            iou = _iou(box_a, box_b)
            if iou >= iou_threshold and iou > best_iou:
                best_match = index_b
                best_iou = iou
        if best_match is not None:
            used_b.add(best_match)
            tp += 1
            matches.append({"a": index_a, "b": best_match, "iou": round(best_iou, 4), "label": box_a["label"]})
    fp = max(0, len(boxes_b) - tp)
    fn = max(0, len(boxes_a) - tp)
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) else 0.0
    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "matches": matches,
        "count_a": len(boxes_a),
        "count_b": len(boxes_b),
    }


def _assignment_quality_signals(assignment: Assignment) -> dict:
    elapsed_sec = None
    if assignment.started_at and assignment.submitted_at:
        elapsed_sec = max(0.0, (assignment.submitted_at - assignment.started_at).total_seconds())
    return {
        "elapsed_sec": round(elapsed_sec, 3) if elapsed_sec is not None else None,
        "too_fast": bool(elapsed_sec is not None and elapsed_sec < 2.0),
    }


def update_user_quality(user: User, agreement: float, disputed: bool = False) -> None:
    completed = int(user.completed_assignments or 0) + 1
    current_rating = float(user.rating or 0.0)
    user.rating = round(((current_rating * (completed - 1)) + agreement) / completed, 4)
    if disputed:
        previous_conflicts = float(user.conflict_rate or 0.0) * (completed - 1)
        user.conflict_rate = round((previous_conflicts + 1.0) / completed, 4)
    else:
        previous_conflicts = float(user.conflict_rate or 0.0) * (completed - 1)
        user.conflict_rate = round(previous_conflicts / completed, 4)
    user.completed_assignments = completed
    user.save()


def evaluate_work_item(work_item: WorkItem) -> Optional[dict]:
    annotations = list(WorkAnnotation.objects(work_item=work_item, status=WorkAnnotation.STATUS_SUBMITTED))
    if len(annotations) < work_item.project.assignments_per_task:
        return None

    pair_scores: List[float] = []
    pair_metrics: List[dict] = []
    for i, annotation_a in enumerate(annotations):
        for j in range(i + 1, len(annotations)):
            annotation_b = annotations[j]
            comparison = compare_bbox_annotations(
                annotation_a.label_data,
                annotation_b.label_data,
                work_item.project.iou_threshold,
            )
            pair_scores.append(comparison["f1"])
            pair_metrics.append({"a": str(annotation_a.id), "b": str(annotation_b.id), "metrics": comparison})
    consensus_f1 = round(sum(pair_scores) / len(pair_scores), 4) if pair_scores else 0.0
    work_item.agreement_score = consensus_f1
    if consensus_f1 >= work_item.project.agreement_threshold:
        work_item.status = WorkItem.STATUS_COMPLETED
        work_item.review_required = False
        work_item.review_status = "auto_accepted"
        work_item.validation_status = WorkItem.VALIDATION_PENDING
        work_item.validation_comment = ""
        work_item.validated_by = None
        work_item.validated_at = None
        work_item.final_annotation = annotations[0].label_data
        work_item.final_source = "annotator_consensus"
        work_item.save()

        for annotation in annotations:
            annotation.status = WorkAnnotation.STATUS_ACCEPTED
            annotation.save()
            annotation.assignment.status = Assignment.STATUS_ACCEPTED
            annotation.assignment.save()
            update_user_quality(annotation.annotator, consensus_f1, disputed=False)
        _run_video_qc_for_work_item(work_item)
        return {"state": "accepted", "metrics": {"f1": consensus_f1, "pairs": pair_metrics}}
    requeued_assignments = requeue_low_agreement_work_item(work_item, annotations, consensus_f1)
    return {
        "state": "requeued",
        "metrics": {"f1": consensus_f1, "pairs": pair_metrics},
        "requeued_assignments": requeued_assignments,
    }


def requeue_low_agreement_work_item(work_item: WorkItem, annotations: List[WorkAnnotation], consensus_f1: float) -> int:
    project = work_item.project
    existing_assignments = list(Assignment.objects(work_item=work_item).order_by("order_index", "created_at"))
    submitted_by_id = {str(annotation.assignment.id): annotation for annotation in annotations}

    for assignment in existing_assignments:
        annotation = submitted_by_id.get(str(assignment.id)) or WorkAnnotation.objects(assignment=assignment).first()
        if annotation:
            annotation.status = WorkAnnotation.STATUS_REJECTED
            annotation.is_final = False
            annotation.save()
        assignment.status = Assignment.STATUS_DISPUTED
        assignment.quality_signals = {
            **(assignment.quality_signals or {}),
            "low_agreement_requeue": True,
            "consensus_f1": consensus_f1,
        }
        assignment.save()
        if annotation and annotation.annotator:
            update_user_quality(annotation.annotator, consensus_f1, disputed=True)

    work_item.status = WorkItem.STATUS_PENDING
    work_item.review_required = False
    work_item.review_status = "requeued_low_agreement"
    work_item.final_annotation = {}
    work_item.final_source = ""
    work_item.save()

    required_assignments = max(1, int(project.assignments_per_task or 1))
    queue_position = _next_queue_position(project)
    existing_annotator_ids = {str(item.annotator.id) for item in existing_assignments}
    fresh_candidates = [
        user
        for user in select_annotators_for_project(project, max(required_assignments * 3, len(existing_assignments) + required_assignments))
        if str(user.id) not in existing_annotator_ids
    ]

    created = 0
    next_order = Assignment.objects(work_item=work_item).count()
    for annotator in fresh_candidates[:required_assignments]:
        Assignment(
            project=project,
            work_item=work_item,
            annotator=annotator,
            order_index=next_order,
            queue_position=queue_position,
            status=Assignment.STATUS_ASSIGNED,
        ).save()
        created += 1
        next_order += 1
        queue_position += 1
        log_security_event(
            project=project,
            event_type=SecurityEvent.EVENT_ASSIGNMENT_DISTRIBUTION,
            payload={
                "work_item_id": str(work_item.id),
                "annotator_id": str(annotator.id),
                "reason": "low_agreement_requeue",
            },
            severity="warning",
        )

    if created < required_assignments:
        reusable_assignments = sorted(existing_assignments, key=lambda item: (item.order_index, item.created_at))
        for assignment in reusable_assignments[: required_assignments - created]:
            assignment.status = Assignment.STATUS_ASSIGNED
            assignment.started_at = None
            assignment.submitted_at = None
            assignment.queue_position = queue_position
            assignment.quality_signals = {
                **(assignment.quality_signals or {}),
                "requeue_count": int((assignment.quality_signals or {}).get("requeue_count") or 0) + 1,
            }
            assignment.save()
            queue_position += 1
            created += 1

    return created


def requeue_work_item_for_validation(work_item: WorkItem, actor: User | None = None, reason: str = "validation_needs_changes") -> int:
    project = work_item.project
    queue_position = _next_queue_position(project)
    existing_assignments = list(Assignment.objects(work_item=work_item).order_by("order_index", "created_at"))
    for assignment in existing_assignments:
        annotation = WorkAnnotation.objects(assignment=assignment).first()
        if annotation:
            annotation.status = WorkAnnotation.STATUS_REJECTED
            annotation.is_final = False
            annotation.save()
        assignment.status = Assignment.STATUS_DISPUTED
        assignment.started_at = None
        assignment.submitted_at = None
        assignment.quality_signals = {
            **(assignment.quality_signals or {}),
            "requeue_reason": reason,
        }
        assignment.save()

    work_item.status = WorkItem.STATUS_PENDING
    work_item.final_annotation = {}
    work_item.final_source = ""
    work_item.validation_status = WorkItem.VALIDATION_NEEDS_CHANGES
    work_item.validated_by = actor
    work_item.validated_at = datetime.utcnow() if actor else work_item.validated_at
    work_item.save()

    created = 0
    required_assignments = max(1, int(project.assignments_per_task or 1))
    existing_annotator_ids = {str(item.annotator.id) for item in existing_assignments}
    fresh_candidates = [
        user
        for user in select_annotators_for_project(project, max(required_assignments * 3, len(existing_assignments) + required_assignments))
        if str(user.id) not in existing_annotator_ids
    ]
    next_order = Assignment.objects(work_item=work_item).count()
    for annotator in fresh_candidates[:required_assignments]:
        Assignment(
            project=project,
            work_item=work_item,
            annotator=annotator,
            order_index=next_order,
            queue_position=queue_position,
            status=Assignment.STATUS_ASSIGNED,
        ).save()
        next_order += 1
        queue_position += 1
        created += 1
        log_security_event(
            project=project,
            actor=actor,
            event_type=SecurityEvent.EVENT_ASSIGNMENT_DISTRIBUTION,
            payload={"work_item_id": str(work_item.id), "annotator_id": str(annotator.id), "reason": reason},
            severity="warning",
        )
    if created < required_assignments:
        reusable_assignments = sorted(existing_assignments, key=lambda item: (item.order_index, item.created_at))
        for assignment in reusable_assignments[: required_assignments - created]:
            assignment.status = Assignment.STATUS_ASSIGNED
            assignment.started_at = None
            assignment.submitted_at = None
            assignment.queue_position = queue_position
            assignment.quality_signals = {
                **(assignment.quality_signals or {}),
                "requeue_reason": reason,
                "requeue_count": int((assignment.quality_signals or {}).get("requeue_count") or 0) + 1,
            }
            assignment.save()
            queue_position += 1
            created += 1
    return created


def resolve_validation_batch(project: Project, task_batch_id: str, actor: User, items: List[dict], batch_comment: str = "") -> dict:
    decisions = {str(item.get("work_item_id") or ""): item for item in items if item.get("work_item_id")}
    batch_items = _batch_work_items(project, task_batch_id)
    approved = 0
    requeued = 0
    for work_item in batch_items:
        decision = str((decisions.get(str(work_item.id), {}) or {}).get("decision") or "approve").strip().lower()
        comment = str((decisions.get(str(work_item.id), {}) or {}).get("comment") or "").strip()
        if decision == "needs_changes":
            work_item.validation_comment = comment or batch_comment
            created = requeue_work_item_for_validation(work_item, actor=actor, reason="validation_needs_changes")
            work_item.validation_comment = comment or batch_comment
            work_item.save()
            requeued += created or 1
            continue

        work_item.validation_status = WorkItem.VALIDATION_APPROVED
        work_item.validation_comment = comment or batch_comment
        work_item.validated_by = actor
        work_item.validated_at = datetime.utcnow()
        work_item.save()
        approved += 1

    return {
        "project_id": str(project.id),
        "task_batch_id": task_batch_id,
        "approved_items": approved,
        "requeued_items": requeued,
        "status": "completed" if approved == len(batch_items) else "partial_requeue",
    }


def save_assignment_annotation(assignment: Assignment, label_data: dict, comment: str, is_final: bool) -> Tuple[WorkAnnotation, Optional[dict]]:
    now = datetime.utcnow()
    if not assignment.started_at:
        assignment.started_at = now
    assignment.submitted_at = now if is_final else assignment.submitted_at
    assignment.status = Assignment.STATUS_SUBMITTED if is_final else Assignment.STATUS_DRAFT
    assignment.quality_signals = _assignment_quality_signals(assignment)
    assignment.save()

    annotation = WorkAnnotation.objects(assignment=assignment).first()
    if not annotation:
        annotation = WorkAnnotation(
            assignment=assignment,
            work_item=assignment.work_item,
            annotator=assignment.annotator,
            annotation_format="bbox",
            label_data=label_data,
        )
    annotation.label_data = label_data
    annotation.comment = comment
    annotation.is_final = is_final
    annotation.status = WorkAnnotation.STATUS_SUBMITTED if is_final else WorkAnnotation.STATUS_DRAFT
    annotation.save()

    evaluation = evaluate_work_item(assignment.work_item) if is_final else None
    return annotation, evaluation


def resolve_review(review: ReviewRecord, reviewer: User, resolution: dict) -> dict:
    golden_score = _evaluate_golden_answers(review, resolution)
    if golden_score["golden_total"] > 0 and golden_score["golden_errors"] / golden_score["golden_total"] > 0.2:
        review.golden_total = golden_score["golden_total"]
        review.golden_errors = golden_score["golden_errors"]
        review.golden_score = golden_score["golden_score"]
        review.metrics = {**(review.metrics or {}), "golden": golden_score}
        review.save()
        log_security_event(
            project=review.project,
            actor=reviewer,
            event_type=SecurityEvent.EVENT_REVIEW_RESOLVE,
            payload={"review_id": str(review.id), "golden": golden_score, "rejected": True},
            severity="warning",
        )
        return {"review_id": str(review.id), "work_item_id": str(review.work_item.id), "status": "rejected_by_golden"}

    review.reviewer = reviewer
    review.status = ReviewRecord.STATUS_RESOLVED
    review.resolution = resolution
    review.golden_total = golden_score["golden_total"]
    review.golden_errors = golden_score["golden_errors"]
    review.golden_score = golden_score["golden_score"]
    review.metrics = {**(review.metrics or {}), "golden": golden_score}
    review.resolved_at = datetime.utcnow()
    review.save()

    work_item = review.work_item
    work_item.status = WorkItem.STATUS_COMPLETED
    work_item.review_required = False
    work_item.review_status = "resolved"
    work_item.final_annotation = resolution
    work_item.final_source = "reviewer"
    work_item.save()
    _run_video_qc_for_work_item(work_item)

    annotations = list(WorkAnnotation.objects(work_item=work_item, status__in=[WorkAnnotation.STATUS_SUBMITTED, WorkAnnotation.STATUS_ACCEPTED]))
    for annotation in annotations:
        score = compare_bbox_annotations(annotation.label_data, resolution, work_item.project.iou_threshold)["f1"]
        annotation.status = WorkAnnotation.STATUS_ACCEPTED if score >= work_item.project.agreement_threshold else WorkAnnotation.STATUS_REJECTED
        annotation.save()
        annotation.assignment.status = Assignment.STATUS_ACCEPTED if annotation.status == WorkAnnotation.STATUS_ACCEPTED else Assignment.STATUS_REJECTED
        annotation.assignment.save()
        update_user_quality(annotation.annotator, score, disputed=True)
    log_security_event(
        project=review.project,
        actor=reviewer,
        event_type=SecurityEvent.EVENT_REVIEW_RESOLVE,
        payload={"review_id": str(review.id), "golden": golden_score, "resolved": True},
    )
    return {"review_id": str(review.id), "work_item_id": str(work_item.id), "status": review.status}


def _evaluate_golden_answers(review: ReviewRecord, resolution: dict) -> dict:
    golden_ids = review.golden_frame_ids or []
    if not golden_ids:
        return {"golden_total": 0, "golden_errors": 0, "golden_score": 1.0}
    golden_frames = list(GoldenFrame.objects(id__in=golden_ids, is_active=True))
    total = len(golden_frames)
    if total == 0:
        return {"golden_total": 0, "golden_errors": 0, "golden_score": 1.0}
    # Simplified validation: reviewer resolution should align with golden references on average.
    scores = [
        compare_bbox_annotations(golden.reference_annotation, resolution, review.project.iou_threshold)["f1"]
        for golden in golden_frames
    ]
    errors = sum(1 for score in scores if score < 0.8)
    passed = total - errors
    return {"golden_total": total, "golden_errors": errors, "golden_score": round(passed / total, 4)}


def _run_video_qc_for_work_item(work_item: WorkItem) -> None:
    current_frame = work_item.frame
    previous_frame = (
        FrameItem.objects(asset=current_frame.asset, frame_number__lt=current_frame.frame_number)
        .order_by("-frame_number")
        .first()
    )
    previous_item = WorkItem.objects(project=work_item.project, frame=previous_frame, status=WorkItem.STATUS_COMPLETED).first() if previous_frame else None
    payload = build_video_qc_payload(work_item, previous_item, iou_threshold=0.3)
    if payload.get("checked") and payload.get("flag_for_review"):
        payload["interpolation_candidate"] = interpolate_boxes(
            _normalize_boxes(previous_item.final_annotation) if previous_item else [],
            _normalize_boxes(work_item.final_annotation),
            alpha=0.5,
        )
    work_item.video_qc = payload
    work_item.save()
    if payload.get("checked"):
        log_security_event(
            project=work_item.project,
            event_type=SecurityEvent.EVENT_VIDEO_QC,
            payload={"work_item_id": str(work_item.id), **payload},
            severity="warning" if payload.get("flag_for_review") else "info",
        )


def project_overview(project: Project) -> dict:
    imports = list(ImportSession.objects(project=project))
    assets = list(ImportAsset.objects(project=project))
    work_items = list(WorkItem.objects(project=project))
    assignments = list(Assignment.objects(project=project))
    reviews = list(ReviewRecord.objects(project=project))
    annotator_stats = []
    for membership in ProjectMembership.objects(project=project, role=ProjectMembership.ROLE_ANNOTATOR, is_active=True):
        user_assignments = [assignment for assignment in assignments if str(assignment.annotator.id) == str(membership.user.id)]
        annotator_stats.append(
            {
                "user_id": str(membership.user.id),
                "username": getattr(membership.user, "username", ""),
                "rating": getattr(membership.user, "rating", 0.0),
                "open_assignments": sum(1 for assignment in user_assignments if assignment.status in [Assignment.STATUS_ASSIGNED, Assignment.STATUS_IN_PROGRESS, Assignment.STATUS_DRAFT]),
                "submitted_assignments": sum(1 for assignment in user_assignments if assignment.status in [Assignment.STATUS_SUBMITTED, Assignment.STATUS_ACCEPTED, Assignment.STATUS_REJECTED]),
                "conflict_rate": getattr(membership.user, "conflict_rate", 0.0),
            }
        )
    return {
        "project_id": str(project.id),
        "project": {
            "title": project.title,
            "status": project.status,
            "project_type": project.project_type,
            "annotation_type": project.annotation_type,
        },
        "imports": {
            "total": len(imports),
            "draft": sum(1 for import_session in imports if import_session.status == ImportSession.STATUS_DRAFT),
            "ready": sum(1 for import_session in imports if import_session.status == ImportSession.STATUS_READY),
            "finalized": sum(1 for import_session in imports if import_session.status == ImportSession.STATUS_FINALIZED),
            "failed": sum(1 for import_session in imports if import_session.status == ImportSession.STATUS_FAILED),
            "assets_total": len(assets),
            "assets_failed": sum(1 for asset in assets if asset.processing_status == ImportAsset.STATUS_FAILED),
            "frames_total": sum(asset.frame_count for asset in assets),
        },
        "work_items": {
            "total": len(work_items),
            "pending": sum(1 for item in work_items if item.status == WorkItem.STATUS_PENDING),
            "in_review": sum(1 for item in work_items if item.status == WorkItem.STATUS_IN_REVIEW),
            "completed": sum(1 for item in work_items if item.status == WorkItem.STATUS_COMPLETED),
            "validation_pending": sum(1 for item in work_items if item.validation_status == WorkItem.VALIDATION_PENDING),
            "validation_approved": sum(1 for item in work_items if item.validation_status == WorkItem.VALIDATION_APPROVED),
            "validation_needs_changes": sum(1 for item in work_items if item.validation_status == WorkItem.VALIDATION_NEEDS_CHANGES),
            "average_agreement": round(sum(item.agreement_score for item in work_items) / len(work_items), 4) if work_items else 0.0,
            "workflow_batches_total": len({item.workflow_meta.get("task_batch_id") for item in work_items if item.workflow_meta.get("task_batch_id")}),
            "validation_ready_items": sum(1 for item in work_items if item.workflow_meta.get("validation_ready")),
        },
        "assignments": {
            "total": len(assignments),
            "assigned": sum(1 for item in assignments if item.status == Assignment.STATUS_ASSIGNED),
            "in_progress": sum(1 for item in assignments if item.status == Assignment.STATUS_IN_PROGRESS),
            "draft": sum(1 for item in assignments if item.status == Assignment.STATUS_DRAFT),
            "submitted": sum(1 for item in assignments if item.status == Assignment.STATUS_SUBMITTED),
            "accepted": sum(1 for item in assignments if item.status == Assignment.STATUS_ACCEPTED),
            "rejected": sum(1 for item in assignments if item.status == Assignment.STATUS_REJECTED),
            "disputed": sum(1 for item in assignments if item.status == Assignment.STATUS_DISPUTED),
        },
        "reviews": {
            "pending": sum(1 for review in reviews if review.status == ReviewRecord.STATUS_PENDING),
            "resolved": sum(1 for review in reviews if review.status == ReviewRecord.STATUS_RESOLVED),
            "golden_average": round(sum(float(review.golden_score or 0.0) for review in reviews) / len(reviews), 4) if reviews else 0.0,
        },
        "annotators": annotator_stats,
    }


def _quality_report(project: Project, work_items: List[WorkItem], assignments: List[Assignment], reviews: List[ReviewRecord]) -> dict:
    completed = [item for item in work_items if item.status == WorkItem.STATUS_COMPLETED]
    pending_review = [item for item in work_items if item.status == WorkItem.STATUS_IN_REVIEW]
    rejected = [item for item in work_items if item.review_required and item.status != WorkItem.STATUS_COMPLETED]
    agreement_values = [item.agreement_score for item in completed if item.agreement_score is not None]
    total = len(work_items)
    return {
        "project_id": str(project.id),
        "work_items_total": total,
        "work_items_completed": len(completed),
        "work_items_in_review": len(pending_review),
        "work_items_rejected_or_flagged": len(rejected),
        "validation": {
            "pending": sum(1 for item in work_items if item.validation_status == WorkItem.VALIDATION_PENDING),
            "approved": sum(1 for item in work_items if item.validation_status == WorkItem.VALIDATION_APPROVED),
            "needs_changes": sum(1 for item in work_items if item.validation_status == WorkItem.VALIDATION_NEEDS_CHANGES),
        },
        "completion_rate": round((len(completed) / total), 4) if total else 0.0,
        "average_agreement": round(sum(agreement_values) / len(agreement_values), 4) if agreement_values else 0.0,
        "assignments": {
            "total": len(assignments),
            "accepted": sum(1 for item in assignments if item.status == Assignment.STATUS_ACCEPTED),
            "rejected": sum(1 for item in assignments if item.status == Assignment.STATUS_REJECTED),
            "submitted": sum(1 for item in assignments if item.status == Assignment.STATUS_SUBMITTED),
        },
        "reviews": {
            "pending": sum(1 for review in reviews if review.status == ReviewRecord.STATUS_PENDING),
            "resolved": sum(1 for review in reviews if review.status == ReviewRecord.STATUS_RESOLVED),
        },
    }


def _build_coco_export(project: Project, completed_items: List[WorkItem]) -> dict:
    categories = []
    category_lookup = {}
    for index, label in enumerate(project.label_schema or [], start=1):
        name = label.get("name") or label.get("label") or f"label_{index}"
        category_lookup[name] = index
        categories.append({"id": index, "name": name})

    images = []
    annotations = []
    manifest_items = []
    annotation_id = 1
    for work_item in completed_items:
        frame = work_item.frame
        image_id = str(frame.id)
        images.append(
            {
                "id": image_id,
                "file_name": frame.frame_uri,
                "width": frame.width,
                "height": frame.height,
                "frame_number": frame.frame_number,
                "timestamp_sec": frame.timestamp_sec,
            }
        )
        boxes = _normalize_boxes(work_item.final_annotation)
        for box in boxes:
            category_id = category_lookup.get(box["label"])
            if not category_id:
                category_id = len(category_lookup) + 1
                category_lookup[box["label"]] = category_id
                categories.append({"id": category_id, "name": box["label"]})
            annotations.append(
                {
                    "id": annotation_id,
                    "image_id": image_id,
                    "category_id": category_id,
                    "bbox": [box["x"], box["y"], box["width"], box["height"]],
                    "area": box["width"] * box["height"],
                    "iscrowd": 0,
                }
            )
            annotation_id += 1
        manifest_items.append(
            {
                "work_item_id": str(work_item.id),
                "frame_uri": frame.frame_uri,
                "source_asset_id": str(frame.asset.id),
                "agreement_score": work_item.agreement_score,
                "review_status": work_item.review_status,
                "final_source": work_item.final_source,
                "validation_status": work_item.validation_status,
            }
        )
    return {"manifest": manifest_items, "coco": {"images": images, "annotations": annotations, "categories": categories}}


def _build_yolo_export(project: Project, completed_items: List[WorkItem]) -> dict:
    category_lookup: Dict[str, int] = {}
    for index, label in enumerate(project.label_schema or []):
        name = str(label.get("name") or label.get("label") or f"label_{index}").strip()
        if name and name not in category_lookup:
            category_lookup[name] = len(category_lookup)
    labels_txt = [name for name, _idx in sorted(category_lookup.items(), key=lambda item: item[1])]
    records: List[dict] = []
    for work_item in completed_items:
        frame = work_item.frame
        image_width = max(float(frame.width or 0), 1.0)
        image_height = max(float(frame.height or 0), 1.0)
        yolo_lines: List[str] = []
        for box in _normalize_boxes(work_item.final_annotation):
            label = box["label"]
            if label not in category_lookup:
                category_lookup[label] = len(category_lookup)
                labels_txt.append(label)
            class_id = category_lookup[label]
            x_center = (box["x"] + box["width"] / 2.0) / image_width
            y_center = (box["y"] + box["height"] / 2.0) / image_height
            width = box["width"] / image_width
            height = box["height"] / image_height
            yolo_lines.append(f"{class_id} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}")
        records.append(
            {
                "frame_uri": frame.frame_uri,
                "label_file": f"labels/{str(frame.id)}.txt",
                "lines": yolo_lines,
            }
        )
    return {
        "labels": labels_txt,
        "data_yaml": {
            "path": f"project_{project.id}",
            "train": "images/train",
            "val": "images/val",
            "names": labels_txt,
        },
        "records": records,
    }


def build_dataset_export(project: Project, export_format: str = "both") -> dict:
    completed_items = list(WorkItem.objects(project=project, status=WorkItem.STATUS_COMPLETED))
    assignments = list(Assignment.objects(project=project))
    reviews = list(ReviewRecord.objects(project=project))
    payload = {
        "project": {
            "id": str(project.id),
            "title": project.title,
            "annotation_type": project.annotation_type,
            "export_format": export_format,
        },
        "quality_report": _quality_report(project, completed_items, assignments, reviews),
    }
    if export_format in {"coco", "both"}:
        payload.update(_build_coco_export(project, completed_items))
    if export_format in {"yolo", "both"}:
        payload["yolo"] = _build_yolo_export(project, completed_items)
    return payload


def build_dataset_export_archive(project: Project, export_format: str = "both") -> tuple[str, bytes]:
    payload = build_dataset_export(project, export_format=export_format)
    archive_stream = io.BytesIO()
    with zipfile.ZipFile(archive_stream, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        quality_report = payload.get("quality_report", {})
        bundle.writestr("quality_report.json", json.dumps(quality_report, ensure_ascii=False, indent=2))
        if "coco" in payload:
            bundle.writestr("annotations/coco.json", json.dumps(payload["coco"], ensure_ascii=False, indent=2))
        if "yolo" in payload:
            yolo = payload["yolo"]
            bundle.writestr("annotations/yolo/data.yaml", json.dumps(yolo.get("data_yaml", {}), ensure_ascii=False, indent=2))
            for record in yolo.get("records", []):
                bundle.writestr(f"annotations/yolo/{record['label_file']}", "\n".join(record.get("lines", [])))
        for item in payload.get("manifest", []):
            frame_uri = item.get("frame_uri")
            if not frame_uri:
                continue
            try:
                path = absolute_media_path(frame_uri)
                with open(path, "rb") as source:
                    target_name = f"images/train/{path.name}"
                    bundle.writestr(target_name, source.read())
            except Exception:
                continue
    archive_name = f"project_{project.id}_{export_format}.zip"
    return archive_name, archive_stream.getvalue()


def build_coco_export(project: Project) -> dict:
    return build_dataset_export(project, export_format="coco")
