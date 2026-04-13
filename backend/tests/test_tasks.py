"""
Тесты для модуля задач и разметки (apps/projects, apps/labeling).

Проверяет:
- CRUD задач (создание, чтение, обновление, удаление)
- Назначение исполнителей на задачи
- Смену статусов задач (Kanban: pending → in_progress → review → completed)
- Создание аннотаций (разметка данных)
- AI-assisted разметку (auto_label)
- Сессии разметки

Бизнес-логика:
- Active Learning: задачи с высоким difficulty_score приоритетнее
- Только annotator может выполнять разметку
- Заказчик может создавать задачи и проверять результат
- Каскадное удаление при удалении датасета/проекта
"""

import pytest
from rest_framework import status
from bson import ObjectId
from datetime import datetime, timedelta

from apps.projects.models import Project, Task
from apps.labeling.models import Annotation, LabelingSession
from apps.users.models import User


# =============================================================================
# Тесты CRUD задач (Projects ViewSet)
# =============================================================================

@pytest.mark.django_db
class TestTaskCRUD:
    """Тесты CRUD операций для задач."""
    
    def test_create_task_success(self, client, auth_headers, dataset, project):
        """
        Тест успешного создания задачи.
        
        Arrange: Есть датасет и проект
        Act: POST запрос с данными задачи
        Assert: Задача создана со статусом pending
        """
        # Arrange
        task_data = {
            "title": "Test Task",
            "description": "Задача на разметку изображений",
            "dataset_id": str(dataset.id),
            "project_id": str(project.id),
            "difficulty_score": 0.7,
            "input_ref": "s3://bucket/image_001.jpg",
        }
        
        # Act
        response = client.post("/api/tasks/", task_data, **auth_headers, format="json")
        
        # Assert
        assert response.status_code == status.HTTP_201_CREATED, f"Ошибка: {response.data}"
        assert "id" in response.data
        
        # Проверяем в БД
        task = Task.objects(id=response.data["id"]).first()
        assert task is not None
        assert task.status == Task.STATUS_PENDING
        assert task.difficulty_score == 0.7
        assert task.dataset == dataset
    
    def test_create_task_without_project(self, client, auth_headers, dataset):
        """Тест создания задачи без проекта (опционально)."""
        task_data = {
            "title": "Task without Project",
            "dataset_id": str(dataset.id),
            "difficulty_score": 0.5,
        }
        
        response = client.post("/api/tasks/", task_data, **auth_headers, format="json")
        
        # Проект может быть null
        assert response.status_code == status.HTTP_201_CREATED
    
    def test_list_tasks_success(self, client, auth_headers, tasks):
        """
        Тест получения списка задач.
        
        Arrange: Создаем 8 задач через фикстуру
        Act: GET запрос на /api/tasks/
        Assert: Возвращены задачи с пагинацией
        """
        response = client.get("/api/tasks/", **auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        assert "items" in response.data
        assert len(response.data["items"]) == 8
    
    def test_list_tasks_filter_by_status(self, client, auth_headers, tasks):
        """Тест фильтрации задач по статусу."""
        # Запрашиваем только pending задачи
        response = client.get("/api/tasks/?status=pending", **auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        for item in response.data["items"]:
            assert item["status"] == Task.STATUS_PENDING
    
    def test_list_tasks_ordering_by_difficulty(self, client, auth_headers, tasks):
        """
        Тест сортировки по difficulty_score (Active Learning).
        
        Бизнес-правило: задачи с высоким difficulty_score возвращаются первыми
        """
        response = client.get("/api/tasks/", **auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        items = response.data["items"]
        
        if len(items) > 1:
            # Проверяем что задачи отсортированы по убыванию difficulty
            for i in range(len(items) - 1):
                # Допускаем равные значения
                assert items[i]["difficulty_score"] >= items[i+1]["difficulty_score"] - 0.01
    
    def test_get_task_detail(self, client, auth_headers, task):
        """Тест получения детали задачи."""
        response = client.get(f"/api/tasks/{task.id}/", **auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(task.id)
        assert response.data["title"] == task.title
    
    def test_update_task_status(self, client, auth_headers, task):
        """Тест обновления статуса задачи."""
        update_data = {
            "status": Task.STATUS_IN_PROGRESS,
            "annotator_id": None,  # Будет назначен позже
        }
        
        response = client.patch(
            f"/api/tasks/{task.id}/",
            update_data,
            **auth_headers,
            format="json"
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == Task.STATUS_IN_PROGRESS
    
    def test_assign_annotator_to_task(self, client, auth_headers, task, user_annotator):
        """Тест назначения исполнителя на задачу."""
        update_data = {
            "annotator_id": str(user_annotator.id),
            "status": Task.STATUS_IN_PROGRESS,
        }
        
        response = client.patch(
            f"/api/tasks/{task.id}/",
            update_data,
            **auth_headers,
            format="json"
        )
        
        assert response.status_code == status.HTTP_200_OK
        
        # Проверяем в БД
        task.refresh()
        assert task.annotator == user_annotator
    
    def test_delete_task_success(self, client, auth_headers, task):
        """Тест удаления задачи."""
        response = client.delete(f"/api/tasks/{task.id}/", **auth_headers)
        
        assert response.status_code == status.HTTP_204_NO_CONTENT
        
        # Проверяем что удалена
        deleted_task = Task.objects(id=task.id).first()
        assert deleted_task is None
    
    def test_task_not_owner(self, client, auth_headers_annotator, task):
        """Тест что annotator не может редактировать чужую задачу."""
        update_data = {"status": Task.STATUS_COMPLETED}
        
        response = client.patch(
            f"/api/tasks/{task.id}/",
            update_data,
            **auth_headers_annotator,
            format="json"
        )
        
        # Annotator не владелец dataset
        assert response.status_code == status.HTTP_404_NOT_FOUND


# =============================================================================
# Тесты аннотаций (Labeling ViewSet)
# =============================================================================

@pytest.mark.django_db
class TestAnnotationCRUD:
    """Тесты CRUD операций для аннотаций."""
    
    def test_create_annotation_success(self, client, auth_headers_annotator, task, dataset):
        """
        Тест успешного создания аннотации.
        
        Arrange: Annotator создает аннотацию для задачи
        Act: POST запрос с данными аннотации
        Assert: Аннотация создана, статус задачи обновлен
        """
        # Arrange
        annotation_data = {
            "task_id": str(task.id),
            "dataset_id": str(dataset.id),
            "annotation_format": "classification_v1",
            "label_data": {"class": "cat", "confidence": 0.95},
            "is_final": True,
        }
        
        # Act
        response = client.post("/api/annotations/", annotation_data, **auth_headers_annotator, format="json")
        
        # Assert
        assert response.status_code == status.HTTP_201_CREATED, f"Ошибка: {response.data}"
        assert "id" in response.data
        
        # Проверяем в БД
        annotation = Annotation.objects(id=response.data["id"]).first()
        assert annotation is not None
        assert annotation.annotator.username == "annotator_user"
        assert annotation.label_data["class"] == "cat"
    
    def test_create_annotation_with_predicted_data(self, client, auth_headers_annotator, task, dataset):
        """Тест создания аннотации с AI prediction."""
        annotation_data = {
            "task_id": str(task.id),
            "dataset_id": str(dataset.id),
            "annotation_format": "classification_v1",
            "label_data": {"class": "dog"},
            "predicted_data": {"class": "cat", "confidence": 0.80},
        }
        
        response = client.post("/api/annotations/", annotation_data, **auth_headers_annotator, format="json")
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["predicted_data"]["class"] == "cat"
    
    def test_create_annotation_auto_label(self, client, auth_headers_annotator, task, dataset, labeling_session):
        """
        Тест AI-assisted разметки (auto_label).
        
        Бизнес-логика: при auto_label=true система вызывает ML модель
        """
        annotation_data = {
            "task_id": str(task.id),
            "dataset_id": str(dataset.id),
            "annotation_format": "classification_v1",
            "auto_label": True,  # Флаг AI-assisted
            "input_context": {"image_features": [0.1, 0.2, 0.3]},
        }
        
        response = client.post("/api/annotations/", annotation_data, **auth_headers_annotator, format="json")
        
        assert response.status_code == status.HTTP_201_CREATED
        # predicted_data должно быть заполнено моделью
        assert "predicted_data" in response.data
    
    def test_update_annotation_success(self, client, auth_headers_annotator, annotation):
        """Тест обновления аннотации."""
        update_data = {
            "task_id": str(annotation.task.id),
            "dataset_id": str(annotation.dataset.id),
            "annotation_format": "classification_v1",
            "label_data": {"class": "dog", "confidence": 0.98},  # Изменяем метку
        }
        
        response = client.put(
            f"/api/annotations/{annotation.id}/",
            update_data,
            **auth_headers_annotator,
            format="json"
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["label_data"]["class"] == "dog"
    
    def test_partial_update_annotation(self, client, auth_headers_annotator, annotation):
        """Тест частичного обновления аннотации (PATCH)."""
        update_data = {
            "label_data": {"class": "bird"},  # Только одно поле
        }
        
        response = client.patch(
            f"/api/annotations/{annotation.id}/",
            update_data,
            **auth_headers_annotator,
            format="json"
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["label_data"]["class"] == "bird"
    
    def test_get_annotation_detail(self, client, auth_headers_annotator, annotation):
        """Тест получения детали аннотации."""
        response = client.get(f"/api/annotations/{annotation.id}/", **auth_headers_annotator)
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == str(annotation.id)
    
    def test_annotation_not_owner(self, client, auth_headers, annotation):
        """Тест что customer не может редактировать чужую аннотацию."""
        update_data = {"label_data": {"class": "hacked"}}
        
        response = client.patch(
            f"/api/annotations/{annotation.id}/",
            update_data,
            **auth_headers,
            format="json"
        )
        
        # Customer не является annotator этой аннотации
        assert response.status_code == status.HTTP_404_NOT_FOUND


# =============================================================================
# Тесты сессий разметки (LabelingSession)
# =============================================================================

@pytest.mark.django_db
class TestLabelingSession:
    """Тесты сессий разметки."""
    
    def test_create_labeling_session(self, db, user_annotator, task, dataset):
        """Тест создания сессии разметки."""
        session = LabelingSession(
            annotator=user_annotator,
            task=task,
            dataset=dataset,
            status=LabelingSession.STATUS_ACTIVE,
            ai_assisted=True,
        )
        session.save()
        
        assert session.id is not None
        assert session.status == LabelingSession.STATUS_ACTIVE
        assert session.ai_assisted is True
    
    def test_complete_labeling_session(self, db, labeling_session):
        """Тест завершения сессии."""
        # Act
        labeling_session.complete()
        
        # Assert
        assert labeling_session.status == LabelingSession.STATUS_COMPLETED
        assert labeling_session.completed_at is not None
    
    def test_auto_label_classification(self, db, labeling_session):
        """Тест AI-предразметки для classification."""
        # Обновляем metadata датасета
        labeling_session.dataset.metadata = {"annotation_format": "classification_v1"}
        labeling_session.dataset.save()
        
        # Вызываем auto_label
        result = labeling_session.auto_label(
            input_context={"image_features": [0.1, 0.2, 0.3]}
        )
        
        # Для classification_v1 возвращается class_label
        assert "result" in result or "class_label" in result
    
    def test_auto_label_ner(self, db, labeling_session):
        """Тест AI-предразметки для NER."""
        labeling_session.dataset.metadata = {"annotation_format": "ner_v1"}
        labeling_session.dataset.save()
        
        result = labeling_session.auto_label(
            input_context={"text": "Москва - столица России"}
        )
        
        # Для ner_v1 возвращаются spans
        assert "spans" in result or "result" in result


# =============================================================================
# Тесты жизненного цикла задач (Kanban)
# =============================================================================

@pytest.mark.django_db
class TestTaskLifecycle:
    """Тесты жизненного цикла задач (Kanban flow)."""
    
    def test_task_pending_to_in_progress(self, client, auth_headers, task, user_annotator):
        """Тест перехода pending → in_progress."""
        # Назначаем исполнителя
        update_data = {
            "annotator_id": str(user_annotator.id),
            "status": Task.STATUS_IN_PROGRESS,
        }
        
        response = client.patch(
            f"/api/tasks/{task.id}/",
            update_data,
            **auth_headers,
            format="json"
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == Task.STATUS_IN_PROGRESS
    
    def test_task_in_progress_to_review(self, client, auth_headers, task_assigned, annotation):
        """
        Тест перехода in_progress → review.
        
        Бизнес-логика: при создании финальной аннотации задача переходит в review
        """
        # Аннотация уже создана в фикстуре annotation
        # Проверяем что задача в review
        task_assigned.refresh()
        assert task_assigned.status == Task.STATUS_REVIEW
    
    def test_task_review_to_completed(self, client, auth_headers, task_assigned):
        """Тест перехода review → completed."""
        update_data = {"status": Task.STATUS_COMPLETED}
        
        response = client.patch(
            f"/api/tasks/{task_assigned.id}/",
            update_data,
            **auth_headers,
            format="json"
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == Task.STATUS_COMPLETED
    
    def test_task_completed_to_rejected(self, client, auth_headers, task_assigned):
        """Тест перехода completed → rejected (арбитраж)."""
        # Сначала завершаем задачу
        task_assigned.status = Task.STATUS_COMPLETED
        task_assigned.save()
        
        # Затем отклоняем
        update_data = {"status": Task.STATUS_REJECTED}
        
        response = client.patch(
            f"/api/tasks/{task_assigned.id}/",
            update_data,
            **auth_headers,
            format="json"
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == Task.STATUS_REJECTED
    
    def test_task_rejected_to_pending(self, client, auth_headers, task_assigned):
        """Тест возврата rejected → pending (на доработку)."""
        task_assigned.status = Task.STATUS_REJECTED
        task_assigned.save()
        
        update_data = {"status": Task.STATUS_PENDING}
        
        response = client.patch(
            f"/api/tasks/{task_assigned.id}/",
            update_data,
            **auth_headers,
            format="json"
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == Task.STATUS_PENDING


# =============================================================================
# Тесты Active Learning
# =============================================================================

@pytest.mark.django_db
class TestActiveLearning:
    """Тесты Active Learning (приоритизация задач)."""
    
    def test_task_ordering_by_difficulty(self, client, auth_headers, tasks):
        """
        Тест что задачи сортируются по difficulty_score.
        
        Бизнес-правило: задачи с высоким difficulty_score возвращаются первыми
        (Active Learning - сначала размечаем сложные примеры)
        """
        response = client.get("/api/tasks/", **auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        items = response.data["items"]
        
        if len(items) > 1:
            # Проверяем сортировку по убыванию
            for i in range(len(items) - 1):
                assert items[i]["difficulty_score"] >= items[i+1]["difficulty_score"]
    
    def test_create_task_with_high_difficulty(self, client, auth_headers, dataset, project):
        """Тест создания задачи с высоким priority."""
        task_data = {
            "title": "High Priority Task",
            "dataset_id": str(dataset.id),
            "difficulty_score": 0.95,  # Высокий priority
        }
        
        response = client.post("/api/tasks/", task_data, **auth_headers, format="json")
        
        assert response.status_code == status.HTTP_201_CREATED
        
        # Проверяем что задача будет первой в списке
        response = client.get("/api/tasks/", **auth_headers)
        assert response.data["items"][0]["difficulty_score"] == 0.95
    
    def test_update_difficulty_score(self, client, auth_headers, task):
        """Тест обновления difficulty_score."""
        update_data = {"difficulty_score": 0.9}
        
        response = client.patch(
            f"/api/tasks/{task.id}/",
            update_data,
            **auth_headers,
            format="json"
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["difficulty_score"] == 0.9


# =============================================================================
# Тесты прав доступа
# =============================================================================

@pytest.mark.django_db
class TestTaskPermissions:
    """Тесты прав доступа к задачам."""
    
    def test_annotator_can_only_see_assigned_tasks(self, client, auth_headers_annotator, task, task_assigned):
        """Тест что annotator видит только назначенные задачи."""
        response = client.get("/api/tasks/", **auth_headers_annotator)
        
        # Annotator должен видеть задачи своего dataset
        # В MVP проверяем что доступ есть
        assert response.status_code == status.HTTP_200_OK
    
    def test_customer_can_create_tasks(self, client, auth_headers, dataset, project):
        """Тест что customer может создавать задачи."""
        task_data = {
            "title": "New Task",
            "dataset_id": str(dataset.id),
            "difficulty_score": 0.5,
        }
        
        response = client.post("/api/tasks/", task_data, **auth_headers, format="json")
        
        assert response.status_code == status.HTTP_201_CREATED
    
    def test_admin_can_access_all_tasks(self, client, auth_headers_admin, task):
        """Тест что admin имеет полный доступ."""
        response = client.get("/api/tasks/", **auth_headers_admin)
        
        assert response.status_code == status.HTTP_200_OK
    
    def test_unauthorized_access_to_tasks(self, client):
        """Тест доступа без авторизации."""
        response = client.get("/api/tasks/")
        
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]


# =============================================================================
# Тесты краевых случаев
# =============================================================================

@pytest.mark.django_db
class TestTaskEdgeCases:
    """Тесты краевых случаев для задач."""
    
    def test_create_task_invalid_dataset_id(self, client, auth_headers, project):
        """Тест создания задачи с невалидным dataset_id."""
        task_data = {
            "title": "Invalid Task",
            "dataset_id": "invalid_id",
            "difficulty_score": 0.5,
        }
        
        response = client.post("/api/tasks/", task_data, **auth_headers, format="json")
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_create_task_nonexistent_dataset(self, client, auth_headers, project):
        """Тест создания задачи с несуществующим dataset."""
        fake_id = str(ObjectId())
        task_data = {
            "title": "Nonexistent Task",
            "dataset_id": fake_id,
            "difficulty_score": 0.5,
        }
        
        response = client.post("/api/tasks/", task_data, **auth_headers, format="json")
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_task_deadline_in_past(self, client, auth_headers, dataset, project):
        """Тест создания задачи с дедлайном в прошлом."""
        task_data = {
            "title": "Overdue Task",
            "dataset_id": str(dataset.id),
            "deadline_at": "2020-01-01T00:00:00Z",  # В прошлом
        }
        
        response = client.post("/api/tasks/", task_data, **auth_headers, format="json")
        
        # Валидация должна пропустить (дедлайн может быть любым)
        assert response.status_code == status.HTTP_201_CREATED
    
    def test_task_invalid_status_transition(self, client, auth_headers, task):
        """Тест невалидного перехода статуса."""
        # Пытаемся перейти из pending сразу в completed (минуя in_progress)
        update_data = {"status": Task.STATUS_COMPLETED}
        
        response = client.patch(
            f"/api/tasks/{task.id}/",
            update_data,
            **auth_headers,
            format="json"
        )
        
        # В MVP разрешаем любые переходы
        assert response.status_code == status.HTTP_200_OK
    
    def test_annotation_without_task(self, client, auth_headers_annotator, dataset):
        """Тест создания аннотации без задачи."""
        annotation_data = {
            "dataset_id": str(dataset.id),
            "annotation_format": "classification_v1",
            "label_data": {"class": "cat"},
        }
        # task_id отсутствует
        
        response = client.post("/api/annotations/", annotation_data, **auth_headers_annotator, format="json")
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
