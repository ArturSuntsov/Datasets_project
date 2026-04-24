from __future__ import annotations

from typing import Any, Dict, Optional

from bson import ObjectId
from django.http import HttpRequest
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from ..projects.models import Task
from ..users.views import authenticate_from_jwt
from .models import Annotation, LabelingSession
from .serializers import AnnotationSerializer


class AnnotationViewSet(ViewSet):
    """
    ViewSet для операций с аннотациями:
    - create
    - update (PUT)
    - partial_update (PATCH)
    """

    permission_classes = [permissions.AllowAny]  # аутентификация проверяется вручную для MVP

    def _get_user(self, request: HttpRequest):
        try:
            return authenticate_from_jwt(request)
        except PermissionError as e:
            return None

    def _require_user(self, request: HttpRequest):
        user = self._get_user(request)
        if not user:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        return user

    def _get_annotation_owned_by_user(self, user, annotation_id: str) -> Optional[Annotation]:
        if not ObjectId.is_valid(annotation_id):
            return None
        return Annotation.objects(id=ObjectId(annotation_id), annotator=user).first()

    def get_serializer_context(self):
        return {"request": self.request}

    def create(self, request, *args, **kwargs) -> Response:
        user_or_resp = self._require_user(request)
        if isinstance(user_or_resp, Response):
            return user_or_resp
        user = user_or_resp

        data = dict(request.data)

        # AI-assisted: при флаге `auto_label=true` заполняем predicted_data через заглушку ML.
        if str(data.get("auto_label", "")).lower() in ("1", "true", "yes"):
            session_id = data.get("session_id")
            session: Optional[LabelingSession] = None
            if session_id:
                session = LabelingSession.objects(id=session_id, annotator=user).first()
            if session:
                predicted = session.auto_label(input_context=data.get("input_context") or {})
            else:
                # fallback: если session не передан, предсказываем в рамках dataset metadata
                predicted = (session.auto_label(input_context=data.get("input_context") or {}) if session else {})
            data["predicted_data"] = predicted

            # Убираем служебное поле, чтобы не валидировать его в сериализаторе.
            data.pop("auto_label", None)
            data.pop("input_context", None)

        serializer = AnnotationSerializer(data=data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        annotation: Annotation = serializer.save()

        # Обновляем статус задачи при "финализации" разметки.
        task: Task = annotation.task
        if task.status in (Task.STATUS_PENDING, Task.STATUS_IN_PROGRESS):
            if annotation.is_final or annotation.status == Annotation.STATUS_PENDING_REVIEW:
                task.status = Task.STATUS_REVIEW
                task.save()

        return Response(serializer.to_representation(annotation), status=status.HTTP_201_CREATED)

    def update(self, request, pk: str = None, *args, **kwargs) -> Response:
        user_or_resp = self._require_user(request)
        if isinstance(user_or_resp, Response):
            return user_or_resp
        user = user_or_resp

        annotation = self._get_annotation_owned_by_user(user, pk)
        if not annotation:
            return Response({"detail": "Annotation not found"}, status=status.HTTP_404_NOT_FOUND)

        # Для валидации формата сериализатору нужны task_id/dataset_id/annotation_format,
        # поэтому если фронт их не прислал, берем из существующей аннотации.
        data = dict(request.data)
        data.setdefault("task_id", str(annotation.task.id))
        data.setdefault("dataset_id", str(annotation.dataset.id))
        data.setdefault("annotation_format", annotation.annotation_format)

        serializer = AnnotationSerializer(annotation, data=data, partial=False, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        updated = serializer.update(annotation, serializer.validated_data)
        return Response(serializer.to_representation(updated), status=status.HTTP_200_OK)

    def partial_update(self, request, pk: str = None, *args, **kwargs) -> Response:
        user_or_resp = self._require_user(request)
        if isinstance(user_or_resp, Response):
            return user_or_resp
        user = user_or_resp

        annotation = self._get_annotation_owned_by_user(user, pk)
        if not annotation:
            return Response({"detail": "Annotation not found"}, status=status.HTTP_404_NOT_FOUND)

        data = dict(request.data)
        data.setdefault("task_id", str(annotation.task.id))
        data.setdefault("dataset_id", str(annotation.dataset.id))
        data.setdefault("annotation_format", annotation.annotation_format)

        serializer = AnnotationSerializer(annotation, data=data, partial=True, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        updated = serializer.update(annotation, serializer.validated_data)
        return Response(serializer.to_representation(updated), status=status.HTTP_200_OK)

    # Для удобства фронта (не требование, но полезно): GET для чтения аннотаций пользователя
    def retrieve(self, request, pk: str = None, *args, **kwargs) -> Response:
        user_or_resp = self._require_user(request)
        if isinstance(user_or_resp, Response):
            return user_or_resp
        user = user_or_resp

        annotation = self._get_annotation_owned_by_user(user, pk)
        if not annotation:
            return Response({"detail": "Annotation not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = AnnotationSerializer(annotation, context=self.get_serializer_context())
        return Response(serializer.to_representation(annotation), status=status.HTTP_200_OK)

