from typing import Any, Dict, List, Optional

import zipfile
import json
import pandas as pd
from io import StringIO
from datetime import datetime
import logging
import tempfile

from bson import ObjectId
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.http.response import FileResponse
from mongoengine.errors import ValidationError as MongoValidationError
from rest_framework import status
from rest_framework.exceptions import NotFound, ParseError, PermissionDenied
from rest_framework.renderers import BaseRenderer
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from ..datasets_core.models import Dataset
from ..users.views import authenticate_from_jwt
from ..cv_annotation.models import WorkAnnotation, WorkItem, FrameItem, ImportAsset
from ..projects.photo_rendering import resolve_local_path, render_annotated_frame, safe_frame_name
from .serializers import DatasetSerializer

logger = logging.getLogger(__name__)


class _CSVRenderer(BaseRenderer):
    media_type = "text/csv"
    format = "csv"
    charset = "utf-8"
    render_style = "binary"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        # Export endpoint returns HttpResponse directly; renderer isn't used.
        return b""


class _PhotoZipRenderer(BaseRenderer):
    media_type = "application/zip"
    format = "photo"
    render_style = "binary"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        # Export endpoint returns HttpResponse directly; renderer isn't used.
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
    renderer_classes = [JSONRenderer, _CSVRenderer, _PhotoZipRenderer]

    def get_user(self, request: HttpRequest):
        try:
            return authenticate_from_jwt(request)
        except PermissionError as e:
            raise PermissionDenied(str(e))

    def _prepare_annotation_data(self, dataset: Dataset) -> List[Dict]:
        """Collect annotation data linked to dataset."""
        try:
            assets = ImportAsset.objects(dataset=dataset)
            frame_items = FrameItem.objects(asset__in=list(assets))
            work_items = WorkItem.objects(frame__in=list(frame_items))
            annotations = WorkAnnotation.objects(
                work_item__in=list(work_items),
                status__in=["submitted", "accepted"]
            )
        except Exception:
            return []

        result = []
        for ann in annotations:
            item_data = {
                "annotation_id": str(ann.id),
                "work_item_id": str(ann.work_item.id) if ann.work_item else None,
                "label_data": ann.label_data,
                "status": ann.status,
                "created_at": ann.created_at.isoformat() if ann.created_at else None,
            }
            try:
                if ann.work_item and ann.work_item.frame and ann.work_item.frame.asset:
                    item_data["source_file"] = ann.work_item.frame.asset.file_name
                    item_data["source_uri"] = ann.work_item.frame.frame_uri
            except Exception:
                pass
            result.append(item_data)
        return result

    def get(self, request: HttpRequest, dataset_id: str, *args, **kwargs):
        user = self.get_user(request)

        if user.role != "customer":
            raise PermissionDenied("Доступ к скачиванию разрешен только заказчикам (customer).")

        if not ObjectId.is_valid(dataset_id):
            raise ParseError("Некорректный id датасета.")
        dataset = Dataset.objects(id=ObjectId(dataset_id), owner=user).first()
        if not dataset:
            raise NotFound("Dataset not found.")

        data = self._prepare_annotation_data(dataset)
        export_format = request.query_params.get("format", "json").lower()

        if export_format == "json":
            response = JsonResponse(
                data,
                safe=False,
                json_dumps_params={"ensure_ascii": False, "indent": 2}
            )
            response["Content-Disposition"] = f'attachment; filename="dataset-{dataset_id}-export.json"'
            return response

        elif export_format == "csv":
            flat_data = []
            for item in data:
                flat_item = {
                    "annotation_id": item.get("annotation_id"),
                    "source_file": item.get("source_file", ""),
                    "source_uri": item.get("source_uri", ""),
                    "label_data": json.dumps(item.get("label_data", {}), ensure_ascii=False),
                    "status": item.get("status"),
                    "created_at": item.get("created_at"),
                }
                flat_data.append(flat_item)

            df = pd.DataFrame(flat_data)
            csv_buffer = StringIO()
            df.to_csv(csv_buffer, index=False, encoding="utf-8")

            response = HttpResponse(csv_buffer.getvalue(), content_type="text/csv; charset=utf-8")
            response["Content-Disposition"] = f'attachment; filename="dataset-{dataset_id}-export.csv"'
            return response

        elif export_format == "photo":
            tmp_path = None
            try:
                with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
                    tmp_path = tmp.name

                with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
                    added_images = set()
                    for item in data:
                        source_uri = item.get("source_uri")
                        source_file = item.get("source_file")
                        if not source_uri or not source_file:
                            continue

                        image_key = f"{source_uri}-{source_file}"
                        if image_key in added_images:
                            continue

                        try:
                            image_filename = safe_frame_name(source_uri, source_file)
                            local_path = resolve_local_path(source_uri)
                            if not local_path:
                                logger.warning("Frame file not found for URI %s", source_uri)
                                continue
                            with open(local_path, "rb") as img_file:
                                rendered_bytes = render_annotated_frame(img_file.read(), item.get("label_data") or {})
                            zf.writestr(f"images/{image_filename}", rendered_bytes)
                            added_images.add(image_key)
                        except Exception as e:
                            logger.warning("Failed to add frame %s: %s", source_uri, str(e))
                            continue

                fh = open(tmp_path, "rb")
                return FileResponse(
                    fh,
                    content_type="application/zip",
                    as_attachment=True,
                    filename=f"dataset-{dataset_id}-frames.zip",
                )
            finally:
                pass

        else:
            raise ParseError("Неподдерживаемый формат. Используйте json, csv или photo.")