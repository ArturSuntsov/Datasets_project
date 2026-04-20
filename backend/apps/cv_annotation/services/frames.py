from __future__ import annotations

import subprocess
from pathlib import Path
from typing import List

from PIL import Image

from .upload import absolute_media_path


class FrameExtractionError(RuntimeError):
    pass


def extract_video_frames(file_uri: str, project_id: str, import_id: str, interval_sec: float) -> List[dict]:
    video_path = absolute_media_path(file_uri)
    if not video_path.exists():
        raise FrameExtractionError(f"Video file not found: {file_uri}")

    frames_dir = video_path.parent / f"frames_{Path(video_path).stem}"
    frames_dir.mkdir(parents=True, exist_ok=True)
    output_pattern = str(frames_dir / "frame_%06d.jpg")
    fps_expr = f"fps=1/{interval_sec}"

    try:
        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(video_path), "-vf", fps_expr, "-q:v", "2", "-y", output_pattern],
            capture_output=True,
            text=True,
            timeout=1800,
        )
    except FileNotFoundError as exc:
        raise FrameExtractionError("ffmpeg is not installed or not available in PATH") from exc
    except subprocess.TimeoutExpired as exc:
        raise FrameExtractionError("Video frame extraction timed out") from exc

    if result.returncode != 0:
        raise FrameExtractionError(result.stderr.strip() or "ffmpeg failed to extract frames")

    frame_files = sorted(frames_dir.glob("frame_*.jpg"))
    if not frame_files:
        raise FrameExtractionError("No frames were extracted from the video")

    frames: List[dict] = []
    for index, frame_path in enumerate(frame_files):
        with Image.open(frame_path) as image:
            width, height = image.size
        frame_uri = f"/media/projects/{project_id}/{import_id}/{frames_dir.name}/{frame_path.name}"
        frames.append(
            {
                "frame_uri": frame_uri,
                "frame_number": index,
                "timestamp_sec": round(index * interval_sec, 3),
                "width": width,
                "height": height,
            }
        )
    return frames
