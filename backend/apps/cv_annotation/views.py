from __future__ import annotations

from bson import ObjectId
from django.http import HttpRequest
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.projects.models import Project, ProjectMembership
from apps.users.models import User
from apps.users.views import authenticate_from_jwt
from .models import Assignment, ImportAsset, ImportSession, ReviewRecord, WorkAnnotation, WorkItem
from .serializers import AssignmentSubmitSerializer, ImportFinalizeSerializer, ReviewResolveSerializer
from .services.upload import save_project_file
from .services.workflow import (
    build_coco_export,
    build_import_preview,
    create_work_items_for_import,
    process_import_asset,
    project_overview,
    resolve_review,
    save_assignment_annotation,
)


class AuthenticatedAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def get_user(self, request: HttpRequest) -> User:
        user = authenticate_from_jwt(request)
        request.user = user
        return user

    def get_project_for_user(self, user: User, project_id: str, require_owner: bool = False) -> Project | None:
        if not ObjectId.is_valid(project_id):
            return None
        project = Project.objects(id=ObjectId(project_id)).first()
        if not project:
            return None
        if user.role == User.ROLE_ADMIN:
            return project
        if require_owner:
            return project if str(project.owner.id) == str(user.id) else None
        if str(project.owner.id) == str(user.id):
            return project
        membership = ProjectMembership.objects(project=project, user=user, is_active=True).first()
        return project if membership else None


class ProjectImportView(AuthenticatedAPIView):
    def post(self, request, project_id: str):
        try:
            user = self.get_user(request)
        except PermissionError:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)

        project = self.get_project_for_user(user, project_id, require_owner=True)
        if not project:
            return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if "file" not in request.FILES:
            return Response({"detail": "file is required"}, status=status.HTTP_400_BAD_REQUEST)

        import_session_id = request.data.get("import_id")
        import_session = None
        if import_session_id and ObjectId.is_valid(import_session_id):
            import_session = ImportSession.objects(id=ObjectId(import_session_id), project=project).first()
        if not import_session or import_session.status in (ImportSession.STATUS_FINALIZED, ImportSession.STATUS_FAILED):
            import_session = ImportSession(project=project, created_by=user)
            import_session.save()

        try:
            payload = save_project_file(request.FILES["file"], str(project.id), str(import_session.id))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        asset = ImportAsset(
            import_session=import_session,
            project=project,
            file_uri=payload["file_uri"],
            file_name=payload["file_name"],
            file_size=int(payload["file_size"]),
            mime_type=payload["mime_type"],
            asset_type=payload["asset_type"],
        )
        asset.save()
        processed = process_import_asset(asset, project.frame_interval_sec)
        preview = build_import_preview(import_session)
        import_session.preview = preview
        import_session.summary = {
            "last_asset_id": str(processed.id),
            "assets_processed": preview["assets_processed"],
            "assets_failed": preview["assets_failed"],
            "frames_total": preview["frames_total"],
        }
        import_session.status = ImportSession.STATUS_READY if preview["assets_processed"] > 0 else ImportSession.STATUS_FAILED
        import_session.errors = preview.get("errors", [])
        import_session.save()

        return Response(
            {
                "import_id": str(import_session.id),
                "asset_id": str(processed.id),
                "asset_status": processed.processing_status,
                "error_message": processed.error_message,
                "preview": preview,
            },
            status=status.HTTP_201_CREATED,
        )


class ProjectImportFinalizeView(AuthenticatedAPIView):
    def post(self, request, project_id: str, import_id: str):
        try:
            user = self.get_user(request)
        except PermissionError:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        project = self.get_project_for_user(user, project_id, require_owner=True)
        if not project:
            return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if not ObjectId.is_valid(import_id):
            return Response({"detail": "Invalid import id"}, status=status.HTTP_400_BAD_REQUEST)
        import_session = ImportSession.objects(id=ObjectId(import_id), project=project).first()
        if not import_session:
            return Response({"detail": "Import session not found"}, status=status.HTTP_404_NOT_FOUND)
        summary = create_work_items_for_import(import_session)
        return Response(
            {
                "import_id": str(import_session.id),
                "status": import_session.status,
                "summary": summary,
                "overview": project_overview(project),
            },
            status=status.HTTP_200_OK,
        )


class ProjectOverviewView(AuthenticatedAPIView):
    def get(self, request, project_id: str):
        try:
            user = self.get_user(request)
        except PermissionError:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        project = self.get_project_for_user(user, project_id)
        if not project:
            return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(project_overview(project), status=status.HTTP_200_OK)


class ProjectExportView(AuthenticatedAPIView):
    def get(self, request, project_id: str):
        try:
            user = self.get_user(request)
        except PermissionError:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        project = self.get_project_for_user(user, project_id, require_owner=True)
        if not project:
            return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(build_coco_export(project), status=status.HTTP_200_OK)


class AnnotatorQueueView(AuthenticatedAPIView):
    def get(self, request):
        try:
            user = self.get_user(request)
        except PermissionError:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        if user.role not in (User.ROLE_ANNOTATOR, User.ROLE_ADMIN):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        assignments = Assignment.objects(annotator=user).order_by("status", "created_at") if user.role == User.ROLE_ANNOTATOR else Assignment.objects.order_by("status", "created_at")
        items = []
        for assignment in assignments:
            project = assignment.project
            frame = assignment.work_item.frame
            items.append(
                {
                    "assignment_id": str(assignment.id),
                    "project_id": str(project.id),
                    "project_title": project.title,
                    "work_item_id": str(assignment.work_item.id),
                    "frame_url": frame.frame_uri,
                    "status": assignment.status,
                    "instruction": project.instructions,
                    "label_schema": project.label_schema or [],
                    "created_at": assignment.created_at,
                }
            )
        return Response({"items": items}, status=status.HTTP_200_OK)


class AnnotatorAssignmentDetailView(AuthenticatedAPIView):
    def get(self, request, assignment_id: str):
        try:
            user = self.get_user(request)
        except PermissionError:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        if not ObjectId.is_valid(assignment_id):
            return Response({"detail": "Invalid assignment id"}, status=status.HTTP_400_BAD_REQUEST)
        assignment = Assignment.objects(id=ObjectId(assignment_id)).first()
        if not assignment:
            return Response({"detail": "Assignment not found"}, status=status.HTTP_404_NOT_FOUND)
        if user.role != User.ROLE_ADMIN and str(assignment.annotator.id) != str(user.id):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        if assignment.status == Assignment.STATUS_ASSIGNED:
            assignment.status = Assignment.STATUS_IN_PROGRESS
            assignment.save()
        annotation = WorkAnnotation.objects(assignment=assignment).first()
        return Response(
            {
                "assignment_id": str(assignment.id),
                "project_id": str(assignment.project.id),
                "project_title": assignment.project.title,
                "work_item_id": str(assignment.work_item.id),
                "frame_url": assignment.work_item.frame.frame_uri,
                "frame": {
                    "frame_number": assignment.work_item.frame.frame_number,
                    "timestamp_sec": assignment.work_item.frame.timestamp_sec,
                    "width": assignment.work_item.frame.width,
                    "height": assignment.work_item.frame.height,
                },
                "status": assignment.status,
                "instructions": assignment.project.instructions,
                "label_schema": assignment.project.label_schema or [],
                "draft": annotation.label_data if annotation else {"boxes": []},
                "comment": annotation.comment if annotation else "",
                "quality_signals": assignment.quality_signals or {},
            },
            status=status.HTTP_200_OK,
        )


class AnnotatorAssignmentSubmitView(AuthenticatedAPIView):
    def post(self, request, assignment_id: str):
        try:
            user = self.get_user(request)
        except PermissionError:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        if not ObjectId.is_valid(assignment_id):
            return Response({"detail": "Invalid assignment id"}, status=status.HTTP_400_BAD_REQUEST)
        assignment = Assignment.objects(id=ObjectId(assignment_id)).first()
        if not assignment:
            return Response({"detail": "Assignment not found"}, status=status.HTTP_404_NOT_FOUND)
        if user.role != User.ROLE_ADMIN and str(assignment.annotator.id) != str(user.id):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        serializer = AssignmentSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        annotation, evaluation = save_assignment_annotation(
            assignment,
            serializer.validated_data["label_data"],
            serializer.validated_data.get("comment", ""),
            serializer.validated_data.get("is_final", True),
        )
        return Response(
            {
                "annotation_id": str(annotation.id),
                "assignment_status": assignment.status,
                "annotation_status": annotation.status,
                "evaluation": evaluation,
            },
            status=status.HTTP_200_OK,
        )


class ReviewerQueueView(AuthenticatedAPIView):
    def get(self, request):
        try:
            user = self.get_user(request)
        except PermissionError:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        if user.role not in (User.ROLE_REVIEWER, User.ROLE_ADMIN):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        if user.role == User.ROLE_ADMIN:
            reviews = ReviewRecord.objects(status=ReviewRecord.STATUS_PENDING).order_by("created_at")
        else:
            project_ids = list(ProjectMembership.objects(user=user, role=ProjectMembership.ROLE_REVIEWER, is_active=True).scalar("project"))
            reviews = ReviewRecord.objects(project__in=project_ids, status=ReviewRecord.STATUS_PENDING).order_by("created_at")
        items = []
        for review in reviews:
            annotations = list(WorkAnnotation.objects(work_item=review.work_item, status=WorkAnnotation.STATUS_SUBMITTED))
            items.append(
                {
                    "review_id": str(review.id),
                    "project_id": str(review.project.id),
                    "project_title": review.project.title,
                    "work_item_id": str(review.work_item.id),
                    "frame_url": review.work_item.frame.frame_uri,
                    "agreement_score": review.agreement_score,
                    "metrics": review.metrics,
                    "annotations": [
                        {
                            "annotation_id": str(annotation.id),
                            "annotator_id": str(annotation.annotator.id),
                            "annotator_username": annotation.annotator.username,
                            "label_data": annotation.label_data,
                            "comment": annotation.comment,
                        }
                        for annotation in annotations
                    ],
                }
            )
        return Response({"items": items}, status=status.HTTP_200_OK)


class ReviewDetailView(AuthenticatedAPIView):
    def get(self, request, review_id: str):
        try:
            user = self.get_user(request)
        except PermissionError:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        if not ObjectId.is_valid(review_id):
            return Response({"detail": "Invalid review id"}, status=status.HTTP_400_BAD_REQUEST)
        review = ReviewRecord.objects(id=ObjectId(review_id)).first()
        if not review:
            return Response({"detail": "Review not found"}, status=status.HTTP_404_NOT_FOUND)
        project = review.project
        if user.role != User.ROLE_ADMIN:
            membership = ProjectMembership.objects(project=project, user=user, role=ProjectMembership.ROLE_REVIEWER, is_active=True).first()
            if user.role != User.ROLE_REVIEWER or not membership:
                return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        annotations = list(WorkAnnotation.objects(work_item=review.work_item))
        return Response(
            {
                "review_id": str(review.id),
                "project_id": str(project.id),
                "project_title": project.title,
                "frame_url": review.work_item.frame.frame_uri,
                "agreement_score": review.agreement_score,
                "metrics": review.metrics,
                "resolution": review.resolution,
                "status": review.status,
                "annotations": [
                    {
                        "annotation_id": str(annotation.id),
                        "annotator_id": str(annotation.annotator.id),
                        "annotator_username": annotation.annotator.username,
                        "label_data": annotation.label_data,
                        "comment": annotation.comment,
                        "status": annotation.status,
                    }
                    for annotation in annotations
                ],
            },
            status=status.HTTP_200_OK,
        )


class ReviewResolveView(AuthenticatedAPIView):
    def post(self, request, review_id: str):
        try:
            user = self.get_user(request)
        except PermissionError:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        if user.role not in (User.ROLE_REVIEWER, User.ROLE_ADMIN):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        if not ObjectId.is_valid(review_id):
            return Response({"detail": "Invalid review id"}, status=status.HTTP_400_BAD_REQUEST)
        review = ReviewRecord.objects(id=ObjectId(review_id)).first()
        if not review:
            return Response({"detail": "Review not found"}, status=status.HTTP_404_NOT_FOUND)
        if user.role == User.ROLE_REVIEWER:
            membership = ProjectMembership.objects(project=review.project, user=user, role=ProjectMembership.ROLE_REVIEWER, is_active=True).first()
            if not membership:
                return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        serializer = ReviewResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = resolve_review(review, user, serializer.validated_data["resolution"])
        return Response(result, status=status.HTTP_200_OK)
