"""
Celery задачи для асинхронной работы с MinIO.
"""

import os
import logging
from typing import Dict, Any

from celery import shared_task
from django.conf import settings
from django.core.files.base import ContentFile

from .storage import MinIOClient
from .utils import (
    calculate_file_hash,
    validate_file_extension,
    validate_file_size,
    save_uploaded_file_temporarily,
    cleanup_temp_file,
)

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def upload_dataset_to_minio(
    self,
    dataset_id: str,
    user_id: str,
    filename: str,
    temp_file_path: str,
) -> Dict[str, Any]:
    """
    Загружает файл датасета в MinIO.

    Args:
        dataset_id: ID датасета в MongoDB
        user_id: ID пользователя-владельца
        filename: оригинальное имя файла
        temp_file_path: путь к временному файлу

    Returns:
        Словарь с результатами: storage_path, file_size, file_hash
    """
    from apps.datasets_core.models import Dataset
    from apps.users.models import User

    logger.info(f"Starting upload: dataset_id={dataset_id}, user_id={user_id}, file={filename}")

    try:
        # 1. Получаем датасет
        dataset = Dataset.objects(id=dataset_id).first()
        if not dataset:
            raise ValueError(f"Dataset {dataset_id} not found")

        # 2. Открываем временный файл и вычисляем хеш
        with open(temp_file_path, 'rb') as f:
            file_hash, file_size = calculate_file_hash(f, algorithm='sha256')

        # 3. Валидация размера и расширения
        if not validate_file_size(file_size, max_size_mb=settings.MAX_DATASET_SIZE_MB):
            raise ValueError(f"File size {file_size} exceeds limit {settings.MAX_DATASET_SIZE_MB}MB")

        if not validate_file_extension(filename, allowed_extensions=settings.ALLOWED_DATASET_EXTENSIONS):
            raise ValueError(f"File extension not allowed for {filename}")

        # 4. Формируем путь в MinIO
        # Формат: datasets/{user_id}/{dataset_id}/{original_filename}
        storage_path = f"datasets/{user_id}/{dataset_id}/{filename}"

        # 5. Загружаем в MinIO
        minio_client = MinIOClient()
        with open(temp_file_path, 'rb') as f:
            etag = minio_client.upload_stream(
                object_key=storage_path,
                data_stream=f,
                content_length=file_size,
                content_type='application/octet-stream',
            )

        # 6. Обновляем датасет в MongoDB
        dataset.file_size_bytes = file_size
        dataset.file_hash = file_hash
        dataset.storage_path = storage_path
        dataset.upload_status = 'uploaded'
        dataset.file_uri = f"s3://{settings.MINIO_BUCKET_NAME}/{storage_path}"  # для совместимости
        dataset.save()

        logger.info(f"Upload completed: {storage_path}, size={file_size}, hash={file_hash[:16]}...")

        return {
            'status': 'success',
            'storage_path': storage_path,
            'file_size': file_size,
            'file_hash': file_hash,
            'etag': etag,
        }

    except Exception as e:
        logger.error(f"Upload failed for dataset {dataset_id}: {e}")

        # Обновляем статус в MongoDB
        try:
            from apps.datasets_core.models import Dataset
            dataset = Dataset.objects(id=dataset_id).first()
            if dataset:
                dataset.upload_status = 'failed'
                dataset.save()
        except Exception as db_error:
            logger.error(f"Failed to update dataset status: {db_error}")

        # Повторяем задачу при ошибке (если не превышено число попыток)
        raise self.retry(exc=e)

    finally:
        # Всегда удаляем временный файл
        cleanup_temp_file(temp_file_path)


@shared_task
def delete_from_minio(dataset_id: str, storage_path: str) -> Dict[str, Any]:
    """
    Удаляет файл датасета из MinIO.

    Args:
        dataset_id: ID датасета (для логирования)
        storage_path: путь к объекту в MinIO

    Returns:
        Статус удаления
    """
    logger.info(f"Deleting from MinIO: dataset_id={dataset_id}, path={storage_path}")

    try:
        if not storage_path:
            logger.warning(f"No storage_path for dataset {dataset_id}, skipping")
            return {'status': 'skipped', 'reason': 'no storage_path'}

        minio_client = MinIOClient()
        success = minio_client.delete_object(storage_path)

        if success:
            logger.info(f"Deleted: {storage_path}")
            return {'status': 'deleted', 'storage_path': storage_path}
        else:
            logger.warning(f"Failed to delete {storage_path}")
            return {'status': 'failed', 'storage_path': storage_path}

    except Exception as e:
        logger.error(f"Error deleting {storage_path}: {e}")
        return {'status': 'error', 'error': str(e)}


@shared_task
def generate_presigned_url_for_dataset(dataset_id: str, expiry_seconds: int = 3600) -> Dict[str, Any]:
    """
    Генерирует временную ссылку для скачивания датасета.

    Args:
        dataset_id: ID датасета
        expiry_seconds: время жизни ссылки в секундах

    Returns:
        Словарь с download_url или ошибкой
    """
    from apps.datasets_core.models import Dataset

    logger.info(f"Generating presigned URL for dataset {dataset_id}")

    dataset = Dataset.objects(id=dataset_id).first()
    if not dataset:
        return {'error': f'Dataset {dataset_id} not found'}

    if not dataset.storage_path:
        return {'error': 'No file uploaded for this dataset'}

    minio_client = MinIOClient()
    url = minio_client.get_presigned_url(dataset.storage_path, expiry_seconds)

    if url:
        return {
            'download_url': url,
            'expires_in': expiry_seconds,
            'file_name': dataset.storage_path.split('/')[-1],
            'file_size': dataset.file_size_bytes,
        }
    else:
        return {'error': 'Failed to generate download URL'}
