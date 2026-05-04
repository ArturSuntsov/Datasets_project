import csv
import json
import logging
import tempfile
import zipfile
from io import StringIO

from django.http import JsonResponse, HttpResponse
from django.http.response import FileResponse
from rest_framework.response import Response
from rest_framework import status
from bson import ObjectId

from .models import Project
from .photo_rendering import resolve_local_path, render_annotated_frame, safe_frame_name

logger = logging.getLogger(__name__)


def export_project_dataset(project_id, user, request):
    """
    Export annotated dataset of a project.
    Returns HttpResponse or Response with the exported data.
    """
    try:
        logger.info("Export dataset called for project %s", project_id)
        
        # Check user role
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
        
        # Get WorkItems and annotations
        from apps.cv_annotation.models import WorkItem, WorkAnnotation
        
        work_items = WorkItem.objects(project=project)
        data = []
        
        for item in work_items:
            try:
                annotation = WorkAnnotation.objects(
                    work_item=item, 
                    status__in=["submitted", "accepted"]
                ).first()
                if annotation:
                    item_data = {
                        "work_item_id": str(item.id),
                        "label_data": annotation.label_data,
                        "status": annotation.status,
                        "created_at": annotation.created_at.isoformat() if annotation.created_at else None,
                    }
                    
                    if item.frame and item.frame.asset:
                        item_data["source_file"] = item.frame.asset.file_name
                        item_data["source_uri"] = item.frame.frame_uri
                    
                    data.append(item_data)
            except Exception as e:
                logger.warning("Error processing work item %s: %s", item.id, str(e))
                continue
        
        export_format = request.query_params.get("format", "json").lower()
        logger.info("Export format: %s", export_format)
        
        if export_format == "json":
            response = JsonResponse(
                data, 
                safe=False, 
                json_dumps_params={'ensure_ascii': False, 'indent': 2}
            )
            response['Content-Disposition'] = 'attachment; filename="project-%s-export.json"' % project_id
            return response
        
        elif export_format == "csv":
            flat_data = []
            for item in data:
                flat_item = {
                    "work_item_id": str(item.get("work_item_id", "")),
                    "source_file": str(item.get("source_file", "")),
                    "source_uri": str(item.get("source_uri", "")),
                    "label_data": json.dumps(item.get("label_data", {}), ensure_ascii=False),
                    "status": str(item.get("status", "")),
                    "created_at": str(item.get("created_at", "")),
                }
                flat_data.append(flat_item)
            
            csv_buffer = StringIO()
            if len(flat_data) > 0:
                fieldnames = ["work_item_id", "source_file", "source_uri", "label_data", "status", "created_at"]
                writer = csv.DictWriter(csv_buffer, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(flat_data)
            else:
                csv_buffer.write("work_item_id,source_file,source_uri,label_data,status,created_at\n")
            
            response = HttpResponse(csv_buffer.getvalue(), content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = 'attachment; filename="project-%s-labels.csv"' % project_id
            return response
            
        elif export_format == "photo":
            tmp_path = None
            try:
                with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
                    tmp_path = tmp.name

                with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
                    added_images = set()
                    for item in data:
                        source_uri = item.get("source_uri")
                        source_file = item.get("source_file")
                        if not source_uri or not source_file:
                            continue

                        image_key = f"{source_uri}-{source_file}"
                        if image_key in added_images:
                            continue

                        try:
                            image_filename = safe_frame_name(source_uri, source_file)
                            local_path = resolve_local_path(source_uri)
                            if not local_path:
                                logger.warning("Frame file not found for URI %s", source_uri)
                                continue

                            with open(local_path, "rb") as img_file:
                                rendered_bytes = render_annotated_frame(img_file.read(), item.get("label_data") or {})
                            zf.writestr(f"images/{image_filename}", rendered_bytes)
                            added_images.add(image_key)
                        except Exception as e:
                            logger.warning("Failed to add frame %s: %s", source_uri, str(e))
                            continue

                fh = open(tmp_path, "rb")
                response = FileResponse(fh, content_type="application/zip", as_attachment=True, filename=f"project-{project_id}-frames.zip")
                return response
            finally:
                # Best-effort cleanup; FileResponse will stream from file handle.
                # On Windows, unlinking an open file can fail; leaving it is safer than breaking download.
                pass
            
        else:
            return Response(
                {"detail": "Unsupported format. Use json, csv, or photo."}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
    except Exception as e:
        import traceback
        logger.error("Unexpected error in export_dataset: %s", str(e))
        logger.error(traceback.format_exc())
        return Response(
            {"detail": "Internal server error: %s" % str(e)}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )