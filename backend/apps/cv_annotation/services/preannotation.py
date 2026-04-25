from __future__ import annotations

from typing import Dict

from ..models import FrameItem


def generate_preannotation_for_frame(frame: FrameItem, model_name: str = "baseline-box-v1", confidence_threshold: float = 0.7) -> Dict[str, object]:
    # Baseline placeholder predictions created noisy UX because they always drew
    # the same generic box in the middle of the frame. Until a real model is
    # wired in, keep the pre-annotation payload but do not inject fake boxes.
    boxes = []
    return {
        "model": model_name,
        "confidence_threshold": confidence_threshold,
        "is_preannotation": True,
        "is_placeholder": True,
        "frame_id": str(frame.id),
        "boxes": boxes,
    }
