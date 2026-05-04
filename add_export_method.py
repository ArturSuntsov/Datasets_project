# -*- coding: utf-8 -*-
import os

# Read the original file with proper encoding
file_path = os.path.join('backend', 'apps', 'projects', 'views.py')
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find where to insert imports (after 'import secrets')
import_end = -1
for i, line in enumerate(lines):
    if line.startswith('import secrets'):
        import_end = i
        break

if import_end != -1:
    # Insert new imports after 'import secrets'
    new_imports = [
        '\n',
        'import json\n',
        'import zipfile\n',
        'from io import BytesIO, StringIO\n',
        '\n'
    ]
    lines = lines[:import_end+1] + new_imports + lines[import_end+1:]

# Find where to insert export_dataset method (before 'class TaskViewSet')
insert_pos = -1
for i, line in enumerate(lines):
    if 'class TaskViewSet' in line:
        insert_pos = i
        break

if insert_pos != -1:
    # The export method code - using simple strings to avoid encoding issues
    export_code = '''

    @action(detail=True, methods=["get"], url_path="export")
    def export_dataset(self, request, pk=None, *args, **kwargs):
        """Export annotated dataset of the project."""
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            logger.info("Export dataset called for project %s", pk)
            
            user, resp = self._require_user(request)
            if resp:
                return resp
            
            if not ObjectId.is_valid(pk):
                return Response({"detail": "Invalid project id"}, status=status.HTTP_400_BAD_REQUEST)
            
            if user.role != User.ROLE_CUSTOMER:
                return Response({"detail": "Access denied"}, status=status.HTTP_403_FORBIDDEN)
            
            project = Project.objects(id=ObjectId(pk)).first()
            if not project:
                return Response({"detail": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
            
            # Get WorkItems and annotations
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
                        if item.frame and item.frame.asset:
                            item_data["source_file"] = item.frame.asset.file_name
                            item_data["source_uri"] = item.frame.frame_uri
                        data.append(item_data)
                except Exception as e:
                    logger.warning("Error processing work item: %s", str(e))
                    continue
            
            export_format = request.query_params.get("format", "json").lower()
            
            if export_format == "json":
                response = JsonResponse(data, safe=False, json_dumps_params={'ensure_ascii': False, 'indent': 2})
                response['Content-Disposition'] = 'attachment; filename="project-%s-export.json"' % pk
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
                            if source_uri.startswith("http://") or source_uri.startswith("https://"):
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
                            else:
                                with open(source_uri, "rb") as img_file:
                                    image_data = img_file.read()
                            
                            if image_data:
                                zf.writestr("images/%s" % image_filename, image_data)
                                added_images.add(image_key)
                        except Exception as e:
                            logger.warning("Error adding image: %s", str(e))
                            continue
                
                mem_zip.seek(0)
                response = HttpResponse(mem_zip.getvalue(), content_type='application/zip')
                response['Content-Disposition'] = 'attachment; filename="project-%s-photo.zip"' % pk
                return response
            
            else:
                return Response({"detail": "Unsupported format"}, status=status.HTTP_400_BAD_REQUEST)
                
        except Exception as e:
            import traceback
            logger.error("Error in export_dataset: %s", str(e))
            return Response({"detail": "Internal server error"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

'''
    
    lines = lines[:insert_pos] + [export_code] + lines[insert_pos:]

# Write the file back with proper encoding
with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Successfully added export_dataset method!")