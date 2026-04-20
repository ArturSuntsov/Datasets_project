"""
Сервис для управления задачами аннотации.
"""

from bson import ObjectId
from ..models import AnnotationTask, MediaFrame, MediaAsset, CVProject


def get_next_task(project_id: str):
    """
    Получить следующую задачу для разметки.
    """
    try:
        from ..models import MediaAsset, MediaFrame
        
        print(f"🔍 get_next_task for project: {project_id}")
        
        if not ObjectId.is_valid(project_id):
            print(f"❌ Invalid project_id: {project_id}")
            return None
        
        project_obj_id = ObjectId(project_id)
        
        # 1. Получаем все asset_ids проекта
        asset_ids = list(
            MediaAsset.objects(project=project_obj_id).scalar('id')
        )
        print(f"  📦 Found {len(asset_ids)} assets")
        
        if not asset_ids:
            print(f"  ⚠️ No assets found for project")
            return None
        
        # 2. Получаем все frame_ids
        frame_ids = list(
            MediaFrame.objects(asset__in=asset_ids).scalar('id')
        )
        print(f"  🖼️ Found {len(frame_ids)} frames")
        
        if not frame_ids:
            print(f"  ⚠️ No frames found")
            return None
        
        # 3. Ищем pending задачи
        pending_tasks = list(
            AnnotationTask.objects(frame__in=frame_ids, status="pending")
        )
        print(f"  📋 Found {len(pending_tasks)} pending tasks")
        
        # Если есть pending - возвращаем первую
        if pending_tasks:
            task = pending_tasks[0]
            print(f"  ✅ Returning task: {task.id}")
            task.status = "in_progress"
            task.save()
            return task
        
        # Если нет pending, пробуем найти in_progress (может пользователь вернулся)
        in_progress_tasks = list(
            AnnotationTask.objects(frame__in=frame_ids, status="in_progress")
        )
        if in_progress_tasks:
            task = in_progress_tasks[0]
            print(f"  ♻️ Returning in_progress task: {task.id}")
            return task
        
        print(f"  ❌ No tasks found at all")
        return None
        
    except Exception as e:
        print(f"❌ Error getting next task: {e}")
        import traceback
        traceback.print_exc()
        return None


def assign_task(task_id: str, annotator_id: str) -> bool:
    """
    Назначить задачу аннотатору.
    
    Args:
        task_id: ID задачи
        annotator_id: ID аннотатора
    
    Returns:
        True если успешно
    """
    try:
        task = AnnotationTask.objects(id=ObjectId(task_id)).first()
        if not task:
            return False
        
        task.assigned_to = ObjectId(annotator_id)
        task.status = "in_progress"
        task.save()
        return True
    except Exception as e:
        print(f"Error assigning task: {e}")
        return False


def create_tasks_from_frames(project_id: str, frames: list) -> int:
    """
    Создать задачи из фреймов.
    
    Args:
        project_id: ID проекта
        frames: список фреймов или MediaFrame query
    
    Returns:
        Количество созданных задач
    """
    count = 0
    
    try:
        for frame in frames:
            # Проверяем нет ли уже задачи для этого фрейма
            existing = AnnotationTask.objects(frame=frame).first()
            if existing:
                continue
            
            # Создаем задачу
            task = AnnotationTask(
                frame=frame,
                status="pending"
            )
            task.save()
            count += 1
        
    except Exception as e:
        print(f"Error creating tasks: {e}")
    
    return count


def create_tasks_for_project(project_id: str) -> int:
    """
    Создать задачи для всех фреймов проекта.
    
    Args:
        project_id: ID проекта
    
    Returns:
        Количество созданных задач
    """
    try:
        # Получаем все фреймы для проекта
        frames = MediaFrame.objects(asset__project=ObjectId(project_id))
        return create_tasks_from_frames(project_id, frames)
    except Exception as e:
        print(f"Error creating tasks for project: {e}")
        return 0
