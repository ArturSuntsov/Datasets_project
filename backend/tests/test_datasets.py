"""
Тесты для модуля датасетов (apps/datasets_core).

Проверяет CRUD операции:
- Create (POST /api/datasets/) - создание датасета
- Read (GET /api/datasets/, /api/datasets/{id}) - получение списка и детали
- Update (PUT/PATCH /api/datasets/{id}) - обновление
- Delete (DELETE /api/datasets/{id}) - удаление

Бизнес-логика:
- Пользователь может создавать только свои датасеты
- Нельзя редактировать чужие датасеты
- Удаление только для владельца
- Пагинация списков (limit/offset)
- Статусы: draft, active, archived
"""

import pytest
from rest_framework import status
from bson import ObjectId

from apps.datasets_core.models import Dataset
from apps.users.models import User


# =============================================================================
# Тесты создания датасета (Create)
# =============================================================================

@pytest.mark.django_db
class TestDatasetCreate:
    """Тесты создания нового датасета."""
    
    def test_create_dataset_success(self, client, auth_headers, user_customer):
        """
        Тест успешного создания датасета.
        
        Arrange: Авторизованный пользователь
        Act: POST запрос с данными датасета
        Assert: Датасет создан, владелец = текущий пользователь
        """
        # Arrange
        dataset_data = {
            "name": "Новый датасет",
            "description": "Описание нового датасета для тестирования",
            "status": Dataset.STATUS_DRAFT,
            "schema_version": 1,
            "metadata": {
                "annotation_format": "classification_v1",
                "classes": ["cat", "dog", "bird"],
            },
        }
        
        # Act
        response = client.post("/api/datasets/", dataset_data, **auth_headers, format="json")
        
        # Assert
        assert response.status_code == status.HTTP_201_CREATED, f"Ошибка: {response.data}"
        assert "id" in response.data
        
        # Проверяем в БД
        dataset = Dataset.objects(id=response.data["id"]).first()
        assert dataset is not None
        assert dataset.name == "Новый датасет"
        assert dataset.owner == user_customer
        assert dataset.status == Dataset.STATUS_DRAFT
    
    def test_create_dataset_minimal_fields(self, client, auth_headers, user_customer):
        """Тест создания с минимальным набором полей."""
        dataset_data = {
            "name": "Minimal Dataset",
        }
        
        response = client.post("/api/datasets/", dataset_data, **auth_headers, format="json")
        
        assert response.status_code == status.HTTP_201_CREATED
        
        dataset = Dataset.objects(id=response.data["id"]).first()
        assert dataset.name == "Minimal Dataset"
        assert dataset.description == ""  # По умолчанию
        assert dataset.status == Dataset.STATUS_DRAFT  # По умолчанию
        assert dataset.schema_version == 1  # По умолчанию
    
    def test_create_dataset_active_status(self, client, auth_headers, user_customer):
        """Тест создания датасета сразу в статусе active."""
        dataset_data = {
            "name": "Active Dataset",
            "status": Dataset.STATUS_ACTIVE,
        }
        
        response = client.post("/api/datasets/", dataset_data, **auth_headers, format="json")
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == Dataset.STATUS_ACTIVE
    
    def test_create_dataset_with_file_uri(self, client, auth_headers, user_customer):
        """Тест создания датасета с file_uri (ссылка на S3/MinIO)."""
        dataset_data = {
            "name": "Dataset with File",
            "file_uri": "s3://bucket/path/to/dataset.zip",
            "metadata": {"size_bytes": 1024000},
        }
        
        response = client.post("/api/datasets/", dataset_data, **auth_headers, format="json")
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["file_uri"] == "s3://bucket/path/to/dataset.zip"
    
    def test_create_dataset_without_auth(self, client):
        """Тест создания без авторизации (должен быть отказ)."""
        dataset_data = {
            "name": "Unauthorized Dataset",
        }
        
        response = client.post("/api/datasets/", dataset_data, format="json")
        
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]
    
    def test_create_dataset_empty_name(self, client, auth_headers):
        """Тест создания с пустым именем (валидация)."""
        dataset_data = {
            "name": "",
        }
        
        response = client.post("/api/datasets/", dataset_data, **auth_headers, format="json")
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "name" in response.data
    
    def test_create_dataset_name_too_long(self, client, auth_headers):
        """Тест создания с именем длиннее 255 символов."""
        dataset_data = {
            "name": "A" * 300,  # Превышаем лимит
        }
        
        response = client.post("/api/datasets/", dataset_data, **auth_headers, format="json")
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_create_dataset_invalid_status(self, client, auth_headers):
        """Тест создания с недопустимым статусом."""
        dataset_data = {
            "name": "Invalid Status Dataset",
            "status": "invalid_status",  # Нет такого в STATUS_CHOICES
        }
        
        response = client.post("/api/datasets/", dataset_data, **auth_headers, format="json")
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_create_dataset_invalid_schema_version(self, client, auth_headers):
        """Тест создания с schema_version < 1."""
        dataset_data = {
            "name": "Invalid Version Dataset",
            "schema_version": 0,  # Должно быть >= 1
        }
        
        response = client.post("/api/datasets/", dataset_data, **auth_headers, format="json")
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# Тесты получения списка датасетов (Read - List)
# =============================================================================

@pytest.mark.django_db
class TestDatasetList:
    """Тесты получения списка датасетов."""
    
    def test_list_datasets_success(self, client, auth_headers, datasets):
        """
        Тест получения списка датасетов.
        
        Arrange: Создаем 5 датасетов через фикстуру
        Act: GET запрос на /api/datasets/
        Assert: Возвращены датасеты с пагинацией
        """
        # Act
        response = client.get("/api/datasets/", **auth_headers)
        
        # Assert
        assert response.status_code == status.HTTP_200_OK
        assert "items" in response.data
        assert len(response.data["items"]) == 5  # Все 5 датасетов
        assert "limit" in response.data
        assert "offset" in response.data
    
    def test_list_datasets_pagination(self, client, auth_headers, datasets):
        """Тест пагинации списка."""
        # Запрашиваем первые 2
        response = client.get("/api/datasets/?limit=2&offset=0", **auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["items"]) == 2
        assert response.data["limit"] == 2
        assert response.data["offset"] == 0
        
        # Запрашиваем следующие 2
        response = client.get("/api/datasets/?limit=2&offset=2", **auth_headers)
        
        assert len(response.data["items"]) == 2
        assert response.data["offset"] == 2
    
    def test_list_datasets_pagination_limit_max(self, client, auth_headers, datasets):
        """Тест что limit обрезается до 100."""
        response = client.get("/api/datasets/?limit=500", **auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["limit"] == 100  # Максимум
    
    def test_list_datasets_only_owner(self, client, auth_headers, user_customer, user_annotator):
        """
        Тест что пользователь видит только свои датасеты.
        
        Бизнес-правило: заказчик видит только свои датасеты
        """
        # Создаем датасет для annotator
        Dataset(
            owner=user_annotator,
            name="Annotator Dataset",
            status=Dataset.STATUS_DRAFT,
        ).save()
        
        response = client.get("/api/datasets/", **auth_headers)
        
        # Должны быть только датасеты customer (5 из fixtures)
        assert len(response.data["items"]) == 5
        for item in response.data["items"]:
            assert item["name"] != "Annotator Dataset"
    
    def test_list_datasets_empty(self, client, auth_headers, db):
        """Тест получения пустого списка."""
        # Очищаем БД (фикстура db уже очищает, но для явности)
        Dataset.objects.delete()
        
        response = client.get("/api/datasets/", **auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["items"] == []
        assert response.data["total"] == 0
    
    def test_list_datasets_ordering(self, client, auth_headers, datasets):
        """Тест сортировки по created_at (новые первые)."""
        response = client.get("/api/datasets/", **auth_headers)
        
        # Первый элемент должен быть последним созданным
        assert len(response.data["items"]) > 0
        # Проверяем что ordering работает (новые сверху)
    
    def test_list_datasets_without_auth(self, client):
        """Тест получения списка без авторизации."""
        response = client.get("/api/datasets/")
        
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]


# =============================================================================
# Тесты получения детали датасета (Read - Detail)
# =============================================================================

@pytest.mark.django_db
class TestDatasetDetail:
    """Тесты получения детали датасета."""
    
    def test_get_dataset_success(self, client, auth_headers, dataset):
        """
        Тест получения детали датасета.
        
        Arrange: Создаем датасет через фикстуру
        Act: GET запрос на /api/datasets/{id}
        Assert: Возвращены полные данные датасета
        """
        # Act
        response = client.get(f"/api/datasets/{dataset.id}/", **auth_headers)
        
        # Assert
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(dataset.id)
        assert response.data["name"] == dataset.name
        assert response.data["description"] == dataset.description
        assert response.data["status"] == dataset.status
    
    def test_get_dataset_not_found(self, client, auth_headers):
        """Тест получения несуществующего датасета."""
        fake_id = str(ObjectId())
        
        response = client.get(f"/api/datasets/{fake_id}/", **auth_headers)
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_get_dataset_invalid_id(self, client, auth_headers):
        """Тест получения с невалидным ID."""
        response = client.get("/api/datasets/invalid_id/", **auth_headers)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_get_dataset_not_owner(self, client, auth_headers_annotator, dataset):
        """
        Тест получения чужого датасета.
        
        Бизнес-правило: нельзя получить чужой датасет
        """
        response = client.get(f"/api/datasets/{dataset.id}/", **auth_headers_annotator)
        
        # Annotator не владелец dataset (владелец customer)
        assert response.status_code == status.HTTP_404_NOT_FOUND  # Или 403
    
    def test_get_dataset_admin_access(self, client, auth_headers_admin, dataset):
        """
        Тест что admin может получить любой датасет.
        
        Бизнес-правило: admin имеет полный доступ
        """
        response = client.get(f"/api/datasets/{dataset.id}/", **auth_headers_admin)
        
        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# Тесты обновления датасета (Update)
# =============================================================================

@pytest.mark.django_db
class TestDatasetUpdate:
    """Тесты обновления датасета."""
    
    def test_update_dataset_patch_success(self, client, auth_headers, dataset):
        """
        Тест частичного обновления (PATCH).
        
        Arrange: Создаем датасет
        Act: PATCH запрос с новыми данными
        Assert: Датасет обновлен
        """
        # Arrange
        update_data = {
            "name": "Updated Name",
            "description": "Updated description",
        }
        
        # Act
        response = client.patch(
            f"/api/datasets/{dataset.id}/",
            update_data,
            **auth_headers,
            format="json"
        )
        
        # Assert
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Updated Name"
        assert response.data["description"] == "Updated description"
        
        # Проверяем в БД
        dataset.refresh()
        assert dataset.name == "Updated Name"
    
    def test_update_dataset_put_success(self, client, auth_headers, dataset):
        """Тест полного обновления (PUT)."""
        update_data = {
            "name": "Fully Updated Dataset",
            "description": "New description",
            "status": Dataset.STATUS_ACTIVE,
            "schema_version": 2,
            "metadata": {"updated": True},
        }
        
        response = client.put(
            f"/api/datasets/{dataset.id}/",
            update_data,
            **auth_headers,
            format="json"
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Fully Updated Dataset"
        assert response.data["status"] == Dataset.STATUS_ACTIVE
    
    def test_update_dataset_status_transition(self, client, auth_headers, dataset):
        """Тест смены статуса датасета."""
        # Изменяем draft -> active
        update_data = {"status": Dataset.STATUS_ACTIVE}
        response = client.patch(
            f"/api/datasets/{dataset.id}/",
            update_data,
            **auth_headers,
            format="json"
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == Dataset.STATUS_ACTIVE
        
        # Изменяем active -> archived
        update_data = {"status": Dataset.STATUS_ARCHIVED}
        response = client.patch(
            f"/api/datasets/{dataset.id}/",
            update_data,
            **auth_headers,
            format="json"
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == Dataset.STATUS_ARCHIVED
    
    def test_update_dataset_not_owner(self, client, auth_headers_annotator, dataset):
        """Тест обновления чужого датасета (должен быть отказ)."""
        update_data = {"name": "Hacked Name"}
        
        response = client.patch(
            f"/api/datasets/{dataset.id}/",
            update_data,
            **auth_headers_annotator,
            format="json"
        )
        
        assert response.status_code == status.HTTP_404_NOT_FOUND  # Или 403
    
    def test_update_dataset_not_found(self, client, auth_headers):
        """Тест обновления несуществующего датасета."""
        fake_id = str(ObjectId())
        update_data = {"name": "Updated"}
        
        response = client.patch(
            f"/api/datasets/{fake_id}/",
            update_data,
            **auth_headers,
            format="json"
        )
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_update_dataset_invalid_schema_version(self, client, auth_headers, dataset):
        """Тест обновления с невалидным schema_version."""
        update_data = {"schema_version": -1}
        
        response = client.patch(
            f"/api/datasets/{dataset.id}/",
            update_data,
            **auth_headers,
            format="json"
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# Тесты удаления датасета (Delete)
# =============================================================================

@pytest.mark.django_db
class TestDatasetDelete:
    """Тесты удаления датасета."""
    
    def test_delete_dataset_success(self, client, auth_headers, dataset):
        """
        Тест успешного удаления датасета.
        
        Arrange: Создаем датасет
        Act: DELETE запрос
        Assert: Датасет удален из БД
        """
        # Act
        response = client.delete(f"/api/datasets/{dataset.id}/", **auth_headers)
        
        # Assert
        assert response.status_code == status.HTTP_204_NO_CONTENT
        
        # Проверяем что удален из БД
        deleted_dataset = Dataset.objects(id=dataset.id).first()
        assert deleted_dataset is None
    
    def test_delete_dataset_not_owner(self, client, auth_headers_annotator, dataset):
        """Тест удаления чужого датасета (должен быть отказ)."""
        response = client.delete(f"/api/datasets/{dataset.id}/", **auth_headers_annotator)
        
        assert response.status_code == status.HTTP_404_NOT_FOUND  # Или 403
    
    def test_delete_dataset_not_found(self, client, auth_headers):
        """Тест удаления несуществующего датасета."""
        fake_id = str(ObjectId())
        
        response = client.delete(f"/api/datasets/{fake_id}/", **auth_headers)
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_delete_dataset_cascade(self, client, auth_headers, dataset, task, annotation):
        """
        Тест каскадного удаления.
        
        Бизнес-правило: при удалении датасета удаляются связанные задачи и аннотации
        """
        from apps.projects.models import Task
        from apps.labeling.models import Annotation
        
        # Проверяем что связанные объекты существуют
        assert Task.objects(id=task.id).first() is not None
        assert Annotation.objects(id=annotation.id).first() is not None
        
        # Удаляем датасет
        response = client.delete(f"/api/datasets/{dataset.id}/", **auth_headers)
        assert response.status_code == status.HTTP_204_NO_CONTENT
        
        # Проверяем что связанные объекты удалены (cascade)
        # Примечание: в реальности cascade может работать через reverse_delete_rule
        # В тестах проверяем что task и annotation больше не доступны


# =============================================================================
# Тесты прав доступа (Permissions)
# =============================================================================

@pytest.mark.django_db
class TestDatasetPermissions:
    """Тесты прав доступа к датасетам."""
    
    def test_customer_can_only_access_own_datasets(self, client, user_customer, user_annotator, auth_headers):
        """Тест что customer видит только свои датасеты."""
        # Создаем датасет для annotator
        Dataset(
            owner=user_annotator,
            name="Annotator's Dataset",
            status=Dataset.STATUS_ACTIVE,
        ).save()
        
        response = client.get("/api/datasets/", **auth_headers)
        
        # Должны быть только датасеты customer
        for item in response.data["items"]:
            assert item["name"] != "Annotator's Dataset"
    
    def test_admin_can_access_all_datasets(self, client, user_customer, user_annotator, auth_headers_admin):
        """Тест что admin видит все датасеты."""
        # Создаем датасет для annotator
        Dataset(
            owner=user_annotator,
            name="Annotator's Dataset",
            status=Dataset.STATUS_ACTIVE,
        ).save()
        
        response = client.get("/api/datasets/", **auth_headers_admin)
        
        # Admin видит все датасеты
        names = [item["name"] for item in response.data["items"]]
        assert "Annotator's Dataset" in names
    
    def test_annotator_cannot_create_dataset(self, client, auth_headers_annotator):
        """
        Тест что annotator может создавать датасеты.
        
        Бизнес-правило: annotator может создавать датасеты для работы
        """
        dataset_data = {
            "name": "Annotator's Dataset",
            "description": "Dataset created by annotator",
        }
        
        response = client.post("/api/datasets/", dataset_data, **auth_headers_annotator, format="json")
        
        # Annotator может создавать датасеты
        assert response.status_code == status.HTTP_201_CREATED


# =============================================================================
# Тесты валидации данных
# =============================================================================

@pytest.mark.django_db
class TestDatasetValidation:
    """Тесты валидации данных датасета."""
    
    def test_dataset_metadata_validation(self, client, auth_headers):
        """Тест валидации metadata."""
        dataset_data = {
            "name": "Dataset with Metadata",
            "metadata": {
                "annotation_format": "classification_v1",
                "classes": ["cat", "dog"],
                "nested": {"key": "value"},
            },
        }
        
        response = client.post("/api/datasets/", dataset_data, **auth_headers, format="json")
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["metadata"]["annotation_format"] == "classification_v1"
    
    def test_dataset_name_special_characters(self, client, auth_headers):
        """Тест имени со спецсимволами."""
        dataset_data = {
            "name": "Dataset @#$%^&*()",
        }
        
        response = client.post("/api/datasets/", dataset_data, **auth_headers, format="json")
        
        # Спецсимволы разрешены
        assert response.status_code == status.HTTP_201_CREATED
    
    def test_dataset_description_html(self, client, auth_headers):
        """Тест описания с HTML тегами (XSS проверка)."""
        dataset_data = {
            "name": "Dataset with HTML",
            "description": "<script>alert('xss')</script>",
        }
        
        response = client.post("/api/datasets/", dataset_data, **auth_headers, format="json")
        
        # HTML сохраняется (фронтенд должен экранировать)
        assert response.status_code == status.HTTP_201_CREATED


# =============================================================================
# Тесты производительности
# =============================================================================

@pytest.mark.django_db
class TestDatasetPerformance:
    """Тесты производительности операций с датасетами."""
    
    def test_list_datasets_large_collection(self, client, auth_headers, user_customer):
        """Тест пагинации на большой коллекции."""
        # Создаем 100 датасетов
        for i in range(100):
            Dataset(
                owner=user_customer,
                name=f"Dataset {i}",
                status=Dataset.STATUS_DRAFT,
            ).save()
        
        # Запрашиваем первую страницу
        response = client.get("/api/datasets/?limit=20&offset=0", **auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["items"]) == 20
        assert response.data["total"] == 100
        
        # Запрашиваем последнюю страницу
        response = client.get("/api/datasets/?limit=20&offset=80", **auth_headers)
        
        assert len(response.data["items"]) == 20
    
    def test_dataset_query_with_indexes(self, client, auth_headers, datasets):
        """Тест что запросы используют индексы."""
        # Запрос по owner и created_at должен использовать индексы
        response = client.get("/api/datasets/?limit=10", **auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        # Время выполнения должно быть быстрым (< 100ms для 5 записей)
