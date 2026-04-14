"""
Сервис для загрузки и хранения медиафайлов (изображения, видео, текст).
Для MVP используется локальное хранилище.
"""

import os
import uuid
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile


# Директория для хранения медиафайлов
MEDIA_ROOT = getattr(settings, 'MEDIA_ROOT', str(Path(__file__).parent.parent.parent.parent / 'media'))
UPLOAD_DIR = Path(MEDIA_ROOT) / 'uploads'

# Максимальный размер файла (10MB по умолчанию)
MAX_UPLOAD_SIZE = getattr(settings, 'MAX_UPLOAD_SIZE', 10 * 1024 * 1024)

# Разрешенные расширения
ALLOWED_EXTENSIONS = {
    'image': {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'},
    'video': {'.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv'},
    'text': {'.txt', '.csv', '.json', '.xml', '.md'},
}


def get_file_type(filename: str) -> str:
    """Определить тип файла по расширению."""
    ext = Path(filename).suffix.lower()
    
    if ext in ALLOWED_EXTENSIONS['image']:
        return 'image'
    elif ext in ALLOWED_EXTENSIONS['video']:
        return 'video'
    elif ext in ALLOWED_EXTENSIONS['text']:
        return 'text'
    else:
        raise ValueError(f"Unsupported file type: {ext}")


def validate_file(file, file_type: str = None) -> None:
    """Валидация файла."""
    # Проверка размера
    if file.size > MAX_UPLOAD_SIZE:
        max_mb = MAX_UPLOAD_SIZE / (1024 * 1024)
        raise ValueError(f"File too large. Maximum size: {max_mb}MB")
    
    # Проверка типа
    if file_type:
        ext = Path(file.name).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS.get(file_type, set()):
            raise ValueError(f"Invalid file extension: {ext}")


def generate_filename(filename: str) -> str:
    """Сгенерировать уникальное имя файла."""
    ext = Path(filename).suffix.lower()
    unique_id = uuid.uuid4().hex
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    return f"{timestamp}_{unique_id}{ext}"


def handle_upload(file, project_id: str = None, file_type: str = None) -> dict:
    """
    Загрузить файл и вернуть информацию о нем.
    
    Args:
        file: Django File object
        project_id: ID проекта (опционально)
        file_type: Тип файла (image/video/text), определится автоматически если None
    
    Returns:
        dict: {
            'file_uri': str,  # URL/путь к файлу
            'file_name': str,  # Оригинальное имя
            'file_size': int,  # Размер в байтах
            'file_type': str,  # image/video/text
            'mime_type': str,  # MIME тип
        }
    """
    # Определить тип файла
    if not file_type:
        file_type = get_file_type(file.name)
    
    # Валидация
    validate_file(file, file_type)
    
    # Создать директории
    project_dir = UPLOAD_DIR / project_id if project_id else UPLOAD_DIR
    project_dir.mkdir(parents=True, exist_ok=True)
    
    # Сгенерировать имя
    filename = generate_filename(file.name)
    file_path = project_dir / filename
    
    # Сохранить файл
    with open(file_path, 'wb+') as destination:
        for chunk in file.chunks():
            destination.write(chunk)
    
    # Сгенерировать URI (для локального хранилища - относительный путь)
    file_uri = f"/media/uploads/{project_id}/{filename}" if project_id else f"/media/uploads/{filename}"
    
    # Определить MIME тип
    import mimetypes
    mime_type, _ = mimetypes.guess_type(file.name)
    if not mime_type:
        mime_type = 'application/octet-stream'
    
    return {
        'file_uri': file_uri,
        'file_name': file.name,
        'file_size': file.size,
        'file_type': file_type,
        'mime_type': mime_type,
    }


def delete_file(file_uri: str) -> bool:
    """Удалить файл по URI."""
    try:
        # Преобразовать URI в путь
        relative_path = file_uri.replace('/media/', '')
        file_path = Path(settings.BASE_DIR) / relative_path
        
        if file_path.exists():
            file_path.unlink()
            return True
        return False
    except Exception:
        return False


def get_file_path(file_uri: str) -> Path:
    """Получить абсолютный путь к файлу."""
    relative_path = file_uri.replace('/media/', '')
    return Path(settings.BASE_DIR) / relative_path
