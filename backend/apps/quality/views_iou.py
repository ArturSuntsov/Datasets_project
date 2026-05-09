"""
Эндпоинт для быстрой проверки IoU между аннотациями одного кадра.
Принимает work_item_id, находит все аннотации, считает IoU.
"""
from __future__ import annotations

from bson import ObjectId
from rest_framework.decorators import api_view, permission_classes
from rest_framework import permissions, status
from rest_framework.response import Response

from ..users.views import authenticate_from_jwt
from ..cv_annotation.models import WorkAnnotation
from .services.iou_matching import greedy_iou_matching


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def check_iou_view(request):
    """
    POST /api/quality/check-iou/
    Body: {"work_item_id": "69fedc564f34d0b36a7bfb2c"}
    
    Возвращает IoU-метрики для всех пар аннотаций одного кадра.
    """
    try:
        user = authenticate_from_jwt(request)
    except PermissionError:
        return Response({"detail": "Unauthorized"}, status=401)

    work_item_id = request.data.get("work_item_id")
    if not work_item_id or not ObjectId.is_valid(work_item_id):
        return Response({"detail": "Invalid work_item_id"}, status=400)

    # Находим все аннотации для этого кадра
    annotations = list(
        WorkAnnotation.objects(work_item=ObjectId(work_item_id)).order_by("created_at")
    )

    if len(annotations) < 2:
        return Response(
            {
                "detail": f"Нужно минимум 2 аннотации, найдено {len(annotations)}",
                "annotations_count": len(annotations),
            },
            status=400,
        )

    # Собираем данные
    results = []
    all_boxes = []

    for ann in annotations:
        boxes = ann.label_data.get("boxes", [])
        all_boxes.append(boxes)
        results.append(
            {
                "annotation_id": str(ann.id),
                "annotator_id": str(ann.annotator.id),
                "annotator_username": ann.annotator.username,
                "boxes_count": len(boxes),
                "boxes": [
                    {
                        "x": b.get("x", 0),
                        "y": b.get("y", 0),
                        "width": b.get("width", 0),
                        "height": b.get("height", 0),
                        "label": b.get("label", ""),
                    }
                    for b in boxes
                ],
            }
        )

    # Попарное сравнение
    pairwise_results = []
    total_iou = 0
    total_pairs = 0

    for i in range(len(all_boxes)):
        for j in range(i + 1, len(all_boxes)):
            if all_boxes[i] and all_boxes[j]:
                match_result = greedy_iou_matching(
                    all_boxes[i], all_boxes[j], iou_threshold=0.5
                )
                avg_iou = (
                    sum(m["iou"] for m in match_result["matches"]) / len(match_result["matches"])
                    if match_result["matches"]
                    else 0.0
                )
                total_iou += avg_iou
                total_pairs += 1

                pairwise_results.append(
                    {
                        "annotator_a": results[i]["annotator_username"],
                        "annotator_b": results[j]["annotator_username"],
                        "iou": round(avg_iou, 4),
                        "f1": match_result["f1"],
                        "precision": match_result["precision"],
                        "recall": match_result["recall"],
                        "tp": match_result["tp"],
                        "fp": match_result["fp"],
                        "fn": match_result["fn"],
                        "matches": match_result["matches"],
                        "status": "MATCH" if match_result["f1"] >= 0.5 else "MISMATCH",
                    }
                )

    avg_iou_all = round(total_iou / total_pairs, 4) if total_pairs > 0 else 0.0

    return Response(
        {
            "work_item_id": work_item_id,
            "annotations_count": len(annotations),
            "annotations": results,
            "pairwise_comparisons": pairwise_results,
            "average_iou": avg_iou_all,
            "threshold": 0.5,
            "verdict": "MATCH" if avg_iou_all >= 0.5 else "MISMATCH",
        }
    )
