from __future__ import annotations
from bson import ObjectId
from rest_framework.decorators import api_view, permission_classes
from rest_framework import permissions, status
from rest_framework.response import Response
from ..users.views import authenticate_from_jwt
from .models import QualityReview, RatingHistory
from ..projects.models import Project, ProjectMembership
from ..users.models import User


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def project_dawid_skene_view(request, project_id: str):
    try:
        user = authenticate_from_jwt(request)
    except PermissionError:
        return Response({"detail": "Unauthorized"}, status=401)

    if not ObjectId.is_valid(project_id):
        return Response({"detail": "Invalid project_id"}, status=400)
    pid = ObjectId(project_id)

    project = Project.objects(id=pid).first()
    if not project:
        return Response({"detail": "Project not found"}, status=404)

    members = ProjectMembership.objects(project=pid, role="annotator")
    annotator_ids = [m.user.id for m in members]

    if not annotator_ids:
        annotator_ids = [u.id for u in (project.allowed_annotators or [])]

    # Берём ВСЕ ревью, без фильтра по проекту
    reviews = QualityReview.objects(
        review_status__in=["completed", "arbitrated"]
    )

    result = []
    for uid in annotator_ids:
        usr = User.objects(id=uid).first()
        if not usr:
            continue

        metrics = {}
        for r in reviews:
            ann_metrics = (r.metrics or {}).get("annotator_metrics", {})
            if str(uid) in ann_metrics:
                metrics = ann_metrics[str(uid)]
                break

        history = list(RatingHistory.objects(user=uid).order_by("-created_at").limit(10))
        rating_history = [
            {
                "rating_before": h.rating_before,
                "rating_after": h.rating_after,
                "rating_delta": h.rating_delta,
                "task_id": str(h.task.id) if h.task else None,
                "created_at": h.created_at.isoformat(),
            }
            for h in history
        ]

        result.append({
            "user_id": str(uid),
            "username": usr.username,
            "accuracy": metrics.get("accuracy", 0.0),
            "f1": metrics.get("f1", 0.0),
            "error_rate": metrics.get("error_rate", 0.0),
            "confusion_matrix": metrics.get("confusion_matrix", {}),
            "rating": float(usr.rating or 0),
            "rating_history": rating_history,
        })

    return Response({"project_id": str(pid), "annotators": result})
