import logging

from django.http import HttpResponse
from django.http.response import FileResponse
from rest_framework.response import Response
from rest_framework import status
from bson import ObjectId

from .models import Project
from .export_standards import (
    collect_project_export_bundle,
    export_coco_zip,
    export_tfrecord,
    export_voc_zip,
    export_yolo_zip,
)

logger = logging.getLogger(__name__)


def export_project_dataset(project_id, user, request):
    """
    Export annotated dataset of a project.
    Returns HttpResponse or Response with the exported data.
    """
    try:
        logger.info("Export dataset called for project %s", project_id)
        
        # Access policy: only customer can export.
        if user.role != 'customer':
            return Response(
                {"detail": "Access to download is allowed only for customers."}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Get project
        project = Project.objects(id=ObjectId(project_id)).first()
        if not project:
            return Response(
                {"detail": "Project not found"}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        export_format = (request.query_params.get("format") or "").strip().lower()
        logger.info("Export format: %s", export_format)

        if export_format not in {"voc", "coco", "yolo", "tfrecord"}:
            return Response(
                {"detail": "Unsupported format. Supported formats: voc, coco, yolo, tfrecord."},
                status=status.HTTP_400_BAD_REQUEST
            )

        bundle = collect_project_export_bundle(project)
        if export_format == "voc":
            path, filename, warnings = export_voc_zip(bundle)
            response = FileResponse(open(path, "rb"), content_type="application/zip", as_attachment=True, filename=filename)
        elif export_format == "coco":
            path, filename, warnings = export_coco_zip(bundle)
            response = FileResponse(open(path, "rb"), content_type="application/zip", as_attachment=True, filename=filename)
        elif export_format == "yolo":
            path, filename, warnings = export_yolo_zip(bundle)
            response = FileResponse(open(path, "rb"), content_type="application/zip", as_attachment=True, filename=filename)
        else:
            path, filename, warnings = export_tfrecord(bundle)
            response = FileResponse(open(path, "rb"), content_type="application/octet-stream", as_attachment=True, filename=filename)

        response["X-Export-Warnings"] = str(int(warnings))
        return response

    except Exception as e:
        import traceback
        logger.error("Unexpected error in export_dataset: %s", str(e))
        logger.error(traceback.format_exc())
        return Response(
            {"detail": "Internal server error: %s" % str(e)}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )