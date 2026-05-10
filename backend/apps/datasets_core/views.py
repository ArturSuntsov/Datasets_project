from typing import Any

from bson import ObjectId
from django.http import HttpRequest
from rest_framework import status
from rest_framework.exceptions import NotFound, ParseError, PermissionDenied
from rest_framework.renderers import BaseRenderer
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from ..datasets_core.models import Dataset
from ..users.views import authenticate_from_jwt
from .serializers import DatasetSerializer


class _VocRenderer(BaseRenderer):
    media_type = "application/zip"
    format = "voc"
    render_style = "binary"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return b""


class _CocoRenderer(BaseRenderer):
    media_type = "application/zip"
    format = "coco"
    render_style = "binary"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return b""


class _YoloRenderer(BaseRenderer):
    media_type = "application/zip"
    format = "yolo"
    render_style = "binary"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return b""


class _TfRecordRenderer(BaseRenderer):
    media_type = "application/octet-stream"
    format = "tfrecord"
    render_style = "binary"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return b""


def _parse_int(value: Any, *, default: int, min_value: int) -> int:
    try:
        v = int(value)
    except (TypeError, ValueError):
        return default
    if v < min_value:
        return default
    return v


class DatasetCollectionView(APIView):
    def get_user(self, request: HttpRequest):
        try:
            return authenticate_from_jwt(request)
        except PermissionError as e:
            raise PermissionDenied(str(e))

    def get(self, request: HttpRequest, *args, **kwargs) -> Response:
        user = self.get_user(request)
        limit = _parse_int(request.query_params.get("limit"), default=20, min_value=1)
        limit = min(limit, 100)
        offset = _parse_int(request.query_params.get("offset"), default=0, min_value=0)
        datasets_qs = Dataset.objects(owner=user).order_by("-created_at").skip(offset).limit(limit)
        serializer = DatasetSerializer(datasets_qs, many=True)
        return Response({"items": serializer.data, "limit": limit, "offset": offset}, status=status.HTTP_200_OK)

    def post(self, request: HttpRequest, *args, **kwargs) -> Response:
        user = self.get_user(request)
        request.user = user
        serializer = DatasetSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        dataset = serializer.save()
        return Response(serializer.to_representation(dataset), status=status.HTTP_201_CREATED)


class DatasetDetailView(APIView):
    def get_user(self, request: HttpRequest):
        try:
            return authenticate_from_jwt(request)
        except PermissionError as e:
            raise PermissionDenied(str(e))

    def _get_owned_dataset(self, user, dataset_id: str) -> Dataset:
        if not ObjectId.is_valid(dataset_id):
            raise ParseError("Некорректный id датасета.")
        dataset = Dataset.objects(id=ObjectId(dataset_id), owner=user).first()
        if not dataset:
            raise NotFound("Dataset not found.")
        return dataset

    def get(self, request: HttpRequest, dataset_id: str, *args, **kwargs) -> Response:
        user = self.get_user(request)
        dataset = self._get_owned_dataset(user, dataset_id)
        serializer = DatasetSerializer(dataset)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request: HttpRequest, dataset_id: str, *args, **kwargs) -> Response:
        user = self.get_user(request)
        dataset = self._get_owned_dataset(user, dataset_id)
        serializer = DatasetSerializer(dataset, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        updated = serializer.update(dataset, serializer.validated_data)
        return Response(serializer.to_representation(updated), status=status.HTTP_200_OK)

    def put(self, request: HttpRequest, dataset_id: str, *args, **kwargs) -> Response:
        user = self.get_user(request)
        dataset = self._get_owned_dataset(user, dataset_id)
        serializer = DatasetSerializer(dataset, data=request.data, partial=False, context={"request": request})
        serializer.is_valid(raise_exception=True)
        updated = serializer.update(dataset, serializer.validated_data)
        return Response(serializer.to_representation(updated), status=status.HTTP_200_OK)

    def delete(self, request: HttpRequest, dataset_id: str, *args, **kwargs) -> Response:
        user = self.get_user(request)
        dataset = self._get_owned_dataset(user, dataset_id)
        dataset.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DatasetExportView(APIView):
    renderer_classes = [JSONRenderer, _VocRenderer, _CocoRenderer, _YoloRenderer, _TfRecordRenderer]

    def get_user(self, request: HttpRequest):
        try:
            return authenticate_from_jwt(request)
        except PermissionError as e:
            raise PermissionDenied(str(e))

    def get(self, request: HttpRequest, dataset_id: str, *args, **kwargs):
        user = self.get_user(request)

        if user.role != "customer":
            raise PermissionDenied("Доступ к скачиванию разрешен только заказчикам (customer).")

        if not ObjectId.is_valid(dataset_id):
            raise ParseError("Некорректный id датасета.")
        dataset = Dataset.objects(id=ObjectId(dataset_id), owner=user).first()
        if not dataset:
            raise NotFound("Dataset not found.")

        export_format = (request.query_params.get("format") or "").strip().lower()
        if export_format in {"json", "csv", "photo"}:
            raise ParseError("Legacy formats are removed. Supported formats: voc, coco, yolo, tfrecord.")
        if export_format not in {"voc", "coco", "yolo", "tfrecord"}:
            raise ParseError("Unsupported format. Supported formats: voc, coco, yolo, tfrecord.")

        from apps.projects.models import Task
        from apps.projects.export_utils import export_project_dataset

        related_task = Task.objects(dataset=dataset, project__ne=None).first()
        if not related_task or not related_task.project:
            raise ParseError("Dataset export requires a linked CV project. Use /api/projects/<id>/export.")
        return export_project_dataset(str(related_task.project.id), user, request)