import io

# Read the original file
with open('backend/apps/projects/views.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Add imports after 'import secrets'
imports_to_add = '''
import json
import zipfile
from io import BytesIO, StringIO
'''

# Find position after 'import secrets'
pos = content.find('import secrets')
if pos != -1:
    # Find the next line
    end_line = content.find('\n', pos)
    if end_line != -1:
        content = content[:end_line+1] + imports_to_add + content[end_line+1:]

# Add export_dataset method before 'class TaskViewSet'
export_method = '''

    @action(detail=True, methods=["get"], url_path="export")
    def export_dataset(self, request, pk=None, *args, **kwargs):
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            logger.info("Export dataset called for project %s with format %s", pk, request.query_params.get('format', 'json'))
            
            user, resp = self._require_user(request)
            if resp:
                logger.warning("User authentication failed for export")
                return resp
            
            if not ObjectId.is_valid(pk):
                logger.warning("Invalid project id: %s", pk)
                return Response({"detail": "Invalid project id"}, status=status.HTTP_400_BAD_REQUEST)
            
            if user.role != User.ROLE_CUSTOMER:
                logger.warning("Access denied for user %s with role %s", user.id, user.role)
                return Response({"detail": "Access to download is allowed only for customers."}, status=status.HTTP_403_FORBIDDEN)
            
            project = Project.objects(id=ObjectId(pk)).first()
            if not project:
                logger.warning("Project not found: %s", pk)
                return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
            
            logger.info("Starting export for project %s, user %s", pk, user.id)
            
            from apps.cv_annotation.models import WorkItem, WorkAnnotation
            
            work_items = WorkItem.objects(project=project)
            data = []
            
            for item in work_items:
                try:
                    annotation = WorkAnnotation.objects(work_item=item, status__in=["submitted", "accepted"]).first()
                    if annotation:
                        item_data = {
                            "work_item_id": str(item.id),
                            "label_data": annotation.label_data,
                            "status": annotation.status,
                            "created_at": annotation.created_at.isoformat() if annotation.created_at else None,
                        }
                        
                        if item.frame:
                            if item.frame.asset:
                                item_data["source_file"] = item.frame.asset.file_name
                                item_data["source_uri"] = item.frame.frame_uri
                        
                        data.append(item_data)
                except Exception as e:
                    logger.warning("Error processing work item %s: %s", item.id, e)
                    continue
            
            logger.info("Collected %d annotations for export", len(data))
            
            export_format = request.query_params.get("format", "json").lower()
            logger.info("Export format: %s", export_format)
            
            if export_format == "json":
                response = JsonResponse(data, safe=False, json_dumps_params={'ensure_ascii': False, 'indent': 2})
                response['Content-Disposition'] = 'attachment; filename="project-%s-export.json"' % pk
                logger.info("JSON export successful for project %s", pk)
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
                    csv_buffer.write("work_item_id,source_file,source_uri,label_data,status,created_at\\n")
                
                response = HttpResponse(csv_buffer.getvalue(), content_type='text/csv; charset=utf-8')
                response['Content-Disposition'] = 'attachment; filename="project-%s-export.csv"' % pk
                logger.info("CSV export successful for project %s", pk)
                return response
                    
            elif export_format == "photo":
                import urllib.request
                import mimetypes
                
                mem_zip = BytesIO()
                with zipfile.ZipFile(mem_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
                    annotations_json = json.dumps(data, ensure_ascii=False, indent=2)
                    zf.writestr("annotations.json", annotations_json)
                    
                    added_images = set()
                    for item in data:
                        source_uri = item.get("source_uri")
                        source_file = item.get("source_file")
                        if not source_uri or not source_file:
                            continue
                        
                        image_key = "%s-%s" % (source_uri, source_file)
                        if image_key in added_images:
                            continue
                        
                        image_data = None
                        image_filename = source_file
                        
                        try:
                            if source_uri.startswith(("http://", "https://")):
                                try:
                                    req = urllib.request.Request(source_uri, headers={'User-Agent': 'Mozilla/5.0'})
                                    with urllib.request.urlopen(req, timeout=10) as resp_obj:
                                        image_data = resp_obj.read()
                                    content_type = resp_obj.headers.get('Content-Type', '')
                                    ext = mimetypes.guess_extension(content_type.split(';')[0]) if content_type else ''
                                    if not ext:
                                        if '.' in source_file:
                                            ext = ".%s" % source_file.split('.')[-1]
                                        else:
                                            ext = ".jpg"
                                    if '.' not in image_filename:
                                        image_filename = "%s%s" % (source_file, ext)
                                except Exception as url_error:
                                    logger.warning("Failed to download image from URL %s: %s", source_uri, url_error)
                                    continue
                            else:
                                try:
                                    with open(source_uri, "rb") as img_file:
                                        image_data = img_file.read()
                                except Exception as file_error:
                                    logger.warning("Failed to read local file %s: %s", source_uri, file_error)
                                    continue
                            
                            if image_data:
                                zf.writestr("images/%s" % image_filename, image_data)
                                added_images.add(image_key)
                        except Exception as e:
                            logger.error("General error adding image %s: %s", source_uri, e)
                            continue
                
                mem_zip.seek(0)
                response = HttpResponse(mem_zip.getvalue(), content_type='application/zip')
                response['Content-Disposition'] = 'attachment; filename="project-%s-photo.zip"' % pk
                logger.info("ZIP export successful for project %s", pk)
                return response
                
            else:
                logger.warning("Unsupported format: %s", export_format)
                return Response({"detail": "Unsupported format. Use json, csv, or photo."}, status=status.HTTP_400_BAD_REQUEST)
                
        except Exception as e:
            import traceback
            logger.error("Unexpected error in export_dataset: %s", str(e))
            logger.error(traceback.format_exc())
            return Response({"detail": "Internal server error: %s" % str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

'''

# Find position before 'class TaskViewSet'
pos = content.find('class TaskViewSet')
if pos != -1:
    content = content[:pos] + export_method + content[pos:]

# Write the corrected file
with open('backend/apps/projects/views.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("File fixed successfully!")