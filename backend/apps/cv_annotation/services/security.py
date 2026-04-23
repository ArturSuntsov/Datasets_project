from __future__ import annotations

from apps.projects.models import Project
from apps.users.models import User
from ..models import SecurityEvent


def log_security_event(project: Project, event_type: str, payload: dict, actor: User | None = None, severity: str = "info") -> None:
    SecurityEvent(
        project=project,
        actor=actor,
        event_type=event_type,
        payload=payload,
        severity=severity,
    ).save()
