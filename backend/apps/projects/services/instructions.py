from __future__ import annotations

from datetime import datetime
from typing import Any

from apps.projects.models import InstructionAcknowledgement, Project, ProjectInstructionAsset
from apps.users.models import User


def instruction_asset_payload(asset: ProjectInstructionAsset) -> dict[str, Any]:
    return {
        "id": str(asset.id),
        "asset_type": asset.asset_type,
        "title": asset.title,
        "body": asset.body,
        "url": asset.url,
        "file_uri": asset.file_uri,
        "file_name": asset.file_name,
        "mime_type": asset.mime_type,
        "file_size": int(asset.file_size or 0),
        "label_data": asset.label_data or {},
        "metadata": asset.metadata or {},
        "created_by_id": str(asset.created_by.id) if asset.created_by else None,
        "created_at": asset.created_at,
        "updated_at": asset.updated_at,
    }


def latest_acknowledgement(project: Project, user: User | None) -> InstructionAcknowledgement | None:
    if not user:
        return None
    return InstructionAcknowledgement.objects(project=project, user=user).order_by("-acknowledged_at").first()


def _normalize_boxes(annotation: dict[str, Any] | None) -> list[dict[str, Any]]:
    raw_boxes = (annotation or {}).get("boxes") or []
    if not isinstance(raw_boxes, list):
        return []
    boxes: list[dict[str, Any]] = []
    for raw in raw_boxes:
        if not isinstance(raw, dict):
            continue
        try:
            boxes.append(
                {
                    "x": float(raw.get("x") or 0),
                    "y": float(raw.get("y") or 0),
                    "width": float(raw.get("width") or 0),
                    "height": float(raw.get("height") or 0),
                    "label": str(raw.get("label") or "object"),
                }
            )
        except (TypeError, ValueError):
            continue
    return boxes


def _golden_instruction_assets(project: Project) -> list[dict[str, Any]]:
    try:
        from apps.cv_annotation.models import GoldenFrame
    except Exception:
        return []

    assets: list[dict[str, Any]] = []
    golden_items = GoldenFrame.objects(
        project=project,
        status=GoldenFrame.STATUS_ACTIVE,
        usage__in=[GoldenFrame.USAGE_INSTRUCTION, GoldenFrame.USAGE_BOTH],
    ).order_by("case_type", "-candidate_score", "-created_at")
    for golden in golden_items:
        frame = golden.frame
        is_bad = golden.case_type == GoldenFrame.CASE_NEGATIVE
        asset_type = ProjectInstructionAsset.TYPE_BAD_EXAMPLE if is_bad else ProjectInstructionAsset.TYPE_GOOD_EXAMPLE
        title_prefix = "Плохой пример" if is_bad else "Хороший пример"
        assets.append(
            {
                "id": f"golden-{golden.id}",
                "asset_type": asset_type,
                "title": f"{title_prefix}: кадр {frame.frame_number}",
                "body": golden.review_notes or golden.issue_type or "",
                "url": "",
                "file_uri": frame.frame_uri,
                "file_name": "",
                "mime_type": "image/*",
                "file_size": 0,
                "label_data": {
                    "boxes": _normalize_boxes(golden.reference_annotation),
                    "width": int(frame.width or 0),
                    "height": int(frame.height or 0),
                    "expected_decision": golden.expected_decision or ("needs_changes" if is_bad else "approve"),
                    "issue_type": golden.issue_type or "",
                },
                "metadata": {
                    "golden_frame_id": str(golden.id),
                    "case_type": golden.case_type,
                    "usage": golden.usage,
                    "virtual": True,
                },
                "created_by_id": str(golden.promoted_by.id) if golden.promoted_by else None,
                "created_at": golden.created_at,
                "updated_at": golden.updated_at,
            }
        )
    return assets


def instruction_bundle(project: Project, user: User | None = None) -> dict[str, Any]:
    assets = list(ProjectInstructionAsset.objects(project=project).order_by("asset_type", "created_at"))
    acknowledgement = latest_acknowledgement(project, user)
    version = int(getattr(project, "instructions_version", 0) or 0)
    legacy_file = None
    if getattr(project, "instructions_file_uri", ""):
        legacy_file = {
            "id": "legacy-file",
            "asset_type": ProjectInstructionAsset.TYPE_INSTRUCTION,
            "title": getattr(project, "instructions_file_name", "") or "Instruction file",
            "body": "",
            "url": "",
            "file_uri": project.instructions_file_uri,
            "file_name": project.instructions_file_name,
            "mime_type": "",
            "file_size": 0,
            "label_data": {},
            "metadata": {"legacy": True},
            "created_by_id": None,
            "created_at": project.instructions_updated_at,
            "updated_at": project.instructions_updated_at,
        }

    asset_payloads = [instruction_asset_payload(asset) for asset in assets]
    if legacy_file:
        asset_payloads.insert(0, legacy_file)
    asset_payloads.extend(_golden_instruction_assets(project))

    acknowledged_version = int(acknowledgement.instructions_version or 0) if acknowledgement else -1
    return {
        "project_id": str(project.id),
        "instructions": project.instructions or "",
        "instructions_version": version,
        "instructions_updated_at": getattr(project, "instructions_updated_at", None),
        "assets": asset_payloads,
        "acknowledgement": {
            "acknowledged": bool(acknowledgement and acknowledged_version >= version),
            "instructions_version": acknowledged_version if acknowledgement else None,
            "acknowledged_at": acknowledgement.acknowledged_at if acknowledgement else None,
        },
    }


def touch_instruction_version(project: Project) -> None:
    project.instructions_version = int(getattr(project, "instructions_version", 0) or 0) + 1
    project.instructions_updated_at = datetime.utcnow()
    project.save()


def acknowledge_instructions(project: Project, user: User) -> InstructionAcknowledgement:
    acknowledgement = InstructionAcknowledgement(
        project=project,
        user=user,
        instructions_version=int(getattr(project, "instructions_version", 0) or 0),
        acknowledged_at=datetime.utcnow(),
    )
    acknowledgement.save()
    return acknowledgement
