from __future__ import annotations

import io
import json
import os
import struct
import tempfile
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Tuple
from xml.etree import ElementTree as ET

from .models import Project
from .photo_rendering import resolve_local_path


@dataclass
class ExportAnnotation:
    id: int
    category_id: int
    category_name: str
    bbox: Tuple[float, float, float, float]
    polygons: List[List[float]] = field(default_factory=list)
    keypoints: List[float] = field(default_factory=list)


@dataclass
class ExportImage:
    id: int
    file_name: str
    width: int
    height: int
    abs_path: str
    annotations: List[ExportAnnotation] = field(default_factory=list)


@dataclass
class ExportBundle:
    project_id: str
    categories: List[Dict]
    images: List[ExportImage]


def collect_project_export_bundle(project: Project) -> ExportBundle:
    from apps.cv_annotation.models import WorkAnnotation, WorkItem

    labels = []
    for i, schema_item in enumerate(project.label_schema or []):
        name = str(schema_item.get("name") or schema_item.get("label") or f"class_{i+1}")
        labels.append({"id": i + 1, "name": name})
    if not labels:
        labels = [{"id": 1, "name": "object"}]
    category_by_name = {item["name"]: item["id"] for item in labels}

    images: List[ExportImage] = []
    ann_counter = 1
    # Только WorkItem со статусом COMPLETED и VALIDATION_APPROVED
    for image_id, work_item in enumerate(
        WorkItem.objects(project=project, status=WorkItem.STATUS_COMPLETED),
        start=1,
    ):
        if work_item.validation_status != WorkItem.VALIDATION_APPROVED:
            continue
        frame = getattr(work_item, "frame", None)
        if not frame:
            continue
        frame_uri = getattr(frame, "frame_uri", "")
        abs_path = resolve_local_path(frame_uri)
        file_name = Path((frame_uri or "").split("?", 1)[0]).name or f"frame_{image_id:06d}.jpg"
        width = int(getattr(frame, "width", 0) or 0)
        height = int(getattr(frame, "height", 0) or 0)
        image = ExportImage(
            id=image_id,
            file_name=file_name,
            width=width,
            height=height,
            abs_path=str(abs_path) if abs_path else "",
        )

        # Используем final_annotation из work_item
        final_annotation = getattr(work_item, "final_annotation", None) or {}
        boxes_data = final_annotation.get("boxes", []) if isinstance(final_annotation, dict) else []
        for box in _extract_boxes({"boxes": boxes_data}, width, height):
            category_name = box.get("label") or labels[0]["name"]
            category_id = category_by_name.get(category_name, labels[0]["id"])
            image.annotations.append(
                ExportAnnotation(
                    id=ann_counter,
                    category_id=category_id,
                    category_name=category_name,
                    bbox=(box["x"], box["y"], box["width"], box["height"]),
                )
            )
            ann_counter += 1

        images.append(image)
    return ExportBundle(project_id=str(project.id), categories=labels, images=images)


def export_voc_zip(bundle: ExportBundle) -> tuple[str, str, int]:
    """
    ZIP-архив только с папкой Annotations/ (XML-файлы). Без JPEGImages/ и прочего.
    """
    tmp_path = tempfile.NamedTemporaryFile(delete=False, suffix=".zip").name
    skipped = 0
    with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for image in bundle.images:
            xml_bytes = _build_voc_xml(image)
            xml_name = f"{Path(image.file_name).stem}.xml"
            zf.writestr(f"Annotations/{xml_name}", xml_bytes)
            if not image.abs_path or not os.path.exists(image.abs_path):
                skipped += 1
    return tmp_path, f"project-{bundle.project_id}-voc.zip", skipped


def export_coco_json(bundle: ExportBundle) -> tuple[str, str]:
    """
    Один JSON-файл (не архив) со структурой COCO.
    Содержит images, categories, annotations. Без файлов изображений.
    """
    images = []
    annotations = []
    for image in bundle.images:
        images.append({
            "id": image.id,
            "file_name": image.file_name,
            "width": image.width,
            "height": image.height,
        })
        for ann in image.annotations:
            coco_ann = {
                "id": ann.id,
                "image_id": image.id,
                "category_id": ann.category_id,
                "bbox": [ann.bbox[0], ann.bbox[1], ann.bbox[2], ann.bbox[3]],
                "area": ann.bbox[2] * ann.bbox[3],
                "iscrowd": 0,
            }
            if ann.polygons:
                coco_ann["segmentation"] = ann.polygons
            if ann.keypoints:
                coco_ann["keypoints"] = ann.keypoints
                coco_ann["num_keypoints"] = len(ann.keypoints) // 3 if len(ann.keypoints) % 3 == 0 else len(ann.keypoints) // 2
            annotations.append(coco_ann)
    payload = {
        "images": images,
        "categories": [{"id": c["id"], "name": c["name"], "supercategory": ""} for c in bundle.categories],
        "annotations": annotations,
    }
    filename = f"project-{bundle.project_id}-coco.json"
    return json.dumps(payload, ensure_ascii=False, indent=2), filename


def export_yolo_zip(bundle: ExportBundle) -> tuple[str, str, int]:
    """
    ZIP-архив только с папкой labels/ (txt-файлы) и classes.txt в корне.
    Без папки images/.
    """
    tmp_path = tempfile.NamedTemporaryFile(delete=False, suffix=".zip").name
    skipped = 0
    classes = sorted(bundle.categories, key=lambda x: x["id"])
    class_index = {item["id"]: idx for idx, item in enumerate(classes)}
    with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("classes.txt", "\n".join(item["name"] for item in classes) + "\n")
        for image in bundle.images:
            if not image.abs_path or not os.path.exists(image.abs_path):
                skipped += 1
            label_name = f"{Path(image.file_name).stem}.txt"
            lines = []
            for ann in image.annotations:
                x, y, w, h = ann.bbox
                if image.width <= 0 or image.height <= 0:
                    continue
                cx = (x + (w / 2.0)) / image.width
                cy = (y + (h / 2.0)) / image.height
                nw = w / image.width
                nh = h / image.height
                lines.append(f"{class_index.get(ann.category_id, 0)} {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}")
            zf.writestr(f"labels/{label_name}", "\n".join(lines) + ("\n" if lines else ""))
    return tmp_path, f"project-{bundle.project_id}-yolo.zip", skipped


def export_tfrecord(bundle: ExportBundle) -> tuple[str, str, int]:
    """
    TFRecord-файл только с аннотациями, без закодированных изображений.
    image/encoded содержит пустой байтовый массив.
    """
    tmp_path = tempfile.NamedTemporaryFile(delete=False, suffix=".tfrecord").name
    skipped = 0
    with open(tmp_path, "wb") as out:
        for image in bundle.images:
            if not image.abs_path or not os.path.exists(image.abs_path):
                skipped += 1
            # Пустой байтовый массив вместо реального изображения
            encoded = b""
            xmins: List[float] = []
            ymins: List[float] = []
            xmaxs: List[float] = []
            ymaxs: List[float] = []
            class_text: List[bytes] = []
            class_label: List[int] = []
            for ann in image.annotations:
                x, y, w, h = ann.bbox
                if image.width <= 0 or image.height <= 0:
                    continue
                xmins.append(max(0.0, min(1.0, x / image.width)))
                ymins.append(max(0.0, min(1.0, y / image.height)))
                xmaxs.append(max(0.0, min(1.0, (x + w) / image.width)))
                ymaxs.append(max(0.0, min(1.0, (y + h) / image.height)))
                class_text.append(ann.category_name.encode("utf-8"))
                class_label.append(int(ann.category_id))
            example = _make_tf_example(
                {
                    "image/encoded": ("bytes", [encoded]),
                    "image/height": ("int", [int(image.height)]),
                    "image/width": ("int", [int(image.width)]),
                    "image/filename": ("bytes", [image.file_name.encode("utf-8")]),
                    "image/object/bbox/xmin": ("float", xmins),
                    "image/object/bbox/ymin": ("float", ymins),
                    "image/object/bbox/xmax": ("float", xmaxs),
                    "image/object/bbox/ymax": ("float", ymaxs),
                    "image/object/class/text": ("bytes", class_text),
                    "image/object/class/label": ("int", class_label),
                }
            )
            _write_tfrecord_record(out, example)
    return tmp_path, f"project-{bundle.project_id}.tfrecord", skipped


def _build_voc_xml(image: ExportImage) -> bytes:
    root = ET.Element("annotation")
    ET.SubElement(root, "filename").text = image.file_name
    size = ET.SubElement(root, "size")
    ET.SubElement(size, "width").text = str(image.width)
    ET.SubElement(size, "height").text = str(image.height)
    ET.SubElement(size, "depth").text = "3"
    ET.SubElement(root, "segmented").text = "0"
    for ann in image.annotations:
        obj = ET.SubElement(root, "object")
        ET.SubElement(obj, "name").text = ann.category_name
        ET.SubElement(obj, "pose").text = "Unspecified"
        ET.SubElement(obj, "truncated").text = "0"
        ET.SubElement(obj, "difficult").text = "0"
        x, y, w, h = ann.bbox
        bnd = ET.SubElement(obj, "bndbox")
        ET.SubElement(bnd, "xmin").text = str(int(round(x)))
        ET.SubElement(bnd, "ymin").text = str(int(round(y)))
        ET.SubElement(bnd, "xmax").text = str(int(round(x + w)))
        ET.SubElement(bnd, "ymax").text = str(int(round(y + h)))
    return ET.tostring(root, encoding="utf-8")


def _extract_boxes(label_data: Dict, width: int, height: int) -> List[Dict]:
    boxes = label_data.get("boxes", []) if isinstance(label_data, dict) else []
    result = []
    for item in boxes if isinstance(boxes, list) else []:
        if not isinstance(item, dict):
            continue
        try:
            x = float(item.get("x", 0))
            y = float(item.get("y", 0))
            w = float(item.get("width", 0))
            h = float(item.get("height", 0))
        except (TypeError, ValueError):
            continue
        if 0 <= x <= 1 and 0 <= y <= 1 and w <= 1 and h <= 1 and width > 0 and height > 0:
            x, y, w, h = x * width, y * height, w * width, h * height
        result.append({"x": x, "y": y, "width": w, "height": h, "label": str(item.get("label", "object"))})
    return result


def _extract_polygons(label_data: Dict, width: int, height: int) -> List[List[float]]:
    polygons = label_data.get("polygons", []) if isinstance(label_data, dict) else []
    result: List[List[float]] = []
    for poly in polygons if isinstance(polygons, list) else []:
        points = poly.get("points") if isinstance(poly, dict) else None
        if not isinstance(points, list):
            continue
        flat: List[float] = []
        for pt in points:
            if isinstance(pt, dict):
                x, y = pt.get("x"), pt.get("y")
            elif isinstance(pt, (list, tuple)) and len(pt) >= 2:
                x, y = pt[0], pt[1]
            else:
                continue
            try:
                xf = float(x)
                yf = float(y)
            except (TypeError, ValueError):
                continue
            if 0 <= xf <= 1 and 0 <= yf <= 1 and width > 0 and height > 0:
                xf, yf = xf * width, yf * height
            flat.extend([xf, yf])
        if len(flat) >= 6:
            result.append(flat)
    return result


def _extract_keypoints(label_data: Dict, width: int, height: int) -> List[float]:
    keypoints = label_data.get("keypoints", []) if isinstance(label_data, dict) else []
    result: List[float] = []
    for pt in keypoints if isinstance(keypoints, list) else []:
        if not isinstance(pt, dict):
            continue
        try:
            x = float(pt.get("x", 0))
            y = float(pt.get("y", 0))
        except (TypeError, ValueError):
            continue
        if 0 <= x <= 1 and 0 <= y <= 1 and width > 0 and height > 0:
            x, y = x * width, y * height
        result.extend([x, y, 2])
    return result


# ---- Minimal TFRecord writer ----
def _write_tfrecord_record(stream, payload: bytes) -> None:
    length = struct.pack("<Q", len(payload))
    stream.write(length)
    stream.write(struct.pack("<I", _masked_crc32c(length)))
    stream.write(payload)
    stream.write(struct.pack("<I", _masked_crc32c(payload)))


def _masked_crc32c(data: bytes) -> int:
    crc = _crc32c(data)
    return ((crc >> 15) | (crc << 17)) + 0xA282EAD8 & 0xFFFFFFFF


def _crc32c(data: bytes) -> int:
    poly = 0x82F63B78
    crc = 0xFFFFFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            mask = -(crc & 1)
            crc = (crc >> 1) ^ (poly & mask)
    return (~crc) & 0xFFFFFFFF


def _make_tf_example(features: Dict[str, Tuple[str, List]]) -> bytes:
    feature_entries = b""
    for key, (kind, values) in features.items():
        feature_msg = _encode_feature(kind, values)
        entry = _field(1, _len_delimited(key.encode("utf-8"))) + _field(2, _len_delimited(feature_msg))
        feature_entries += _field(1, _len_delimited(entry))
    features_msg = _field(1, _len_delimited(feature_entries))
    return _field(1, _len_delimited(features_msg))


def _encode_feature(kind: str, values: List) -> bytes:
    if kind == "bytes":
        items = b"".join(_field(1, _len_delimited(v)) for v in values)
        return _field(1, _len_delimited(items))
    if kind == "float":
        packed = b"".join(struct.pack("<f", float(v)) for v in values)
        return _field(2, _len_delimited(packed))
    if kind == "int":
        packed = b"".join(_varint(int(v)) for v in values)
        return _field(3, _len_delimited(packed))
    return b""


def _field(field_number: int, payload: bytes) -> bytes:
    wire_type = 2
    return _varint((field_number << 3) | wire_type) + payload


def _len_delimited(data: bytes) -> bytes:
    return _varint(len(data)) + data


def _varint(value: int) -> bytes:
    out = bytearray()
    v = value & ((1 << 64) - 1)
    while v > 0x7F:
        out.append((v & 0x7F) | 0x80)
        v >>= 7
    out.append(v & 0x7F)
    return bytes(out)