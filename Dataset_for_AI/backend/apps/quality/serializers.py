from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple

from mongoengine import DoesNotExist
from rest_framework import serializers

from ..datasets_core.models import Dataset
from ..labeling.models import Annotation
from ..projects.models import Task
from ..users.models import User
from .models import QualityMetric, QualityReview


def _safe_float(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def compute_ner_metrics(true_spans: Set[Tuple[int, int, str]], pred_spans: Set[Tuple[int, int, str]]) -> Dict[str, float]:
    """
    Precision/Recall/F1 для NER по точному совпадению span (start,end,tag).
    """
    tp = len(true_spans & pred_spans)
    fp = len(pred_spans - true_spans)
    fn = len(true_spans - pred_spans)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
    return {"precision": precision, "recall": recall, "f1": f1, "tp": tp, "fp": fp, "fn": fn}


def extract_spans_ner(label_data: Dict[str, Any]) -> Set[Tuple[int, int, str]]:
    spans = label_data.get("spans", [])
    result: Set[Tuple[int, int, str]] = set()
    if not isinstance(spans, list):
        return result
    for span in spans:
        if not isinstance(span, dict):
            continue
        start = span.get("start")
        end = span.get("end")
        tag = span.get("tag")
        if isinstance(start, int) and isinstance(end, int) and isinstance(tag, str):
            result.add((start, end, tag))
    return result


class ReviewSerializer(serializers.Serializer):
    """
    Serializer для создания проверки качества (cross-check).
    """

    task_id = serializers.CharField()
    annotation_a_id = serializers.CharField()
    annotation_b_id = serializers.CharField()

    arbitrator = serializers.CharField(required=False, allow_null=True)
    arbitration_requested = serializers.BooleanField(required=False, default=False)
    arbitration_comment = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    # Ответные поля
    review_status = serializers.CharField(read_only=True)
    metrics = serializers.DictField(read_only=True)
    final_label_data = serializers.DictField(read_only=True)

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        task_id = attrs["task_id"]
        a_id = attrs["annotation_a_id"]
        b_id = attrs["annotation_b_id"]

        task = Task.objects(id=task_id).first()
        if not task:
            raise serializers.ValidationError("Task не найден.")

        ann_a = Annotation.objects(id=a_id).first()
        ann_b = Annotation.objects(id=b_id).first()
        if not ann_a or not ann_b:
            raise serializers.ValidationError("Одна из аннотаций не найдена.")

        if str(ann_a.task.id) != str(task.id) or str(ann_b.task.id) != str(task.id):
            raise serializers.ValidationError("Аннотации не принадлежат указанному task.")
        if str(ann_a.dataset.id) != str(task.dataset.id) or str(ann_b.dataset.id) != str(task.dataset.id):
            raise serializers.ValidationError("Аннотации не принадлежат указанному dataset.")
        if str(ann_a.annotator.id) == str(ann_b.annotator.id):
            raise serializers.ValidationError("Cross-check требует как минимум 2 разных исполнителя.")

        # Формат берем из annotation_a (и предполагаем совпадение).
        if ann_a.annotation_format != ann_b.annotation_format:
            raise serializers.ValidationError("annotation_format у аннотаций должен совпадать.")

        attrs["_task"] = task
        attrs["_ann_a"] = ann_a
        attrs["_ann_b"] = ann_b
        return attrs

    def _compute_metrics(self, ann_a: Annotation, ann_b: Annotation) -> Dict[str, Any]:
        annotation_format = ann_a.annotation_format
        true_data = ann_a.label_data
        pred_data = ann_b.label_data

        if annotation_format == "ner_v1":
            true_spans = extract_spans_ner(true_data)
            pred_spans = extract_spans_ner(pred_data)
            return compute_ner_metrics(true_spans, pred_spans)

        if annotation_format == "classification_v1":
            true_label = true_data.get("class_label")
            pred_label = pred_data.get("class_label")
            match = 1.0 if (isinstance(true_label, str) and true_label == pred_label) else 0.0
            # Для MVP считаем бинарное F1.
            return {"precision": match, "recall": match, "f1": match, "tp": match, "fp": 1 - match, "fn": 1 - match}

        # generic_v1
        match = 1.0 if true_data == pred_data else 0.0
        return {"precision": match, "recall": match, "f1": match, "tp": match, "fp": 1 - match, "fn": 1 - match}

    def create(self, validated_data: Dict[str, Any]) -> QualityReview:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user:
            raise serializers.ValidationError("Authentication required.")

        task: Task = validated_data.pop("_task")
        ann_a: Annotation = validated_data.pop("_ann_a")
        ann_b: Annotation = validated_data.pop("_ann_b")

        metrics = self._compute_metrics(ann_a, ann_b)

        arbitration_requested = validated_data.get("arbitration_requested", False)
        arbitration_comment = validated_data.get("arbitration_comment")
        arbitrator_id = validated_data.get("arbitrator")
        arbitrator = None
        if arbitrator_id:
            arbitrator = User.objects(id=arbitrator_id, role=User.ROLE_ADMIN).first()

        review = QualityReview(
            task=task,
            dataset=task.dataset,
            annotation_a=ann_a,
            annotation_b=ann_b,
            review_status=QualityReview.STATUS_COMPLETED if not arbitration_requested else QualityReview.STATUS_ARBITRATED,
            metrics=metrics,
            final_label_data=ann_a.label_data if not arbitration_requested else ann_b.label_data,
            arbitration_requested=bool(arbitration_requested),
            arbitration_comment=arbitration_comment,
            arbitrator=arbitrator if arbitration_requested else None,
        )
        review.save()

        # Сохраняем метрики отдельной сущностью (для отчетности).
        QualityMetric(
            dataset=task.dataset,
            task=task,
            precision=_safe_float(metrics.get("precision")),
            recall=_safe_float(metrics.get("recall")),
            f1=_safe_float(metrics.get("f1")),
            details=metrics,
        ).save()

        return review

