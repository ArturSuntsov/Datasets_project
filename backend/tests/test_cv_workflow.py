import io
import pytest
from PIL import Image

from apps.cv_annotation.models import Assignment, ReviewRecord, WorkItem
from apps.projects.models import Project
from apps.users.serializers import create_access_token


def make_test_image(name: str = "frame.png"):
    image = Image.new("RGB", (128, 96), color=(255, 255, 255))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    buffer.name = name
    return buffer


@pytest.mark.django_db
class TestUnifiedCvWorkflow:
    def test_customer_can_create_cv_project(self, client, auth_headers, user_annotator, user_reviewer):
        payload = {
            "title": "Drone project",
            "description": "BBox drone dataset",
            "project_type": "cv",
            "annotation_type": "bbox",
            "instructions": "Annotate every drone",
            "label_schema": [{"name": "drone"}],
            "allowed_annotator_ids": [str(user_annotator.id)],
            "allowed_reviewer_ids": [str(user_reviewer.id)],
            "frame_interval_sec": 1.0,
            "assignments_per_task": 2,
            "agreement_threshold": 0.75,
            "iou_threshold": 0.5,
        }
        response = client.post("/api/projects/", payload, **auth_headers, format="json")
        assert response.status_code == 201
        assert response.data["project_type"] == "cv"
        assert response.data["allowed_reviewer_ids"] == [str(user_reviewer.id)]

    def test_image_import_finalize_and_queue(self, client, auth_headers, auth_headers_annotator, auth_headers_reviewer, user_customer, user_annotator, user_reviewer):
        second_annotator = user_annotator
        payload = {
            "title": "Drone project",
            "description": "BBox drone dataset",
            "project_type": "cv",
            "annotation_type": "bbox",
            "instructions": "Annotate every drone",
            "label_schema": [{"name": "drone"}],
            "allowed_annotator_ids": [str(user_annotator.id)],
            "allowed_reviewer_ids": [str(user_reviewer.id)],
            "assignments_per_task": 1,
        }
        project_resp = client.post("/api/projects/", payload, **auth_headers, format="json")
        project_id = project_resp.data["id"]

        upload = make_test_image()
        response = client.post(
            f"/api/projects/{project_id}/imports/",
            {"file": upload},
            **auth_headers,
        )
        assert response.status_code == 201
        import_id = response.data["import_id"]
        assert response.data["preview"]["frames_total"] == 1

        finalize = client.post(f"/api/projects/{project_id}/imports/{import_id}/finalize/", {}, **auth_headers, format="json")
        assert finalize.status_code == 200
        assert finalize.data["overview"]["work_items"]["total"] == 1

        queue = client.get("/api/annotator/queue/", **auth_headers_annotator)
        assert queue.status_code == 200
        assert len(queue.data["items"]) == 1
        assert queue.data["items"][0]["project_id"] == project_id

    def test_conflict_goes_to_reviewer_and_can_be_resolved(self, client, auth_headers, auth_headers_reviewer, user_annotator, user_reviewer):
        from apps.users.models import User

        second_annotator = User(email="annotator2@example.com", username="annotator_two", role=User.ROLE_ANNOTATOR)
        second_annotator.set_password("password123")
        second_annotator.save()

        project_resp = client.post(
            "/api/projects/",
            {
                "title": "Conflict project",
                "project_type": "cv",
                "annotation_type": "bbox",
                "instructions": "Find drones",
                "label_schema": [{"name": "drone"}],
                "allowed_annotator_ids": [str(user_annotator.id), str(second_annotator.id)],
                "allowed_reviewer_ids": [str(user_reviewer.id)],
                "assignments_per_task": 2,
                "agreement_threshold": 0.9,
                "iou_threshold": 0.5,
            },
            **auth_headers,
            format="json",
        )
        project_id = project_resp.data["id"]

        upload = make_test_image("conflict.png")
        upload_resp = client.post(f"/api/projects/{project_id}/imports/", {"file": upload}, **auth_headers)
        import_id = upload_resp.data["import_id"]
        client.post(f"/api/projects/{project_id}/imports/{import_id}/finalize/", {}, **auth_headers, format="json")

        assignments = list(Assignment.objects(project=Project.objects.get(id=project_id)).order_by("order_index"))
        assert len(assignments) == 2

        token_one = client.get(f"/api/annotator/assignments/{assignments[0].id}/", HTTP_AUTHORIZATION=f"Bearer {create_access_token(user_annotator)}")
        assert token_one.status_code == 200

        submit_one = client.post(
            f"/api/annotator/assignments/{assignments[0].id}/submit/",
            {"label_data": {"boxes": [{"x": 10, "y": 10, "width": 20, "height": 20, "label": "drone"}]}, "is_final": True},
            HTTP_AUTHORIZATION=f"Bearer {create_access_token(user_annotator)}",
            format="json",
        )
        assert submit_one.status_code == 200

        submit_two = client.post(
            f"/api/annotator/assignments/{assignments[1].id}/submit/",
            {"label_data": {"boxes": [{"x": 70, "y": 50, "width": 18, "height": 18, "label": "drone"}]}, "is_final": True},
            HTTP_AUTHORIZATION=f"Bearer {create_access_token(second_annotator)}",
            format="json",
        )
        assert submit_two.status_code == 200
        assert submit_two.data["evaluation"]["state"] == "review"

        reviewer_queue = client.get("/api/reviewer/queue/", **auth_headers_reviewer)
        assert reviewer_queue.status_code == 200
        assert len(reviewer_queue.data["items"]) == 1
        review_id = reviewer_queue.data["items"][0]["review_id"]

        resolve = client.post(
            f"/api/reviews/{review_id}/resolve/",
            {"resolution": {"boxes": [{"x": 12, "y": 12, "width": 22, "height": 22, "label": "drone"}]}},
            **auth_headers_reviewer,
            format="json",
        )
        assert resolve.status_code == 200

        review = ReviewRecord.objects.get(id=review_id)
        work_item = WorkItem.objects.get(id=review.work_item.id)
        assert review.status == ReviewRecord.STATUS_RESOLVED
        assert work_item.status == WorkItem.STATUS_COMPLETED
        assert work_item.final_source == "reviewer"
