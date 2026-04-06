"""
MinIO клиент для работы с объектным хранилищем.
Поддерживает: upload, download, delete, presigned URLs.
"""

import logging
from typing import BinaryIO, Optional
from urllib3.response import HTTPResponse

from minio import Minio
from minio.error import S3Error
from django.conf import settings

logger = logging.getLogger(__name__)


class MinIOClient:
    """Singleton клиент для работы с MinIO."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        """Инициализация подключения к MinIO."""
        self.endpoint = settings.MINIO_ENDPOINT
        self.access_key = settings.MINIO_ACCESS_KEY
        self.secret_key = settings.MINIO_SECRET_KEY
        self.secure = settings.MINIO_SECURE
        self.bucket_name = settings.MINIO_BUCKET_NAME

        self.client = Minio(
            self.endpoint,
            access_key=self.access_key,
            secret_key=self.secret_key,
            secure=self.secure,
        )

        self._ensure_bucket_exists()

        logger.info(f"MinIO client initialized: endpoint={self.endpoint}, bucket={self.bucket_name}")

    def _ensure_bucket_exists(self):
        """Создаёт bucket, если он не существует."""
        if not self.client.bucket_exists(self.bucket_name):
            self.client.make_bucket(self.bucket_name)
            logger.info(f"Bucket '{self.bucket_name}' created")
        else:
            logger.info(f"Bucket '{self.bucket_name}' already exists")

    def upload_stream(
        self,
        object_key: str,
        data_stream: BinaryIO,
        content_length: int,
        content_type: str = "application/octet-stream",
    ) -> str:
        """
        Загружает поток данных в MinIO.

        Args:
            object_key: путь к объекту в bucket (например, "user_123/dataset_456/file.zip")
            data_stream: поток данных для загрузки
            content_length: размер данных в байтах
            content_type: MIME тип файла

        Returns:
            ETag объекта (обычно MD5 хеш)

        Raises:
            S3Error: при ошибке загрузки
        """
        try:
            result = self.client.put_object(
                bucket_name=self.bucket_name,
                object_name=object_key,
                data=data_stream,
                length=content_length,
                content_type=content_type,
            )
            logger.info(f"Uploaded: {object_key} (ETag={result.etag})")
            return result.etag
        except S3Error as e:
            logger.error(f"Failed to upload {object_key}: {e}")
            raise

    def download_stream(self, object_key: str) -> HTTPResponse:
        """
        Получает поток данных из MinIO.

        Args:
            object_key: путь к объекту в bucket

        Returns:
            HTTPResponse объект с данными

        Raises:
            S3Error: если объект не найден или ошибка доступа
        """
        try:
            response = self.client.get_object(self.bucket_name, object_key)
            logger.info(f"Downloaded stream: {object_key}")
            return response
        except S3Error as e:
            logger.error(f"Failed to download {object_key}: {e}")
            raise

    def delete_object(self, object_key: str) -> bool:
        """
        Удаляет объект из MinIO.

        Args:
            object_key: путь к объекту в bucket

        Returns:
            True если успешно удалён (или не существовал), False при ошибке
        """
        try:
            self.client.remove_object(self.bucket_name, object_key)
            logger.info(f"Deleted: {object_key}")
            return True
        except S3Error as e:
            logger.error(f"Failed to delete {object_key}: {e}")
            return False

    def get_presigned_url(self, object_key: str, expiry_seconds: int = 3600) -> Optional[str]:
        """
        Генерирует временную ссылку на скачивание объекта.

        Args:
            object_key: путь к объекту в bucket
            expiry_seconds: время жизни ссылки в секундах

        Returns:
            Временная ссылка или None при ошибке
        """
        try:
            url = self.client.presigned_get_object(
                bucket_name=self.bucket_name,
                object_name=object_key,
                expires=expiry_seconds,
            )
            logger.info(f"Presigned URL generated for {object_key} (expires in {expiry_seconds}s)")
            return url
        except S3Error as e:
            logger.error(f"Failed to generate presigned URL for {object_key}: {e}")
            return None

    def object_exists(self, object_key: str) -> bool:
        """
        Проверяет существование объекта в MinIO.

        Args:
            object_key: путь к объекту в bucket

        Returns:
            True если объект существует
        """
        try:
            self.client.stat_object(self.bucket_name, object_key)
            return True
        except S3Error:
            return False

    def get_object_info(self, object_key: str) -> Optional[dict]:
        """
        Возвращает информацию об объекте (размер, ETag, Content-Type).

        Args:
            object_key: путь к объекту в bucket

        Returns:
            Словарь с информацией или None
        """
        try:
            obj = self.client.stat_object(self.bucket_name, object_key)
            return {
                "size": obj.size,
                "etag": obj.etag,
                "content_type": obj.content_type,
                "last_modified": obj.last_modified,
            }
        except S3Error as e:
            logger.error(f"Failed to get info for {object_key}: {e}")
            return None
