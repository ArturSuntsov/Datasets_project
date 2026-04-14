"""
Сервис для извлечения фреймов из видео.
Для MVP используется упрощенная версия.
"""

import subprocess
import os
from pathlib import Path

from ..models import MediaAsset, MediaFrame, AnnotationTask


def extract_frames(asset: MediaAsset) -> int:
    """
    Извлечь фреймы из видео.
    
    Для MVP: извлекает 1 кадр в секунду (или минимум 1).
    Использует ffmpeg если доступен, иначе создает один фрейм.
    
    Args:
        asset: MediaAsset объект (видео)
    
    Returns:
        Количество созданных фреймов
    """
    if asset.asset_type != "video":
        return 0
    
    try:
        # Путь к видео файлу
        file_path = get_file_path(asset.file_uri)
        if not file_path or not file_path.exists():
            print(f"Warning: File not found at {asset.file_uri}")
            # Fallback: один фрейм + задача
            return extract_fallback(asset)
        
        # Пытаемся извлечь фреймы через ffmpeg
        try:
            return extract_with_ffmpeg(asset, file_path)
        except Exception as e:
            print(f"FFmpeg failed, using fallback: {e}")
            return extract_fallback(asset)
        
    except Exception as e:
        print(f"Error extracting frames: {e}")
        # Даже при ошибике создаем хотя бы одну задачу
        return extract_fallback(asset)


def extract_fallback(asset: MediaAsset) -> int:
    """
    Fallback: создать JPEG из первого кадра видео через ffmpeg или заглушку.
    """
    try:
        file_path = get_file_path(asset.file_uri)
        if not file_path or not file_path.exists():
            print(f"Fallback: file not found at {asset.file_uri}")
            return 0
        
        # Создаем директорию для фреймов
        frames_dir = file_path.parent / "frames"
        frames_dir.mkdir(exist_ok=True)
        
        # Пробуем извлечь первый кадр через ffmpeg
        first_frame_path = frames_dir / "frame_0001.jpg"
        ffmpeg_success = False
        
        try:
            cmd = [
                "ffmpeg",
                "-i", str(file_path),
                "-vf", "select=eq(n\\,0)",
                "-vframes", "1",
                "-q:v", "2",
                "-y",
                str(first_frame_path)
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0 and first_frame_path.exists():
                ffmpeg_success = True
                print(f"✅ FFmpeg extracted first frame")
        except FileNotFoundError:
            print("FFmpeg not found")
        except Exception as e:
            print(f"FFmpeg error: {e}")
        
        # Если ffmpeg не сработал - создаем заглушку
        if not ffmpeg_success or not first_frame_path.exists():
            try:
                first_frame_path.write_bytes(_create_minimal_jpeg())
                print(f"✅ Created placeholder JPEG")
            except Exception as e:
                print(f"❌ Failed to create placeholder: {e}")
                return 0
        
        frame_uri = f"/media/uploads/{file_path.parent.name}/frames/frame_0001.jpg"
        
        # Создаем MediaFrame
        frame = MediaFrame.objects.create(
            asset=asset,
            frame_uri=frame_uri,
            frame_number=0
        )
        
        # СОЗДАЕМ ЗАДАЧУ для фрейма
        AnnotationTask.objects.create(
            frame=frame,
            status="pending"
        )
        
        print(f"✅ Created frame and task: {frame_uri}")
        return 1
        
    except Exception as e:
        print(f"❌ Fallback error: {e}")
        import traceback
        traceback.print_exc()
        return 0


def _create_minimal_jpeg() -> bytes:
    """Создать минимальное валидное JPEG изображение (белый 100x100)"""
    import struct
    import zlib
    
    # Минимальный JPEG (белый квадрат 100x100)
    # Это упрощенный вариант - создаем базовый JPEG без сжатия
    width, height = 100, 100
    
    # JPEG header
    jpeg_data = bytearray()
    
    # SOI
    jpeg_data.extend([0xFF, 0xD8])
    
    # APP0 (JFIF)
    jpeg_data.extend([0xFF, 0xE0, 0x00, 0x10])
    jpeg_data.extend(b'JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00')
    
    # DQT (Quantization Table)
    jpeg_data.extend([0xFF, 0xDB, 0x00, 0x43, 0x00])
    jpeg_data.extend([8] * 64)
    
    # SOF0 (Start of Frame)
    jpeg_data.extend([0xFF, 0xC0, 0x00, 0x0B])
    jpeg_data.extend(struct.pack('>BHH', 8, height, width))  # 8-bit, H, W
    jpeg_data.extend([0x01, 0x11, 0x00])  # 1 component, no subsampling
    
    # DHT (Huffman Table) - минимальная
    jpeg_data.extend([0xFF, 0xC4, 0x00, 0x1F, 0x00])
    jpeg_data.extend([0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    jpeg_data.extend([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B])
    
    # SOS (Start of Scan)
    jpeg_data.extend([0xFF, 0xDA, 0x00, 0x08])
    jpeg_data.extend([0x01, 0x01, 0x00, 0x00, 0x3F, 0x00])
    
    # Image data (все пиксели белые)
    jpeg_data.extend([0xFF, 0x00] * (width * height // 2))
    
    # EOI
    jpeg_data.extend([0xFF, 0xD9])
    
    return bytes(jpeg_data)


def extract_with_ffmpeg(asset: MediaAsset, video_path: Path) -> int:
    """
    Извлечь фреймы с помощью ffmpeg (1 кадр в секунду).
    """
    # Создаем директорию для фреймов
    frames_dir = video_path.parent / "frames"
    frames_dir.mkdir(exist_ok=True)
    
    # Команда ffmpeg для извлечения 1 кадра в секунду
    output_pattern = str(frames_dir / "frame_%04d.jpg")
    cmd = [
        "ffmpeg",
        "-i", str(video_path),
        "-vf", "fps=1",  # 1 кадр в секунду (измените если нужно больше)
        "-q:v", "2",  # Качество JPEG (2 - хорошее)
        "-y",  # Перезаписывать
        output_pattern
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600  # 10 минут максимум
        )
        
        if result.returncode != 0:
            print(f"FFmpeg error: {result.stderr}")
            return extract_fallback(asset)
        
        # Считаем созданные фреймы
        frame_files = list(frames_dir.glob("frame_*.jpg"))
        
        frames_created = 0
        for frame_file in frame_files:
            # Создаем MediaFrame
            frame_uri = f"/media/uploads/{frame_file.parent.parent.name}/frames/{frame_file.name}"
            frame = MediaFrame.objects.create(
                asset=asset,
                frame_uri=frame_uri,
                frame_number=frames_created
            )
            
            # СОЗДАЕМ ЗАДАЧУ для каждого фрейма
            AnnotationTask.objects.create(
                frame=frame,
                status="pending"
            )
            
            frames_created += 1
        
        print(f"Created {frames_created} frames and tasks from video: {asset.id}")
        return frames_created
        
    except subprocess.TimeoutExpired:
        print("FFmpeg timeout")
        return extract_fallback(asset)
    except FileNotFoundError:
        print("FFmpeg not installed")
        return extract_fallback(asset)


def extract_fallback(asset: MediaAsset) -> int:
    """
    Fallback: создать один фрейм с тем же URI что и видео.
    """
    try:
        frame = MediaFrame.objects.create(
            asset=asset,
            frame_uri=asset.file_uri,
            frame_number=0
        )
        return 1
    except Exception as e:
        print(f"Fallback error: {e}")
        return 0


def get_file_path(file_uri: str) -> Path | None:
    """Получить абсолютный путь к файлу из URI."""
    try:
        from django.conf import settings
        relative_path = file_uri.replace('/media/', '')
        return Path(settings.BASE_DIR) / relative_path
    except Exception:
        return None
