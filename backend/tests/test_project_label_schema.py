import pytest


@pytest.mark.django_db
class TestProjectLabelSchemaValidation:
    def test_rejects_duplicate_label_names(self, client, auth_headers):
        create = client.post(
            "/api/projects/",
            {
                "title": "Test project",
                "project_type": "cv",
                "annotation_type": "bbox",
                "label_schema": [{"name": "drone"}],
            },
            **auth_headers,
            format="json",
        )
        assert create.status_code == 201
        project_id = create.data["id"]

        patch = client.patch(
            f"/api/projects/{project_id}/",
            {"label_schema": [{"name": "drone"}, {"name": "Drone"}]},
            **auth_headers,
            format="json",
        )
        assert patch.status_code == 400

    def test_accepts_rules_and_examples(self, client, auth_headers):
        create = client.post(
            "/api/projects/",
            {
                "title": "Test project",
                "project_type": "cv",
                "annotation_type": "bbox",
                "label_schema": [{"name": "drone"}],
            },
            **auth_headers,
            format="json",
        )
        assert create.status_code == 201
        project_id = create.data["id"]

        patch = client.patch(
            f"/api/projects/{project_id}/",
            {
                "label_schema": [
                    {
                        "name": "drone",
                        "description": "Flying drone",
                        "rules": ["tight box", "mark all visible"],
                        "examples": {"good": ["drone in sky"], "bad": ["bird"]},
                        "attributes": {"occluded": True},
                    }
                ]
            },
            **auth_headers,
            format="json",
        )
        assert patch.status_code == 200
        assert patch.data["label_schema"][0]["name"] == "drone"

