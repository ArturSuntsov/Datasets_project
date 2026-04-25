from __future__ import annotations

from typing import Dict

from ..models import WorkItem


def _normalize_boxes(label_data: dict) -> list[dict]:
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


def build_video_qc_payload(current_item: WorkItem, previous_item: WorkItem | None, iou_threshold: float) -> Dict[str, object]:
    if not previous_item:
        return {"checked": False, "reason": "no_previous_frame"}
    current_boxes = _normalize_boxes(current_item.final_annotation)
    previous_boxes = _normalize_boxes(previous_item.final_annotation)
    if not current_boxes or not previous_boxes:
        return {"checked": False, "reason": "empty_annotations"}
    projected_best_iou = 0.0
    for current_box in current_boxes:
        for previous_box in previous_boxes:
            if current_box["label"] != previous_box["label"]:
                continue
            projected_best_iou = max(projected_best_iou, _iou(current_box, previous_box))
    flag_for_review = projected_best_iou < iou_threshold
    return {
        "checked": True,
        "projected_iou": round(projected_best_iou, 4),
        "threshold": iou_threshold,
        "flag_for_review": flag_for_review,
    }


def interpolate_boxes(start_boxes: list[dict], end_boxes: list[dict], alpha: float) -> list[dict]:
    interpolated: list[dict] = []
    for start_box, end_box in zip(start_boxes, end_boxes):
        if start_box.get("label") != end_box.get("label"):
            continue
        interpolated.append(
            {
                "x": round((1 - alpha) * float(start_box["x"]) + alpha * float(end_box["x"]), 2),
                "y": round((1 - alpha) * float(start_box["y"]) + alpha * float(end_box["y"]), 2),
                "width": round((1 - alpha) * float(start_box["width"]) + alpha * float(end_box["width"]), 2),
                "height": round((1 - alpha) * float(start_box["height"]) + alpha * float(end_box["height"]), 2),
                "label": str(start_box["label"]),
                "interpolated": True,
            }
        )
    return interpolated
