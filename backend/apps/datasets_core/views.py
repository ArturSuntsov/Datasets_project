from __future__ import annotations

from typing import Any, Dict
from bson import ObjectId
from django.conf import settings
from django.http import HttpRequest
from mongoengine.errors import ValidationError as MongoValidationError
from rest_framework import status
from rest_framework.exceptions import NotFound, ParseError, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from ..datasets_core.models import Dataset
from ..users.serializers import JWT_ACCESS_TTL_MINUTES
from ..users.views import authenticate_from_jwt
from .serializers import DatasetSerializer, DatasetUploadSerializer, DatasetUploadStatusSerializer, DatasetDownloadSerializer

# Data Lake imports
from apps.data_lake.tasks import upload_dataset_to_minio, generate_presigned_url_for_dataset
from apps.data_lake.utils import save_uploaded_file_temporarily


# ============================================================================
# Existing Views (оставьте ваши существующие классы нетронутыми)
# ============================================================================

def _parse_int(value: Any, *, default: int, min_value: int) -> int:
    try:
        v = int(value)
    except (TypeError, ValueError):
        return default
    if v < min_value:
        return default
    return v


class DatasetCollectionView(APIView):
    """CRUD (коллекция): GET /api/datasets?offset=&limit= POST /api/datasets"""

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

        datasets_qs = (
            Dataset.objects(owner=user)
            .order_by("-created_at")
            .skip(offset)
            .limit(limit)
        )
        serializer = DatasetSerializer(datasets_qs, many=True)
        return Response({
            "items": serializer.data,
            "limit": limit,
            "offset": offset
        }, status=status.HTTP_200_OK)

    def post(self, request: HttpRequest, *args, **kwargs) -> Response:
        user = self.get_user(request)
        serializer = DatasetSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        dataset = serializer.save()
        return Response(
            serializer.to_representation(dataset),
            status=status.HTTP_201_CREATED
        )


class DatasetDetailView(APIView):
    """CRUD (деталь): GET /api/datasets/<id> PATCH /api/datasets/<id> PUT /api/datasets/<id> DELETE /api/datasets/<id>"""

    def get_user(self, request: HttpRequest):
        try:
            return authenticate_from_jwt(request)
        except PermissionError as e:
            raise PermissionDenied(str(e))

    def _get_owned_dataset(self, user, dataset_id: str) -> Dataset:
        if not ObjectId.is_valid(dataset_id):
            raise ValidationError("Некорректный id датасета.")
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


# ============================================================================
# NEW Data Lake Views (добавленные)
# ============================================================================

class DatasetUploadView(APIView):
    """
    Загрузка файла для датасета.
    POST /api/datasets/<id>/upload/
    """
    
    def get_user(self, request: HttpRequest):
        try:
            return authenticate_from_jwt(request)
        except PermissionError as e:
            raise PermissionDenied(str(e))
    
    def _get_owned_dataset(self, user, dataset_id: str) -> Dataset:
        if not ObjectId.is_valid(dataset_id):
            raise ValidationError("Некорректный id датасета.")
        dataset = Dataset.objects(id=ObjectId(dataset_id), owner=user).first()
        if not dataset:
            raise NotFound("Dataset not found.")
        return dataset
    
    def post(self, request: HttpRequest, dataset_id: str, *args, **kwargs) -> Response:
        user = self.get_user(request)
        dataset = self._get_owned_dataset(user, dataset_id)
        
        # Валидация загруженного файла
        upload_serializer = DatasetUploadSerializer(data=request.data)
        upload_serializer.is_valid(raise_exception=True)
        
        uploaded_file = upload_serializer.validated_data['file']
        
        # Обновляем статус датасета
        dataset.upload_status = 'uploading'
        dataset.save()
        
        # Сохраняем временный файл
        temp_file_path = save_uploaded_file_temporarily(uploaded_file)
        
        # Запускаем Celery задачу
        task = upload_dataset_to_minio.delay(
            dataset_id=str(dataset.id),
            user_id=str(user.id),
            filename=uploaded_file.name,
            temp_file_path=temp_file_path,
        )
        
        return Response(
            {
                'task_id': task.id,
                'status': 'uploading',
                'dataset_id': str(dataset.id),
                'message': 'Upload started. Poll /upload-status/ for progress.'
            },
            status=status.HTTP_202_ACCEPTED
        )


class DatasetUploadStatusView(APIView):
    """
    Получение статуса загрузки датасета.
    GET /api/datasets/<id>/upload-status/
    """
    
    def get_user(self, request: HttpRequest):
        try:
            return authenticate_from_jwt(request)
        except PermissionError as e:
            raise PermissionDenied(str(e))
    
    def _get_owned_dataset(self, user, dataset_id: str) -> Dataset:
        if not ObjectId.is_valid(dataset_id):
            raise ValidationError("Некорректный id датасета.")
        dataset = Dataset.objects(id=ObjectId(dataset_id), owner=user).first()
        if not dataset:
            raise NotFound("Dataset not found.")
        return dataset
    
    def get(self, request: HttpRequest, dataset_id: str, *args, **kwargs) -> Response:
        user = self.get_user(request)
        dataset = self._get_owned_dataset(user, dataset_id)
        
        # Определяем прогресс на основе статуса
        progress = 0
        if dataset.upload_status == 'pending':
            progress = 0
        elif dataset.upload_status == 'uploading':
            progress = 50
        elif dataset.upload_status == 'uploaded':
            progress = 100
        elif dataset.upload_status == 'failed':
            progress = 0
        
        serializer = DatasetUploadStatusSerializer({
            'status': dataset.upload_status,
            'progress': progress,
            'file_size_bytes': dataset.file_size_bytes,
            'file_hash': dataset.file_hash if dataset.file_hash else None,
        })
        
        return Response(serializer.data, status=status.HTTP_200_OK)


class DatasetDownloadView(APIView):
    """
    Получение временной ссылки на скачивание датасета.
    GET /api/datasets/<id>/download/
    """
    
    def get_user(self, request: HttpRequest):
        try:
            return authenticate_from_jwt(request)
        except PermissionError as e:
            raise PermissionDenied(str(e))
    
    def _get_dataset(self, user, dataset_id: str) -> Dataset:
        if not ObjectId.is_valid(dataset_id):
            raise ValidationError("Некорректный id датасета.")
        
        # Администратор может скачать любой датасет
        if user.role == 'admin':
            dataset = Dataset.objects(id=ObjectId(dataset_id)).first()
        else:
            dataset = Dataset.objects(id=ObjectId(dataset_id), owner=user).first()
        
        if not dataset:
            raise NotFound("Dataset not found.")
        return dataset
    
    def get(self, request: HttpRequest, dataset_id: str, *args, **kwargs) -> Response:
        user = self.get_user(request)
        dataset = self._get_dataset(user, dataset_id)
        
        if not dataset.storage_path:
            raise ValidationError("No file uploaded for this dataset.")
        
        if dataset.upload_status != 'uploaded':
            raise ValidationError(f"Cannot download: dataset is in '{dataset.upload_status}' state.")
        
        # Генерируем presigned URL
        expiry = getattr(settings, 'MINIO_PRESIGNED_URL_EXPIRY', 3600)
        result = generate_presigned_url_for_dataset(str(dataset.id), expiry)
        
        if 'error' in result:
            raise ValidationError(result['error'])
        
        serializer = DatasetDownloadSerializer(result)
        return Response(serializer.data, status=status.HTTP_200_OK)
