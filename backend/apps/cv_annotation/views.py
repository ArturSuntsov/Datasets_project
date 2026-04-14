from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from bson import ObjectId
from django.http import JsonResponse

from .models import CVProject, MediaAsset, MediaFrame, AnnotationTask, Annotation

from .serializers import (
    CVProjectSerializer,
    MediaUploadResponseSerializer,
    AnnotationTaskSerializer,
    AnnotationSubmitSerializer,
    NextTaskResponseSerializer,
    AnnotationResponseSerializer
)

from .services.upload import handle_upload
from .services.tasks import get_next_task, assign_task
from .services.frames import extract_frames


# Create your views here.
class CVProjectCreateView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = CVProjectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Для MVP: создаем проект без owner (или с dummy owner если нужно)
        # В production: owner = request.user
        project = CVProject.objects.create(
            title=serializer.validated_data["title"],
            description=serializer.validated_data.get("description", ""),
            annotation_type=serializer.validated_data["annotation_type"],
            # owner=owner  # Раскомментировать когда будет аутентификация
        )

        return Response({
            "id": str(project.id),
            "title": project.title,
            "annotation_type": project.annotation_type
        }, status=status.HTTP_201_CREATED)


class MediaUploadView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, project_id):
        if "file" not in request.FILES:
            return Response(
                {"error": "No file provided"},
                status=status.HTTP_400_BAD_REQUEST
            )

        file = request.FILES["file"]
        
        try:
            # Проверяем что проект существует
            if not ObjectId.is_valid(project_id):
                return Response(
                    {"error": f"Invalid project ID: {project_id}"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            project = CVProject.objects(id=ObjectId(project_id)).first()
            if not project:
                return Response(
                    {"error": f"Project not found: {project_id}"},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Сохраняем файл
            result = handle_upload(file, project_id=project_id)
            
            # Создать MediaAsset
            asset = MediaAsset.objects.create(
                project=project,  # ReferenceField требует объект
                file_uri=result['file_uri'],
                file_name=result['file_name'],
                file_size=result['file_size'],
                asset_type=result['file_type'],
                mime_type=result['mime_type']
            )

            frames_created = 0
            
            # Если изображение - создаем один фрейм
            if asset.asset_type == "image":
                frame = MediaFrame.objects.create(
                    asset=asset,
                    frame_uri=asset.file_uri,
                    frame_number=0
                )
                
                # Создаем задачу для фрейма
                AnnotationTask.objects.create(
                    frame=frame,
                    status="pending"
                )
                
                frames_created = 1
            
            # Если видео - извлекаем фреймы (для MVP один фрейм)
            elif asset.asset_type == "video":
                try:
                    frames_created = extract_frames(asset)
                    print(f"✅ Video upload: created {frames_created} frames/tasks")
                except Exception as e:
                    print(f"⚠️ extract_frames failed: {e}")
                    # Fallback: создаем один кадр вручную
                    try:
                        from .models import AnnotationTask
                        frame = MediaFrame.objects.create(
                            asset=asset,
                            frame_uri=asset.file_uri,
                            frame_number=0
                        )
                        AnnotationTask.objects.create(
                            frame=frame,
                            status="pending"
                        )
                        frames_created = 1
                        print(f"✅ Fallback: created 1 frame/task for video")
                    except Exception as e2:
                        print(f"❌ Fallback also failed: {e2}")

            return Response({
                "asset_id": str(asset.id),
                "file_uri": result['file_uri'],
                "file_name": result['file_name'],
                "file_type": result['file_type'],
                "file_size": result['file_size'],
                "frames_created": frames_created
            }, status=status.HTTP_201_CREATED)
            
        except ValueError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {"error": f"Upload failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class NextTaskView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        project_id = request.query_params.get("project_id")

        if not project_id:
            return Response(
                {"error": "project_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        task = get_next_task(project_id)

        if not task:
            return Response(
                {"detail": "no pending tasks available"},
                status=status.HTTP_404_NOT_FOUND
            )

        # Получаем URL фрейма
        frame_url = None
        annotation_type = "bbox"
        
        try:
            if task.frame:
                frame_url = task.frame.frame_uri
                if task.frame.asset:
                    annotation_type = task.frame.asset.project.annotation_type
        except Exception as e:
            print(f"Error getting frame URL: {e}")

        return Response({
            "task_id": str(task.id),
            "frame_url": frame_url,
            "annotation_type": annotation_type,
            "suggested_data": {}
        }, status=status.HTTP_200_OK)


class AnnotationSubmitView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, task_id):
        serializer = AnnotationSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            task = AnnotationTask.objects.get(id=task_id)
        except AnnotationTask.DoesNotExist:
            return Response(
                {"error": "Task not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        # Для MVP: annotator не требуется (будет добавлено позже)
        annotation = Annotation.objects.create(
            task=task,
            # annotator=None,  # Временно без аннотатора
            data=serializer.validated_data
        )

        task.status = "done"
        task.save()

        return Response({
            "annotation_id": str(annotation.id),
            "status": "saved"
        }, status=status.HTTP_201_CREATED)


class ProjectTasksView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, project_id):
        try:
            if not ObjectId.is_valid(project_id):
                return Response(
                    {"error": f"Invalid project ID: {project_id}"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # MongoDB не поддерживает JOIN!
            # 1. Получаем все MediaAssets проекта
            # 2. Получаем все MediaFrames этих assets
            # 3. Получаем все AnnotationTasks этих frames
            
            asset_ids = list(
                MediaAsset.objects(project=ObjectId(project_id)).scalar('id')
            )
            
            if not asset_ids:
                return Response([], status=status.HTTP_200_OK)
            
            frame_ids = list(
                MediaFrame.objects(asset__in=asset_ids).scalar('id')
            )
            
            if not frame_ids:
                return Response([], status=status.HTTP_200_OK)
            
            tasks = AnnotationTask.objects(frame__in=frame_ids)

            data = []
            for t in tasks:
                try:
                    frame_url = None
                    if t.frame:
                        frame_url = t.frame.frame_uri
                    
                    data.append({
                        "task_id": str(t.id),
                        "status": t.status,
                        "frame_url": frame_url
                    })
                except Exception as e:
                    print(f"Error processing task {t.id}: {e}")
                    data.append({
                        "task_id": str(t.id),
                        "status": t.status,
                        "frame_url": None
                    })

            return Response(data, status=status.HTTP_200_OK)
            
        except Exception as e:
            print(f"ProjectTasksView error: {e}")
            import traceback
            traceback.print_exc()
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
