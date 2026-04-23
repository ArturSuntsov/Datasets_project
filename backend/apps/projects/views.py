from __future__ import annotations

from datetime import datetime
import csv
import io
import secrets

from bson import ObjectId
from django.http import HttpRequest
from mongoengine import Q
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from ..datasets_core.models import Dataset
from ..labeling.models import Annotation, LabelingSession
from ..labeling.serializers import AnnotationSerializer
from ..users.models import User
from ..users.views import authenticate_from_jwt
from .models import Project, ProjectMembership, Task
from .serializers import ProjectSerializer, TaskSerializer
from .services.instructions_upload import InstructionUploadError, save_project_instruction

PAGE_SIZE = 20


class JWTRequiredMixin:
    permission_classes = [permissions.AllowAny]

    def _get_user(self, request: HttpRequest):
        try:
            user = authenticate_from_jwt(request)
            request.user = user
            return user
        except PermissionError:
            return None

    def _require_user(self, request: HttpRequest):
        user = self._get_user(request)
        if not user:
            return None, Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        return user, None


class ProjectViewSet(JWTRequiredMixin, ViewSet):
    def get_queryset_for_user(self, user: User):
        if user.role in (User.ROLE_ADMIN,):
            return Project.objects.order_by("-created_at")
        if user.role == User.ROLE_CUSTOMER:
            return Project.objects(owner=user).order_by("-created_at")
        accessible_ids = list(
            ProjectMembership.objects(user=user, is_active=True).scalar("project")
        )
        return Project.objects(id__in=accessible_ids).order_by("-created_at")

    def _paginate(self, qs, request):
        try:
            limit = int(request.query_params.get("limit", PAGE_SIZE))
        except ValueError:
            limit = PAGE_SIZE
        limit = max(1, min(limit, 100))
        try:
            offset = int(request.query_params.get("offset", 0))
        except ValueError:
            offset = 0
        total = qs.count()
        items = list(qs.skip(offset).limit(limit))
        return items, {"limit": limit, "offset": offset, "total": total}

    def list(self, request, *args, **kwargs) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp
        qs = self.get_queryset_for_user(user)
        items, meta = self._paginate(qs, request)
        serializer = ProjectSerializer(items, many=True, context={"request": request})
        return Response({"items": serializer.data, **meta}, status=status.HTTP_200_OK)

    def create(self, request, *args, **kwargs) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp
        if user.role not in (User.ROLE_CUSTOMER, User.ROLE_ADMIN):
            return Response({"detail": "Only customers can create projects"}, status=status.HTTP_403_FORBIDDEN)
        serializer = ProjectSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        project = serializer.create(serializer.validated_data)
        return Response(ProjectSerializer(project, context={"request": request}).data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk: str = None, *args, **kwargs) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp
        if not ObjectId.is_valid(pk):
            return Response({"detail": "Invalid id"}, status=status.HTTP_400_BAD_REQUEST)
        project = self.get_queryset_for_user(user).filter(id=ObjectId(pk)).first()
        if not project:
            return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(ProjectSerializer(project, context={"request": request}).data, status=status.HTTP_200_OK)

    def update(self, request, pk: str = None, *args, **kwargs) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp
        project = Project.objects(id=ObjectId(pk), owner=user).first()
        if not project and user.role != User.ROLE_ADMIN:
            return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if user.role == User.ROLE_ADMIN and not project:
            project = Project.objects(id=ObjectId(pk)).first()
        serializer = ProjectSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        updated = serializer.update(project, serializer.validated_data)
        return Response(ProjectSerializer(updated, context={"request": request}).data, status=status.HTTP_200_OK)

    def partial_update(self, request, pk: str = None, *args, **kwargs) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp
        project = Project.objects(id=ObjectId(pk), owner=user).first()
        if not project and user.role != User.ROLE_ADMIN:
            return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if user.role == User.ROLE_ADMIN and not project:
            project = Project.objects(id=ObjectId(pk)).first()
        serializer = ProjectSerializer(project, data=request.data, context={"request": request}, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.update(project, serializer.validated_data)
        return Response(ProjectSerializer(updated, context={"request": request}).data, status=status.HTTP_200_OK)

    def destroy(self, request, pk: str = None, *args, **kwargs) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp
        project = Project.objects(id=ObjectId(pk), owner=user).first()
        if not project and user.role != User.ROLE_ADMIN:
            return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if user.role == User.ROLE_ADMIN and not project:
            project = Project.objects(id=ObjectId(pk)).first()
        if not project:
            return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        project.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="instructions/upload")
    def instructions_upload(self, request, pk: str = None, *args, **kwargs) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp
        if not ObjectId.is_valid(pk):
            return Response({"detail": "Invalid project id"}, status=status.HTTP_400_BAD_REQUEST)

        project = None
        if user.role == User.ROLE_ADMIN:
            project = Project.objects(id=ObjectId(pk)).first()
        else:
            project = Project.objects(id=ObjectId(pk), owner=user).first()

        if not project:
            return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        if user.role not in (User.ROLE_CUSTOMER, User.ROLE_ADMIN):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        if "file" not in request.FILES:
            return Response({"detail": "file is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payload, _path = save_project_instruction(request.FILES["file"], str(project.id))
        except InstructionUploadError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        project.instructions_file_uri = payload["file_uri"]
        project.instructions_file_name = payload["file_name"]
        project.instructions_version = int(project.instructions_version or 0) + 1
        project.instructions_updated_at = datetime.utcnow()
        project.save()

        return Response(
            {
                "instructions_file_uri": project.instructions_file_uri,
                "instructions_file_name": project.instructions_file_name,
                "instructions_version": project.instructions_version,
                "instructions_updated_at": project.instructions_updated_at,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get"], url_path="tasks/next")
    def tasks_next(self, request, pk: str = None, *args, **kwargs) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp
        if not ObjectId.is_valid(pk):
            return Response({"detail": "Invalid project id"}, status=status.HTTP_400_BAD_REQUEST)
        project = self.get_queryset_for_user(user).filter(id=ObjectId(pk)).first()
        if not project:
            return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if user.role == User.ROLE_ANNOTATOR:
            task = Task.objects(project=project, status=Task.STATUS_PENDING).filter(
                Q(annotator=None) | Q(annotator=user)
            ).order_by("-difficulty_score", "created_at").first()
        else:
            task = Task.objects(project=project, status=Task.STATUS_PENDING).order_by("-difficulty_score", "created_at").first()
        if not task:
            return Response({"detail": "No pending tasks available"}, status=status.HTTP_404_NOT_FOUND)
        return Response(TaskSerializer(task, context={"request": request}).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="participants/import-csv")
    def participants_import_csv(self, request, pk: str = None, *args, **kwargs) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp
        if user.role not in (User.ROLE_CUSTOMER, User.ROLE_ADMIN):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        if not ObjectId.is_valid(pk):
            return Response({"detail": "Invalid project id"}, status=status.HTTP_400_BAD_REQUEST)
        project = Project.objects(id=ObjectId(pk), owner=user).first() if user.role != User.ROLE_ADMIN else Project.objects(id=ObjectId(pk)).first()
        if not project:
            return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if "file" not in request.FILES:
            return Response({"detail": "file is required"}, status=status.HTTP_400_BAD_REQUEST)
        raw_data = request.FILES["file"].read()
        try:
            text = raw_data.decode("utf-8-sig")
        except Exception:
            return Response({"detail": "CSV must be utf-8 encoded"}, status=status.HTTP_400_BAD_REQUEST)
        reader = csv.DictReader(io.StringIO(text))
        required_fields = {"email", "username", "role"}
        if not required_fields.issubset(set(reader.fieldnames or [])):
            return Response({"detail": "CSV must include email, username, role"}, status=status.HTTP_400_BAD_REQUEST)
        created = 0
        linked = 0
        skipped = 0
        for row in reader:
            email = (row.get("email") or "").strip().lower()
            username = (row.get("username") or "").strip()
            role = (row.get("role") or "").strip().lower()
            group_name = (row.get("group") or row.get("group_name") or "").strip()
            specialization = (row.get("specialization") or "").strip()
            if role not in (User.ROLE_ANNOTATOR, User.ROLE_REVIEWER) or not email or not username:
                skipped += 1
                continue
            participant = User.objects(email=email).first()
            if not participant:
                participant = User(email=email, username=username, role=role, group_name=group_name, specialization=specialization)
                participant.set_password(secrets.token_urlsafe(12))
                participant.save()
                created += 1
            membership_role = ProjectMembership.ROLE_ANNOTATOR if role == User.ROLE_ANNOTATOR else ProjectMembership.ROLE_REVIEWER
            membership = ProjectMembership.objects(project=project, user=participant, role=membership_role).first()
            if not membership:
                membership = ProjectMembership(project=project, user=participant, role=membership_role)
                linked += 1
            membership.group_name = group_name or membership.group_name
            membership.specialization = specialization or membership.specialization
            membership.is_active = True
            membership.save()
        return Response({"created_users": created, "linked_memberships": linked, "skipped_rows": skipped}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="assignments/manual-distribute")
    def assignments_manual_distribute(self, request, pk: str = None, *args, **kwargs) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp
        if user.role not in (User.ROLE_CUSTOMER, User.ROLE_ADMIN):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        if not ObjectId.is_valid(pk):
            return Response({"detail": "Invalid project id"}, status=status.HTTP_400_BAD_REQUEST)
        project = Project.objects(id=ObjectId(pk), owner=user).first() if user.role != User.ROLE_ADMIN else Project.objects(id=ObjectId(pk)).first()
        if not project:
            return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        annotator_ids = request.data.get("annotator_ids") or []
        max_items = int(request.data.get("max_items", 50))
        if not isinstance(annotator_ids, list) or not annotator_ids:
            return Response({"detail": "annotator_ids must be a non-empty list"}, status=status.HTTP_400_BAD_REQUEST)
        from apps.cv_annotation.models import Assignment, WorkItem

        annotators = []
        allowed_ids = {str(item.id) for item in (project.allowed_annotators or [])}
        for raw_id in annotator_ids:
            if ObjectId.is_valid(raw_id):
                participant = User.objects(id=ObjectId(raw_id), role=User.ROLE_ANNOTATOR, is_active=True).first()
                if participant and (not allowed_ids or str(participant.id) in allowed_ids):
                    annotators.append(participant)
        if not annotators:
            return Response({"detail": "No valid annotators found"}, status=status.HTTP_400_BAD_REQUEST)

        pending_items = list(WorkItem.objects(project=project, status=WorkItem.STATUS_PENDING).limit(max_items))
        created_assignments = 0
        pointer = 0
        for work_item in pending_items:
            annotator = annotators[pointer % len(annotators)]
            pointer += 1
            membership = ProjectMembership.objects(
                project=project,
                user=annotator,
                role=ProjectMembership.ROLE_ANNOTATOR,
            ).first()
            if not membership:
                membership = ProjectMembership(
                    project=project,
                    user=annotator,
                    role=ProjectMembership.ROLE_ANNOTATOR,
                )
            membership.is_active = True
            membership.specialization = annotator.specialization
            membership.group_name = annotator.group_name
            membership.save()
            exists = Assignment.objects(project=project, work_item=work_item, annotator=annotator).first()
            if exists:
                continue
            next_order = Assignment.objects(project=project, work_item=work_item).count()
            Assignment(project=project, work_item=work_item, annotator=annotator, status=Assignment.STATUS_ASSIGNED, order_index=next_order).save()
            created_assignments += 1
        return Response({"work_items_considered": len(pending_items), "assignments_created": created_assignments}, status=status.HTTP_200_OK)


class TaskViewSet(JWTRequiredMixin, ViewSet):
    def _base_qs(self, user: User):
        if user.role == User.ROLE_ADMIN:
            return Task.objects.order_by("-created_at")
        if user.role == User.ROLE_ANNOTATOR:
            return Task.objects(annotator=user).order_by("-created_at")
        user_dataset_ids = list(Dataset.objects(owner=user).scalar("id"))
        if not user_dataset_ids:
            return Task.objects(status="does_not_exist")
        return Task.objects(dataset__in=user_dataset_ids).order_by("-created_at")

    def _paginate(self, qs, request):
        try:
            limit = int(request.query_params.get("limit", PAGE_SIZE))
        except ValueError:
            limit = PAGE_SIZE
        limit = max(1, min(limit, 100))
        try:
            offset = int(request.query_params.get("offset", 0))
        except ValueError:
            offset = 0
        total = qs.count()
        items = list(qs.skip(offset).limit(limit))
        return items, {"limit": limit, "offset": offset, "total": total}

    def list(self, request, *args, **kwargs) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp
        qs = self._base_qs(user)
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        if not status_filter:
            qs = qs.order_by("-difficulty_score", "-created_at")
        items, meta = self._paginate(qs, request)
        serializer = TaskSerializer(items, many=True, context={"request": request})
        return Response({"items": serializer.data, **meta}, status=status.HTTP_200_OK)

    def create(self, request, *args, **kwargs) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp
        serializer = TaskSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        task = serializer.create(serializer.validated_data)
        return Response(TaskSerializer(task, context={"request": request}).data, status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk: str = None, *args, **kwargs) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp
        if not ObjectId.is_valid(pk):
            return Response({"detail": "Invalid id"}, status=status.HTTP_400_BAD_REQUEST)
        task = self._base_qs(user).filter(id=ObjectId(pk)).first()
        if not task:
            return Response({"detail": "Task not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(TaskSerializer(task, context={"request": request}).data, status=status.HTTP_200_OK)

    def update(self, request, pk: str = None, *args, **kwargs) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp
        task = self._base_qs(user).filter(id=ObjectId(pk)).first()
        if not task:
            return Response({"detail": "Task not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = TaskSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        updated = serializer.update(task, serializer.validated_data)
        return Response(TaskSerializer(updated, context={"request": request}).data, status=status.HTTP_200_OK)

    def partial_update(self, request, pk: str = None, *args, **kwargs) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp
        task = self._base_qs(user).filter(id=ObjectId(pk)).first()
        if not task:
            return Response({"detail": "Task not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = TaskSerializer(task, data=request.data, context={"request": request}, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = serializer.update(task, serializer.validated_data)
        return Response(TaskSerializer(updated, context={"request": request}).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["patch"], url_path="annotate")
    def annotate(self, request, pk: str = None, *args, **kwargs) -> Response:
        user, resp = self._require_user(request)
        if resp:
            return resp
        if not ObjectId.is_valid(pk):
            return Response({"detail": "Invalid task id"}, status=status.HTTP_400_BAD_REQUEST)
        task = Task.objects(id=ObjectId(pk)).first()
        if not task:
            return Response({"detail": "Task not found"}, status=status.HTTP_404_NOT_FOUND)
        if user.role != User.ROLE_ANNOTATOR:
            return Response({"detail": "Forbidden: only annotator"}, status=status.HTTP_403_FORBIDDEN)
        if task.annotator and str(task.annotator.id) != str(user.id):
            return Response({"detail": "Task is assigned to another annotator"}, status=status.HTTP_403_FORBIDDEN)
        if task.project and task.project.project_type == Project.TYPE_CV:
            return Response(
                {"detail": "CV projects use /api/annotator/assignments/{assignment_id}/submit/ workflow"},
                status=status.HTTP_409_CONFLICT,
            )

        session = LabelingSession.objects(task=task, annotator=user, status=LabelingSession.STATUS_ACTIVE).first()
        if not session:
            session = LabelingSession(annotator=user, task=task, dataset=task.dataset, status=LabelingSession.STATUS_ACTIVE)
            session.save()

        data = dict(request.data)
        data["task_id"] = str(task.id)
        data["dataset_id"] = str(task.dataset.id)
        data["session_id"] = str(session.id)

        serializer = AnnotationSerializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        annotation = serializer.create(serializer.validated_data)

        if annotation.is_final or annotation.status == Annotation.STATUS_PENDING_REVIEW:
            if task.status in (Task.STATUS_IN_PROGRESS, Task.STATUS_PENDING):
                task.status = Task.STATUS_REVIEW
                task.save()

        return Response(serializer.to_representation(annotation), status=status.HTTP_201_CREATED)
