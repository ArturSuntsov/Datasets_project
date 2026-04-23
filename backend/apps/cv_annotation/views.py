from __future__ import annotations

from bson import ObjectId
from django.http import HttpResponse
from django.http import HttpRequest
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.projects.models import Project, ProjectMembership
from apps.users.models import User
from apps.users.views import authenticate_from_jwt
from .models import Assignment, ImportAsset, ImportSession, ReviewRecord, SecurityEvent, WorkAnnotation, WorkItem
from .serializers import AssignmentSubmitSerializer, ImportFinalizeSerializer, ReviewResolveSerializer
from .services.upload import save_project_file
from .services.workflow import (
    build_dataset_export_archive,
    build_dataset_export,
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
        if membership:
            return project
        if user.role == User.ROLE_ANNOTATOR:
            assignment = Assignment.objects(project=project, annotator=user).first()
            if assignment:
                return project
        return None


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
        export_format = (request.query_params.get("format") or "both").strip().lower()
        if export_format not in {"coco", "yolo", "both"}:
            return Response({"detail": "Invalid export format. Use coco, yolo or both"}, status=status.HTTP_400_BAD_REQUEST)
        as_archive = (request.query_params.get("download") or "").strip().lower() in {"1", "true", "yes"}
        if as_archive:
            archive_name, archive_bytes = build_dataset_export_archive(project, export_format=export_format)
            response = HttpResponse(archive_bytes, content_type="application/zip")
            response["Content-Disposition"] = f'attachment; filename="{archive_name}"'
            return response
        return Response(build_dataset_export(project, export_format=export_format), status=status.HTTP_200_OK)


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


class AnnotatorProjectsView(AuthenticatedAPIView):
    def get(self, request):
        try:
            user = self.get_user(request)
        except PermissionError:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        if user.role not in (User.ROLE_ANNOTATOR, User.ROLE_ADMIN):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        assignments = list(
            Assignment.objects(annotator=user).order_by("-updated_at", "-created_at")
            if user.role == User.ROLE_ANNOTATOR
            else Assignment.objects.order_by("-updated_at", "-created_at")
        )
        grouped: dict[str, dict] = {}
        for assignment in assignments:
            project = assignment.project
            project_id = str(project.id)
            bucket = grouped.get(project_id)
            if not bucket:
                bucket = {
                    "project_id": project_id,
                    "project_title": project.title,
                    "project_status": project.status,
                    "instructions": project.instructions,
                    "instructions_file_uri": project.instructions_file_uri or "",
                    "instructions_file_name": project.instructions_file_name or "",
                    "label_schema": project.label_schema or [],
                    "available_count": 0,
                    "active_count": 0,
                    "draft_count": 0,
                    "submitted_count": 0,
                    "accepted_count": 0,
                    "rejected_count": 0,
                    "total_assignments": 0,
                    "next_assignment_id": None,
                    "active_assignment_id": None,
                    "last_activity_at": assignment.updated_at or assignment.created_at,
                }
                grouped[project_id] = bucket

            bucket["total_assignments"] += 1
            if assignment.status == Assignment.STATUS_ASSIGNED:
                bucket["available_count"] += 1
                if not bucket["next_assignment_id"]:
                    bucket["next_assignment_id"] = str(assignment.id)
            elif assignment.status == Assignment.STATUS_DRAFT:
                bucket["draft_count"] += 1
                bucket["active_count"] += 1
                if not bucket["active_assignment_id"]:
                    bucket["active_assignment_id"] = str(assignment.id)
            elif assignment.status == Assignment.STATUS_IN_PROGRESS:
                bucket["active_count"] += 1
                if not bucket["active_assignment_id"]:
                    bucket["active_assignment_id"] = str(assignment.id)
            elif assignment.status == Assignment.STATUS_SUBMITTED:
                bucket["submitted_count"] += 1
            elif assignment.status == Assignment.STATUS_ACCEPTED:
                bucket["accepted_count"] += 1
            elif assignment.status == Assignment.STATUS_REJECTED:
                bucket["rejected_count"] += 1

            assignment_updated = assignment.updated_at or assignment.created_at
            if assignment_updated and assignment_updated > bucket["last_activity_at"]:
                bucket["last_activity_at"] = assignment_updated

        available_projects = []
        active_projects = []
        for project in grouped.values():
            if project["active_assignment_id"]:
                active_projects.append(project)
            elif project["available_count"] > 0:
                available_projects.append(project)

        sort_key = lambda item: (-(item.get("active_count", 0) + item.get("available_count", 0)), item.get("project_title", ""))
        active_projects.sort(key=sort_key)
        available_projects.sort(key=sort_key)
        return Response({"available_projects": available_projects, "active_projects": active_projects}, status=status.HTTP_200_OK)


class AnnotatorProjectDetailView(AuthenticatedAPIView):
    def get(self, request, project_id: str):
        try:
            user = self.get_user(request)
        except PermissionError:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        project = self.get_project_for_user(user, project_id)
        if not project:
            return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if user.role not in (User.ROLE_ANNOTATOR, User.ROLE_ADMIN):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        assignments_qs = Assignment.objects(project=project, annotator=user).order_by("status", "created_at") if user.role == User.ROLE_ANNOTATOR else Assignment.objects(project=project).order_by("status", "created_at")
        assignments = list(assignments_qs)
        next_assignment = next((item for item in assignments if item.status == Assignment.STATUS_ASSIGNED), None)
        active_assignment = next((item for item in assignments if item.status in [Assignment.STATUS_IN_PROGRESS, Assignment.STATUS_DRAFT]), None)

        payload = {
            "project_id": str(project.id),
            "project_title": project.title,
            "project_status": project.status,
            "description": project.description,
            "instructions": project.instructions,
            "instructions_file_uri": project.instructions_file_uri or "",
            "instructions_file_name": project.instructions_file_name or "",
            "instructions_version": int(project.instructions_version or 0),
            "instructions_updated_at": project.instructions_updated_at,
            "label_schema": project.label_schema or [],
            "frame_interval_sec": project.frame_interval_sec,
            "participant_rules": project.participant_rules or {},
            "stats": {
                "available_count": sum(1 for item in assignments if item.status == Assignment.STATUS_ASSIGNED),
                "active_count": sum(1 for item in assignments if item.status in [Assignment.STATUS_IN_PROGRESS, Assignment.STATUS_DRAFT]),
                "submitted_count": sum(1 for item in assignments if item.status == Assignment.STATUS_SUBMITTED),
                "accepted_count": sum(1 for item in assignments if item.status == Assignment.STATUS_ACCEPTED),
                "rejected_count": sum(1 for item in assignments if item.status == Assignment.STATUS_REJECTED),
                "total_assignments": len(assignments),
            },
            "next_assignment_id": str(next_assignment.id) if next_assignment else None,
            "active_assignment_id": str(active_assignment.id) if active_assignment else None,
        }
        return Response(payload, status=status.HTTP_200_OK)


class AnnotatorProjectNextAssignmentView(AuthenticatedAPIView):
    def get(self, request, project_id: str):
        try:
            user = self.get_user(request)
        except PermissionError:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        project = self.get_project_for_user(user, project_id)
        if not project:
            return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if user.role not in (User.ROLE_ANNOTATOR, User.ROLE_ADMIN):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        assignments = list(
            Assignment.objects(project=project, annotator=user).order_by("created_at")
            if user.role == User.ROLE_ANNOTATOR
            else Assignment.objects(project=project).order_by("created_at")
        )
        active_assignment = next((item for item in assignments if item.status in [Assignment.STATUS_IN_PROGRESS, Assignment.STATUS_DRAFT]), None)
        if active_assignment:
            return Response({"assignment_id": str(active_assignment.id), "source": "active"}, status=status.HTTP_200_OK)

        next_assignment = next((item for item in assignments if item.status == Assignment.STATUS_ASSIGNED), None)
        if next_assignment:
            return Response({"assignment_id": str(next_assignment.id), "source": "available"}, status=status.HTTP_200_OK)

        return Response({"detail": "No assignments available in this project"}, status=status.HTTP_404_NOT_FOUND)


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
                "pre_annotations": assignment.work_item.pre_annotations or {},
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
        serializer = AssignmentSubmitSerializer(data=request.data, context={"assignment": assignment})
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
                    "golden_total": review.golden_total,
                    "golden_errors": review.golden_errors,
                    "golden_score": review.golden_score,
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
                "golden_total": review.golden_total,
                "golden_errors": review.golden_errors,
                "golden_score": review.golden_score,
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
        serializer = ReviewResolveSerializer(data=request.data, context={"review": review})
        serializer.is_valid(raise_exception=True)
        result = resolve_review(review, user, serializer.validated_data["resolution"])
        return Response(result, status=status.HTTP_200_OK)


class SecurityEventsView(AuthenticatedAPIView):
    def get(self, request, project_id: str):
        try:
            user = self.get_user(request)
        except PermissionError:
            return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)
        project = self.get_project_for_user(user, project_id)
        if not project:
            return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        events = SecurityEvent.objects(project=project).order_by("-created_at").limit(200)
        payload = [
            {
                "id": str(event.id),
                "event_type": event.event_type,
                "severity": event.severity,
                "created_at": event.created_at,
                "payload": event.payload,
                "actor_id": str(event.actor.id) if event.actor else None,
            }
            for event in events
        ]
        return Response({"items": payload}, status=status.HTTP_200_OK)
