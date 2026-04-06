"""
Сигналы Django для автоматического удаления файлов из MinIO.
"""

import logging

from django.db.models.signals import pre_delete
from django.dispatch import receiver

from apps.datasets_core.models import Dataset
from .tasks import delete_from_minio

logger = logging.getLogger(__name__)


@receiver(pre_delete, sender=Dataset)
def delete_dataset_file_from_minio(sender, instance, **kwargs):
    """
    При удалении датасета автоматически удаляем файл из MinIO.
    """
    if instance.storage_path:
        logger.info(f"Signal triggered: deleting {instance.storage_path} for dataset {instance.id}")
        # Запускаем асинхронное удаление (не блокируем удаление датасета)
        delete_from_minio.delay(str(instance.id), instance.storage_path)
    else:
        logger.info(f"Dataset {instance.id} has no storage_path, skipping MinIO deletion")
