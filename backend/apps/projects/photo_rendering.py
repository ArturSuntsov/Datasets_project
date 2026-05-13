from __future__ import annotations

import io
from pathlib import Path
from typing import Dict, Iterable, List, Tuple
from urllib.parse import urlparse

from PIL import Image, ImageColor, ImageDraw

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}
DEFAULT_COLOR = "#22c55e"
PALETTE = [
    "#22c55e",
    "#3b82f6",
    "#ef4444",
    "#f59e0b",
    "#a855f7",
    "#06b6d4",
]


def resolve_local_path(source_uri: str) -> Path | None:
    if not source_uri:
        return None
    cleaned = source_uri.split("?", 1)[0].strip()
    candidates = [
        Path(cleaned),
        Path(cleaned.lstrip("/")),
        Path("media") / cleaned.lstrip("/"),
        Path("uploads") / cleaned.lstrip("/"),
        Path(cleaned.replace("/media/", "media/")),
        Path(cleaned.replace("/uploads/", "uploads/")),
    ]
    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


def safe_frame_name(source_uri: str, fallback_name: str) -> str:
    parsed = urlparse(source_uri or "")
    uri_name = Path(parsed.path).name if parsed.path else ""
    name = uri_name or Path(fallback_name or "").name or "frame.jpg"
    ext = Path(name).suffix.lower()
    if ext not in IMAGE_EXTENSIONS:
        stem = Path(name).stem or "frame"
        name = f"{stem}.jpg"
    return name


def render_annotated_frame(image_bytes: bytes, label_data: Dict) -> bytes:
    with Image.open(io.BytesIO(image_bytes)) as src:
        image = src.convert("RGBA")
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    width, height = image.size
    labels_color: Dict[str, str] = {}

    def pick_color(label: str | None) -> str:
        key = (label or "").strip() or "__default__"
        if key not in labels_color:
            labels_color[key] = PALETTE[len(labels_color) % len(PALETTE)] if key != "__default__" else DEFAULT_COLOR
        return labels_color[key]

    def norm_x(x: float) -> float:
        return x * width if 0 <= x <= 1 else x

    def norm_y(y: float) -> float:
        return y * height if 0 <= y <= 1 else y

    boxes = label_data.get("boxes", []) if isinstance(label_data, dict) else []
    for box in boxes if isinstance(boxes, list) else []:
        if not isinstance(box, dict):
            continue
        try:
            x = float(box.get("x", 0))
            y = float(box.get("y", 0))
            w = float(box.get("width", 0))
            h = float(box.get("height", 0))
        except (TypeError, ValueError):
            continue
        x1, y1 = norm_x(x), norm_y(y)
        x2, y2 = norm_x(x + w), norm_y(y + h)
        color = pick_color(str(box.get("label", "")))
        draw.rectangle([(x1, y1), (x2, y2)], outline=color, width=2)
        if box.get("label"):
            draw.text((x1 + 2, max(0, y1 - 12)), str(box["label"]), fill=color)

    polygons = label_data.get("polygons", []) if isinstance(label_data, dict) else []
    for polygon in polygons if isinstance(polygons, list) else []:
        points = _extract_points(polygon)
        if len(points) < 3:
            continue
        color = pick_color(_extract_label(polygon))
        scaled = [(norm_x(px), norm_y(py)) for px, py in points]
        draw.polygon(scaled, outline=color, fill=(*ImageColor.getrgb(color), 70))

    keypoints = label_data.get("keypoints", []) if isinstance(label_data, dict) else []
    for point in keypoints if isinstance(keypoints, list) else []:
        if not isinstance(point, dict):
            continue
        try:
            px = norm_x(float(point.get("x", 0)))
            py = norm_y(float(point.get("y", 0)))
        except (TypeError, ValueError):
            continue
        color = "#ef4444"
        r = 4
        draw.ellipse((px - r, py - r, px + r, py + r), fill=color)

    masks = label_data.get("masks", []) if isinstance(label_data, dict) else []
    for mask in masks if isinstance(masks, list) else []:
        points = _extract_points(mask)
        if len(points) < 3:
            continue
        color = pick_color(_extract_label(mask))
        scaled = [(norm_x(px), norm_y(py)) for px, py in points]
        draw.polygon(scaled, outline=color, fill=(*ImageColor.getrgb(color), 90))

    result = Image.alpha_composite(image, overlay).convert("RGB")
    out = io.BytesIO()
    result.save(out, format="JPEG", quality=92)
    return out.getvalue()


def _extract_label(shape: object) -> str | None:
    if isinstance(shape, dict):
        return str(shape.get("label", "") or "")
    return None


def _extract_points(shape: object) -> List[Tuple[float, float]]:
    if not isinstance(shape, dict):
        return []
    raw = shape.get("points")
    if isinstance(raw, list) and raw and all(isinstance(item, (int, float)) for item in raw):
        values = list(raw)
        if len(values) % 2 != 0:
            return []
        return [(float(values[i]), float(values[i + 1])) for i in range(0, len(values), 2)]
    if isinstance(raw, list):
        result: List[Tuple[float, float]] = []
        for item in raw:
            if isinstance(item, dict):
                x, y = item.get("x"), item.get("y")
            elif isinstance(item, (list, tuple)) and len(item) >= 2:
                x, y = item[0], item[1]
            else:
                continue
            try:
                result.append((float(x), float(y)))
            except (TypeError, ValueError):
                continue
        return result
    return []
