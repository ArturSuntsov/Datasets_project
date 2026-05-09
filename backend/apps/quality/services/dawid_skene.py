"""
Dawid-Skene EM Algorithm for multi-annotator quality assessment.

Оценивает одновременно:
- Истинную метку каждого задания (без эталона)
- Confusion matrix каждого аннотатора (какие классы путает)
- Accuracy каждого аннотатора (доля правильных ответов)

Используется для:
- Cross-checking с 2+ аннотаторами
- Объективной оценки качества разметки
- Построения рейтинга исполнителей
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple
from collections import defaultdict
import math


# Порог сходимости: если изменения меньше этого — останавливаемся
CONVERGENCE_THRESHOLD = 0.001

# Максимальное число итераций (страховка от бесконечного цикла)
MAX_ITERATIONS = 20

# Минимальное число итераций (даже если сошлось раньше — для стабильности)
MIN_ITERATIONS = 5


def extract_class_label(label_data: Dict[str, Any], annotation_format: str) -> str:
    """
    Извлекает классовую метку из label_data в зависимости от формата.

    Для NER и bbox это не категориальная метка, поэтому Dawid-Skene
    в чистом виде неприменим. Для таких форматов используется
    отдельный matching algorithm (iou_matching.py).
    """
    if annotation_format == "classification_v1":
        return str(label_data.get("class_label", ""))
    if annotation_format == "ner_v1":
        spans = label_data.get("spans", [])
        if not spans:
            return "__EMPTY__"
        return "__NER__"  # для NER Dawid-Skene не используется
    if annotation_format == "generic_v1":
        return str(hash(str(label_data)))  # хеш словаря как «метка»
    return str(label_data)


def build_label_set(
    annotations: List[Dict[str, Any]],
    annotation_format: str,
) -> Set[str]:
    """
    Строит множество всех возможных меток из аннотаций.
    """
    labels: Set[str] = set()
    for ann in annotations:
        label = extract_class_label(ann.get("label_data", {}), annotation_format)
        if label and label != "__NER__":
            labels.add(label)
    if not labels:
        labels.add("__UNKNOWN__")
    return labels


def initialize_confusion_matrices(
    annotator_ids: List[str],
    label_set: Set[str],
) -> Dict[str, Dict[str, Dict[str, float]]]:
    """
    Инициализирует confusion matrix для каждого аннотатора.

    На старте предполагаем, что аннотатор:
    - в 80% случаев отвечает правильно (диагональ)
    - в 20% распределяет ошибки равномерно по остальным классам
    """
    labels = sorted(label_set)
    n = len(labels)
    matrices: Dict[str, Dict[str, Dict[str, float]]] = {}

    for ann_id in annotator_ids:
        matrix: Dict[str, Dict[str, float]] = {}
        for true_label in labels:
            matrix[true_label] = {}
            for obs_label in labels:
                if true_label == obs_label:
                    matrix[true_label][obs_label] = 0.8
                else:
                    matrix[true_label][obs_label] = 0.2 / max(n - 1, 1)
        matrices[ann_id] = matrix

    return matrices


def dawid_skene_em(
    annotations: List[Dict[str, Any]],
    annotation_format: str,
    max_iterations: int = MAX_ITERATIONS,
    min_iterations: int = MIN_ITERATIONS,
    convergence: float = CONVERGENCE_THRESHOLD,
) -> Dict[str, Any]:
    """
    Основной EM-алгоритм Dawid-Skene.

    Args:
        annotations: список аннотаций вида:
            [
                {
                    "annotator_id": "...",
                    "label_data": {...},
                },
                ...
            ]
        annotation_format: формат разметки (classification_v1, ner_v1, ...)
        max_iterations: максимальное число итераций
        min_iterations: минимальное число итераций
        convergence: порог сходимости

    Returns:
        {
            "true_labels": {task_id: {"label": ..., "confidence": ...}},
            "annotator_quality": {
                annotator_id: {
                    "accuracy": float,
                    "confusion_matrix": {true_label: {obs_label: prob}},
                    "error_rate": float,
                }
            },
            "iterations": int,
            "converged": bool,
        }
    """
    # Извлекаем annotator_ids
    annotator_ids = list(dict.fromkeys(
        ann.get("annotator_id", "unknown") for ann in annotations
    ))

    # Строим множество меток
    label_set = build_label_set(annotations, annotation_format)
    labels = sorted(label_set)

    # Инициализируем confusion matrix
    matrices = initialize_confusion_matrices(annotator_ids, label_set)

    # Приоры: равномерное распределение по классам
    priors = {label: 1.0 / len(labels) for label in labels}

    # Для хранения вероятностей истинных меток
    true_label_probs: Dict[int, Dict[str, float]] = {}
    # task_id → {label: probability}

    converged = False

    for iteration in range(max_iterations):
        # ===== E-шаг: оцениваем вероятности истинных меток =====
        new_probs: Dict[int, Dict[str, float]] = {}

        for i, ann in enumerate(annotations):
            obs_label = extract_class_label(ann.get("label_data", {}), annotation_format)
            if obs_label == "__NER__":
                continue
            ann_id = ann.get("annotator_id", "unknown")
            matrix = matrices.get(ann_id)

            probs: Dict[str, float] = {}
            total = 0.0

            for true_label in labels:
                prior = priors.get(true_label, 1.0 / len(labels))
                likelihood = matrix.get(true_label, {}).get(obs_label, 0.01) if matrix else 0.01
                probs[true_label] = prior * likelihood
                total += probs[true_label]

            # Нормировка
            if total > 0:
                for label in probs:
                    probs[label] /= total

            new_probs[i] = probs

        # ===== M-шаг: обновляем confusion matrix =====
        new_matrices: Dict[str, Dict[str, Dict[str, float]]] = {}

        for ann_id in annotator_ids:
            matrix: Dict[str, Dict[str, float]] = {}
            for true_label in labels:
                matrix[true_label] = {obs_label: 0.0 for obs_label in labels}

            new_matrices[ann_id] = matrix

        # Суммируем взвешенные наблюдения
        for i, ann in enumerate(annotations):
            obs_label = extract_class_label(ann.get("label_data", {}), annotation_format)
            if obs_label == "__NER__":
                continue
            ann_id = ann.get("annotator_id", "unknown")
            probs = new_probs.get(i, {})
            matrix = new_matrices.get(ann_id)
            if not matrix:
                continue

            for true_label in labels:
                weight = probs.get(true_label, 0.0)
                if obs_label in matrix[true_label]:
                    matrix[true_label][obs_label] += weight

        # Нормируем матрицы
        for ann_id in annotator_ids:
            matrix = new_matrices.get(ann_id)
            if not matrix:
                continue
            for true_label in labels:
                row = matrix[true_label]
                row_sum = sum(row.values())
                if row_sum > 0:
                    for obs_label in row:
                        row[obs_label] /= row_sum
                else:
                    # Fallback: равномерное распределение
                    for obs_label in row:
                        row[obs_label] = 1.0 / len(labels)

        # Проверяем сходимость
        max_diff = 0.0
        for ann_id in annotator_ids:
            old_matrix = matrices.get(ann_id, {})
            new_matrix = new_matrices.get(ann_id, {})
            for true_label in labels:
                old_row = old_matrix.get(true_label, {})
                new_row = new_matrix.get(true_label, {})
                for obs_label in labels:
                    diff = abs(old_row.get(obs_label, 0.0) - new_row.get(obs_label, 0.0))
                    max_diff = max(max_diff, diff)

        matrices = new_matrices

        if max_diff < convergence and iteration >= min_iterations - 1:
            converged = True
            break

    # ===== Сбор результатов =====
    annotator_quality: Dict[str, Dict[str, Any]] = {}

    for ann_id in annotator_ids:
        matrix = matrices.get(ann_id, {})
        # Accuracy = средняя диагональ, взвешенная по приорам
        accuracy = 0.0
        for label in labels:
            accuracy += priors.get(label, 0.0) * matrix.get(label, {}).get(label, 0.0)
        accuracy = min(1.0, max(0.0, accuracy))

        annotator_quality[ann_id] = {
            "accuracy": round(accuracy, 4),
            "confusion_matrix": {
                true_label: {
                    obs_label: round(prob, 4)
                    for obs_label, prob in row.items()
                }
                for true_label, row in matrix.items()
            },
            "error_rate": round(1.0 - accuracy, 4),
        }

    # Итоговые метки (из последних вероятностей)
    true_labels: Dict[str, Dict[str, Any]] = {}
    for i, ann in enumerate(annotations):
        probs = new_probs.get(i, {})
        if probs:
            best_label = max(probs, key=probs.get)
            true_labels[str(i)] = {
                "label": best_label,
                "confidence": round(probs.get(best_label, 0.0), 4),
                "probabilities": {k: round(v, 4) for k, v in probs.items()},
            }

    return {
        "true_labels": true_labels,
        "annotator_quality": annotator_quality,
        "iterations": iteration + 1,
        "converged": converged,
    }
