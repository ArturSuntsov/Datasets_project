"""
IoU-based matching для оценки качества CV-разметки (bounding box).

Используется greedy matching algorithm:
1. Вычисляем IoU между всеми предсказанными и истинными bbox
2. Сортируем по убыванию IoU
3. Сопоставляем жадным алгоритмом
4. Считаем Precision / Recall / F1
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple


def compute_iou(box_a: Dict[str, float], box_b: Dict[str, float]) -> float:
    """
    Вычисляет Intersection over Union (IoU) между двумя bounding box.

    Каждый box — словарь с ключами: x, y, width, height.

    Returns:
        IoU в диапазоне [0, 1].
    """
    x1_a = box_a.get("x", 0)
    y1_a = box_a.get("y", 0)
    w_a = box_a.get("width", 0)
    h_a = box_a.get("height", 0)

    x1_b = box_b.get("x", 0)
    y1_b = box_b.get("y", 0)
    w_b = box_b.get("width", 0)
    h_b = box_b.get("height", 0)

    if w_a <= 0 or h_a <= 0 or w_b <= 0 or h_b <= 0:
        return 0.0

    x2_a = x1_a + w_a
    y2_a = y1_a + h_a
    x2_b = x1_b + w_b
    y2_b = y1_b + h_b

    inter_x1 = max(x1_a, x1_b)
    inter_y1 = max(y1_a, y1_b)
    inter_x2 = min(x2_a, x2_b)
    inter_y2 = min(y2_a, y2_b)

    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    area_a = w_a * h_a
    area_b = w_b * h_b
    union_area = area_a + area_b - inter_area

    if union_area <= 0:
        return 0.0

    return inter_area / union_area


def greedy_iou_matching(
    pred_boxes: List[Dict[str, Any]],
    true_boxes: List[Dict[str, Any]],
    iou_threshold: float = 0.5,
) -> Dict[str, Any]:
    """
    Жадный алгоритм сопоставления bounding box'ов.

    Args:
        pred_boxes: предсказанные bbox (от аннотатора)
        true_boxes: истинные bbox (от другого аннотатора / консенсуса)
        iou_threshold: порог IoU для считания совпадением

    Returns:
        {
            "tp": int,          # True Positives
            "fp": int,          # False Positives
            "fn": int,          # False Negatives
            "matches": [...],   # Список сопоставлений
            "precision": float,
            "recall": float,
            "f1": float,
        }
    """
    if not pred_boxes and not true_boxes:
        return {
            "tp": 0, "fp": 0, "fn": 0,
            "matches": [],
            "precision": 1.0, "recall": 1.0, "f1": 1.0,
        }

    if not pred_boxes:
        return {
            "tp": 0, "fp": 0, "fn": len(true_boxes),
            "matches": [],
            "precision": 0.0, "recall": 0.0, "f1": 0.0,
        }

    if not true_boxes:
        return {
            "tp": 0, "fp": len(pred_boxes), "fn": 0,
            "matches": [],
            "precision": 0.0, "recall": 1.0, "f1": 0.0,
        }

    # Строим матрицу IoU (все × все)
    iou_matrix: List[Tuple[float, int, int]] = []
    for i, pred in enumerate(pred_boxes):
        for j, true in enumerate(true_boxes):
            iou = compute_iou(
                {"x": pred.get("x", 0), "y": pred.get("y", 0),
                 "width": pred.get("width", 0), "height": pred.get("height", 0)},
                {"x": true.get("x", 0), "y": true.get("y", 0),
                 "width": true.get("width", 0), "height": true.get("height", 0)},
            )
            if iou > 0:
                iou_matrix.append((iou, i, j))

    # Сортируем по убыванию IoU
    iou_matrix.sort(key=lambda x: x[0], reverse=True)

    matched_pred: set = set()
    matched_true: set = set()
    matches: List[Dict[str, Any]] = []

    for iou, i, j in iou_matrix:
        if iou < iou_threshold:
            break
        if i not in matched_pred and j not in matched_true:
            matched_pred.add(i)
            matched_true.add(j)
            matches.append({
                "pred_index": i,
                "true_index": j,
                "iou": round(iou, 4),
            })

    tp = len(matches)
    fp = len(pred_boxes) - tp
    fn = len(true_boxes) - tp

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "matches": matches,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
    }
