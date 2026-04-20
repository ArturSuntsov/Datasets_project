from __future__ import annotations

from datetime import datetime
from typing import Dict, Iterable, List, Optional, Tuple

from mongoengine import Q

from apps.projects.models import Project, ProjectMembership
from apps.users.models import User
from ..models import Assignment, FrameItem, ImportAsset, ImportSession, ReviewRecord, WorkAnnotation, WorkItem
from .frames import FrameExtractionError, extract_video_frames
from .upload import image_dimensions


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
            asset.metadata = {"frame_interval_sec": interval_sec}
        asset.processing_status = ImportAsset.STATUS_PROCESSED
        asset.error_message = ""
    except Exception as exc:
        asset.processing_status = ImportAsset.STATUS_FAILED
        asset.error_message = str(exc)
        asset.frame_count = 0
    asset.save()
    return asset


def select_annotators_for_project(project: Project, limit: int) -> List[User]:
    membership_qs = ProjectMembership.objects(project=project, role=ProjectMembership.ROLE_ANNOTATOR, is_active=True)
    memberships = list(membership_qs)
    if not memberships:
        fallback = list(User.objects(role=User.ROLE_ANNOTATOR, is_active=True))
        memberships = [
            ProjectMembership(project=project, user=user, role=ProjectMembership.ROLE_ANNOTATOR, is_active=True, specialization=user.specialization, group_name=user.group_name)
            for user in fallback
        ]

    rules = project.participant_rules or {}
    required_specialization = (rules.get("specialization") or "").strip().lower()
    required_group = (rules.get("group") or "").strip().lower()

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


def create_work_items_for_import(import_session: ImportSession) -> Dict[str, int]:
    project = import_session.project
    processed_assets = list(ImportAsset.objects(import_session=import_session, processing_status=ImportAsset.STATUS_PROCESSED))
    frame_ids = []
    created_work_items = 0
    created_assignments = 0
    for asset in processed_assets:
        for frame in FrameItem.objects(project=project, asset=asset):
            work_item = WorkItem.objects(project=project, frame=frame).first()
            if not work_item:
                work_item = WorkItem(project=project, frame=frame)
                work_item.save()
                created_work_items += 1
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
                    status=Assignment.STATUS_ASSIGNED,
                )
                assignment.save()
                created_assignments += 1
                next_order += 1
            frame_ids.append(str(frame.id))

    preview = build_import_preview(import_session)
    import_session.preview = preview
    import_session.summary = {
        "work_items_created": created_work_items,
        "assignments_created": created_assignments,
        "frame_ids": frame_ids,
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

    comparison = compare_bbox_annotations(
        annotations[0].label_data,
        annotations[1].label_data,
        work_item.project.iou_threshold,
    )
    work_item.agreement_score = comparison["f1"]
    if comparison["f1"] >= work_item.project.agreement_threshold:
        work_item.status = WorkItem.STATUS_COMPLETED
        work_item.review_required = False
        work_item.review_status = "auto_accepted"
        work_item.final_annotation = annotations[0].label_data
        work_item.final_source = "annotator_consensus"
        work_item.save()

        for annotation in annotations:
            annotation.status = WorkAnnotation.STATUS_ACCEPTED
            annotation.save()
            annotation.assignment.status = Assignment.STATUS_ACCEPTED
            annotation.assignment.save()
            update_user_quality(annotation.annotator, comparison["f1"], disputed=False)
        return {"state": "accepted", "metrics": comparison}

    review = ReviewRecord.objects(work_item=work_item).first()
    if not review:
        review = ReviewRecord(project=work_item.project, work_item=work_item)
    review.status = ReviewRecord.STATUS_PENDING
    review.agreement_score = comparison["f1"]
    review.metrics = comparison
    review.dispute_reason = "Low agreement between annotators"
    review.save()

    work_item.status = WorkItem.STATUS_IN_REVIEW
    work_item.review_required = True
    work_item.review_status = "pending"
    work_item.save()

    for annotation in annotations:
        annotation.assignment.status = Assignment.STATUS_SUBMITTED
        annotation.assignment.save()
        update_user_quality(annotation.annotator, comparison["f1"], disputed=True)
    return {"state": "review", "metrics": comparison, "review_id": str(review.id)}


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
    review.reviewer = reviewer
    review.status = ReviewRecord.STATUS_RESOLVED
    review.resolution = resolution
    review.resolved_at = datetime.utcnow()
    review.save()

    work_item = review.work_item
    work_item.status = WorkItem.STATUS_COMPLETED
    work_item.review_required = False
    work_item.review_status = "resolved"
    work_item.final_annotation = resolution
    work_item.final_source = "reviewer"
    work_item.save()

    annotations = list(WorkAnnotation.objects(work_item=work_item, status__in=[WorkAnnotation.STATUS_SUBMITTED, WorkAnnotation.STATUS_ACCEPTED]))
    for annotation in annotations:
        score = compare_bbox_annotations(annotation.label_data, resolution, work_item.project.iou_threshold)["f1"]
        annotation.status = WorkAnnotation.STATUS_ACCEPTED if score >= work_item.project.agreement_threshold else WorkAnnotation.STATUS_REJECTED
        annotation.save()
        annotation.assignment.status = Assignment.STATUS_ACCEPTED if annotation.status == WorkAnnotation.STATUS_ACCEPTED else Assignment.STATUS_REJECTED
        annotation.assignment.save()
        update_user_quality(annotation.annotator, score, disputed=True)
    return {"review_id": str(review.id), "work_item_id": str(work_item.id), "status": review.status}


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
                "username": membership.user.username,
                "rating": membership.user.rating,
                "open_assignments": sum(1 for assignment in user_assignments if assignment.status in [Assignment.STATUS_ASSIGNED, Assignment.STATUS_IN_PROGRESS, Assignment.STATUS_DRAFT]),
                "submitted_assignments": sum(1 for assignment in user_assignments if assignment.status in [Assignment.STATUS_SUBMITTED, Assignment.STATUS_ACCEPTED, Assignment.STATUS_REJECTED]),
                "conflict_rate": membership.user.conflict_rate,
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
            "average_agreement": round(sum(item.agreement_score for item in work_items) / len(work_items), 4) if work_items else 0.0,
        },
        "assignments": {
            "total": len(assignments),
            "assigned": sum(1 for item in assignments if item.status == Assignment.STATUS_ASSIGNED),
            "in_progress": sum(1 for item in assignments if item.status == Assignment.STATUS_IN_PROGRESS),
            "draft": sum(1 for item in assignments if item.status == Assignment.STATUS_DRAFT),
            "submitted": sum(1 for item in assignments if item.status == Assignment.STATUS_SUBMITTED),
            "accepted": sum(1 for item in assignments if item.status == Assignment.STATUS_ACCEPTED),
            "rejected": sum(1 for item in assignments if item.status == Assignment.STATUS_REJECTED),
        },
        "reviews": {
            "pending": sum(1 for review in reviews if review.status == ReviewRecord.STATUS_PENDING),
            "resolved": sum(1 for review in reviews if review.status == ReviewRecord.STATUS_RESOLVED),
        },
        "annotators": annotator_stats,
    }


def build_coco_export(project: Project) -> dict:
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
    for work_item in WorkItem.objects(project=project, status=WorkItem.STATUS_COMPLETED):
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
            }
        )
    return {
        "project": {
            "id": str(project.id),
            "title": project.title,
            "annotation_type": project.annotation_type,
        },
        "manifest": manifest_items,
        "coco": {
            "images": images,
            "annotations": annotations,
            "categories": categories,
        },
    }
