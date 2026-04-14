"""
URL маршруты для модуля CV Annotation.
"""

from django.urls import path
from .views import (
    CVProjectCreateView,
    MediaUploadView,
    NextTaskView,
    AnnotationSubmitView,
    ProjectTasksView,
)

# Debug endpoint для проверки
from django.http import JsonResponse
from .models import CVProject, MediaAsset, MediaFrame, AnnotationTask

def debug_stats(request):
    """Показать статистику CV проектов"""
    # Показать типы загруженных файлов
    asset_types = {}
    for asset in MediaAsset.objects.all():
        t = asset.asset_type
        asset_types[t] = asset_types.get(t, 0) + 1
    
    # Список проектов
    projects = []
    for p in CVProject.objects.all():
        # Считаем assets проекта
        asset_count = MediaAsset.objects(project=p).count()
        frame_count = MediaFrame.objects(asset__in=list(MediaAsset.objects(project=p).scalar('id'))).count()
        task_count = AnnotationTask.objects(frame__in=list(MediaFrame.objects(asset__in=list(MediaAsset.objects(project=p).scalar('id'))).scalar('id'))).count()
        
        projects.append({
            "id": str(p.id),
            "title": p.title,
            "type": p.annotation_type,
            "assets": asset_count,
            "frames": frame_count,
            "tasks": task_count,
            "url": f"/projects/{p.id}/annotation"
        })
    
    return JsonResponse({
        "cv_projects_count": CVProject.objects.count(),
        "media_assets": MediaAsset.objects.count(),
        "asset_types": asset_types,
        "media_frames": MediaFrame.objects.count(),
        "annotation_tasks": AnnotationTask.objects.count(),
        "pending_tasks": AnnotationTask.objects(status="pending").count(),
        "projects": projects,
    })


def create_tasks_for_all(request):
    """Создать задачи для всех кадров без задач"""
    frames_without_tasks = set()
    tasks_created = 0
    
    # Получаем все frame_ids которые уже имеют задачи
    frames_with_tasks = set(
        str(fid) for fid in AnnotationTask.objects.scalar('frame') if fid
    )
    
    # Получаем все frames
    for frame in MediaFrame.objects.all():
        frame_id_str = str(frame.id)
        if frame_id_str not in frames_with_tasks:
            try:
                AnnotationTask.objects.create(
                    frame=frame,
                    status="pending"
                )
                tasks_created += 1
            except Exception as e:
                print(f"Error creating task for frame {frame.id}: {e}")
    
    return JsonResponse({
        "tasks_created": tasks_created,
        "total_frames": MediaFrame.objects.count(),
        "total_tasks": AnnotationTask.objects.count(),
    })


def reextract_frames(request):
    """Переизвлечь кадры из всех видео (для исправления frame_url)"""
    from .services.frames import extract_frames, extract_fallback
    import os
    
    reextracted = 0
    errors = 0
    deleted = 0
    
    for asset in MediaAsset.objects.all():
        if asset.asset_type == "video":
            try:
                # Удаляем старые фреймы и задачи
                old_frames = list(MediaFrame.objects(asset=asset))
                for old_frame in old_frames:
                    # Удаляем задачи этого фрейма
                    AnnotationTask.objects(frame=old_frame).delete()
                    # Удаляем файл если существует
                    try:
                        from django.conf import settings
                        old_path = os.path.join(settings.BASE_DIR, old_frame.frame_uri.lstrip('/'))
                        if os.path.exists(old_path):
                            os.remove(old_path)
                    except:
                        pass
                    old_frame.delete()
                    deleted += 1
                
                # Извлекаем заново
                frames_count = extract_fallback(asset)
                reextracted += frames_count
                print(f"✅ Re-extracted {frames_count} frames for {asset.file_name}")
            except Exception as e:
                errors += 1
                print(f"❌ Error re-extracting {asset.id}: {e}")
                import traceback
                traceback.print_exc()
    
    return JsonResponse({
        "deleted_old_frames": deleted,
        "reextracted": reextracted,
        "errors": errors,
        "total_frames": MediaFrame.objects.count(),
    })

urlpatterns = [
    # Debug
    path("cv/debug/", debug_stats, name="cv-debug"),
    path("cv/debug/create-tasks/", create_tasks_for_all, name="cv-create-tasks"),
    path("cv/debug/reextract/", reextract_frames, name="cv-reextract"),
    
    # Создание CV проекта
    path(
        "cv/projects/",
        CVProjectCreateView.as_view(),
        name="cv-project-create",
    ),
    # Загрузка медиафайлов (изображения/видео)
    path(
        "cv/projects/<str:project_id>/upload/",
        MediaUploadView.as_view(),
        name="cv-media-upload",
    ),
    # Получить следующую задачу для разметки
    path(
        "cv/tasks/next/",
        NextTaskView.as_view(),
        name="cv-next-task",
    ),
    # Отправить аннотацию
    path(
        "cv/tasks/<str:task_id>/annotate/",
        AnnotationSubmitView.as_view(),
        name="cv-annotation-submit",
    ),
    # Получить все задачи проекта
    path(
        "cv/projects/<str:project_id>/tasks/",
        ProjectTasksView.as_view(),
        name="cv-project-tasks",
    ),
]
