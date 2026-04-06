"""
Data Lake модуль для хранения файлов датасетов в MinIO.
"""

from .storage import MinIOClient
from .tasks import upload_dataset_to_minio, delete_from_minio

__all__ = ["MinIOClient", "upload_dataset_to_minio", "delete_from_minio"]