"""
Вспомогательные функции для работы с файлами: хеширование, валидация, размер.
"""

import hashlib
import tempfile
import logging
from pathlib import Path
from typing import BinaryIO, Tuple, Optional

logger = logging.getLogger(__name__)


def calculate_file_hash(file_stream: BinaryIO, algorithm: str = "sha256") -> Tuple[str, int]:
    """
    Вычисляет хеш файла и возвращает его размер.

    Args:
        file_stream: открытый файловый поток (должен быть в начале)
        algorithm: алгоритм хеширования ('md5', 'sha256', 'sha1')

    Returns:
        Tuple (хеш_строка, размер_в_байтах)
    """
    hash_func = hashlib.new(algorithm)
    file_size = 0
    chunk_size = 8192  # 8KB chunks

    # Сохраняем позицию, чтобы вернуться после вычисления
    current_pos = file_stream.tell()
    file_stream.seek(0)

    while True:
        chunk = file_stream.read(chunk_size)
        if not chunk:
            break
        hash_func.update(chunk)
        file_size += len(chunk)

    # Возвращаемся на исходную позицию
    file_stream.seek(current_pos)

    hex_digest = hash_func.hexdigest()
    logger.info(f"File hash ({algorithm}): {hex_digest}, size: {file_size} bytes")
    return hex_digest, file_size


def human_readable_size(size_bytes: int) -> str:
    """
    Преобразует размер в байтах в человеко-читаемый формат.

    Examples:
        1024 -> "1.0 KB"
        1048576 -> "1.0 MB"
    """
    if size_bytes == 0:
        return "0 B"

    size_names = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    size = float(size_bytes)

    while size >= 1024.0 and i < len(size_names) - 1:
        size /= 1024.0
        i += 1

    return f"{size:.1f} {size_names[i]}"


def validate_file_extension(filename: str, allowed_extensions: Optional[list] = None) -> bool:
    """
    Проверяет расширение файла.

    Args:
        filename: имя файла
        allowed_extensions: список разрешённых расширений (без точки), например ['csv', 'zip', 'json']

    Returns:
        True если расширение разрешено
    """
    if allowed_extensions is None:
        from django.conf import settings
        allowed_extensions = getattr(settings, 'ALLOWED_DATASET_EXTENSIONS', ['zip', 'csv', 'json', 'parquet'])

    ext = Path(filename).suffix.lower().lstrip('.')
    is_allowed = ext in allowed_extensions

    if not is_allowed:
        logger.warning(f"File {filename} has disallowed extension: {ext}")

    return is_allowed


def validate_file_size(file_size_bytes: int, max_size_mb: int = 1024) -> bool:
    """
    Проверяет размер файла.

    Args:
        file_size_bytes: размер файла в байтах
        max_size_mb: максимальный размер в мегабайтах (по умолчанию 1GB)

    Returns:
        True если размер не превышает лимит
    """
    max_bytes = max_size_mb * 1024 * 1024
    is_valid = file_size_bytes <= max_bytes

    if not is_valid:
        logger.warning(f"File size {file_size_bytes} exceeds limit {max_bytes}")

    return is_valid


def save_uploaded_file_temporarily(uploaded_file) -> str:
    """
    Сохраняет загруженный файл во временную директорию.

    Args:
        uploaded_file: объект файла из Django (request.FILES['file'])

    Returns:
        Путь к временному файлу
    """
    import tempfile

    # Создаём временный файл с суффиксом оригинального расширения
    suffix = Path(uploaded_file.name).suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        for chunk in uploaded_file.chunks():
            tmp_file.write(chunk)
        tmp_path = tmp_file.name

    logger.info(f"Temporary file saved: {tmp_path}")
    return tmp_path


def cleanup_temp_file(file_path: str):
    """
    Удаляет временный файл.

    Args:
        file_path: путь к файлу
    """
    import os
    try:
        if os.path.exists(file_path):
            os.unlink(file_path)
            logger.info(f"Temporary file deleted: {file_path}")
    except Exception as e:
        logger.error(f"Failed to delete temp file {file_path}: {e}")
