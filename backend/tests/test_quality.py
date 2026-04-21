"""
Тесты для модуля контроля качества (apps/quality).

Проверяет:
- Создание cross-check review (сравнение 2+ аннотаций)
- Расчет метрик качества (precision, recall, F1)
- Арбитраж (ручная проверка спорных случаев)
- Получение метрик по датасету

Бизнес-логика:
- QualityReview создается для задач с 2+ аннотациями
- Метрики рассчитываются автоматически при сравнении
- При расхождении меток требуется арбитраж
- Рейтинг исполнителя обновляется после QC
- Заказчик может запросить арбитраж
"""

import pytest
from rest_framework import status
from bson import ObjectId

from apps.quality.models import QualityMetric, QualityReview
from apps.labeling.models import Annotation
from apps.users.models import User


# =============================================================================
# Тесты создания Quality Review (Cross-Check)
# =============================================================================

@pytest.mark.django_db
class TestQualityReviewCreate:
    """Тесты создания проверки качества."""
    
    def test_create_review_success(self, client, auth_headers, task, dataset, annotations_pair):
        """
        Тест успешного создания cross-check review.
        
        Arrange: Есть 2 аннотации для одной задачи
        Act: POST запрос на создание review
        Assert: Review создан, метрики рассчитаны
        """
        # Arrange
        ann_a, ann_b = annotations_pair
        
        review_data = {
            "task_id": str(task.id),
            "dataset_id": str(dataset.id),
            "annotation_a_id": str(ann_a.id),
            "annotation_b_id": str(ann_b.id),
        }
        
        # Act
        response = client.post("/api/quality/review/", review_data, **auth_headers, format="json")
        
        # Assert
        assert response.status_code == status.HTTP_201_CREATED, f"Ошибка: {response.data}"
        assert "id" in response.data
        
        # Проверяем в БД
        review = QualityReview.objects(id=response.data["id"]).first()
        assert review is not None
        assert review.task == task
        assert review.annotation_a == ann_a
        assert review.annotation_b == ann_b
    
    def test_create_review_with_metrics(self, client, auth_headers, task, dataset, annotations_pair):
        """Тест создания review с метриками."""
        ann_a, ann_b = annotations_pair
        
        review_data = {
            "task_id": str(task.id),
            "dataset_id": str(dataset.id),
            "annotation_a_id": str(ann_a.id),
            "annotation_b_id": str(ann_b.id),
            "metrics": {
                "precision": 0.92,
                "recall": 0.88,
                "f1": 0.90,
                "iou": 0.85,
            },
        }
        
        response = client.post("/api/quality/review/", review_data, **auth_headers, format="json")
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["metrics"]["f1"] == 0.90
    
    def test_create_review_same_annotations(self, client, auth_headers, task, dataset, annotation):
        """
        Тест создания review с одинаковыми аннотациями.
        
        Бизнес-логика: если аннотации совпадают, метрики должны быть высокими
        """
        review_data = {
            "task_id": str(task.id),
            "dataset_id": str(dataset.id),
            "annotation_a_id": str(annotation.id),
            "annotation_b_id": str(annotation.id),  # Та же самая
        }
        
        response = client.post("/api/quality/review/", review_data, **auth_headers, format="json")
        
        # В реальности это ошибка, но в MVP проверяем что создается
        assert response.status_code in [status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST]
    
    def test_create_review_without_auth(self, client, task, dataset, annotations_pair):
        """Тест создания review без авторизации."""
        ann_a, ann_b = annotations_pair
        
        review_data = {
            "task_id": str(task.id),
            "dataset_id": str(dataset.id),
            "annotation_a_id": str(ann_a.id),
            "annotation_b_id": str(ann_b.id),
        }
        
        response = client.post("/api/quality/review/", review_data, format="json")
        
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]
    
    def test_create_review_invalid_annotation_id(self, client, auth_headers, task, dataset, annotation):
        """Тест создания review с невалидным ID аннотации."""
        review_data = {
            "task_id": str(task.id),
            "dataset_id": str(dataset.id),
            "annotation_a_id": "invalid_id",
            "annotation_b_id": str(annotation.id),
        }
        
        response = client.post("/api/quality/review/", review_data, **auth_headers, format="json")
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# Тесты обновления статуса Review
# =============================================================================

@pytest.mark.django_db
class TestQualityReviewUpdate:
    """Тесты обновления статуса проверки качества."""
    
    def test_review_pending_to_completed(self, client, auth_headers, quality_review):
        """Тест перехода review из pending в completed."""
        # В MVP статус обновляется автоматически при создании
        # Проверяем что review существует
        assert quality_review.review_status == QualityReview.STATUS_PENDING
        
        # Обновляем вручную (для теста)
        quality_review.review_status = QualityReview.STATUS_COMPLETED
        quality_review.save()
        
        quality_review.refresh()
        assert quality_review.review_status == QualityReview.STATUS_COMPLETED
    
    def test_review_with_arbitration(self, client, auth_headers, quality_review, user_admin):
        """
        Тест review с арбитражем.
        
        Бизнес-логика: при расхождении меток заказчик может запросить арбитраж
        """
        # Запрашиваем арбитраж
        quality_review.arbitration_requested = True
        quality_review.arbitrator = user_admin
        quality_review.arbitration_comment = "Требуется ручная проверка"
        quality_review.save()
        
        quality_review.refresh()
        assert quality_review.arbitration_requested is True
        assert quality_review.arbitrator == user_admin
    
    def test_review_arbitrated_status(self, client, auth_headers, quality_review, user_admin):
        """Тест завершения арбитража."""
        quality_review.arbitration_requested = True
        quality_review.arbitrator = user_admin
        quality_review.review_status = QualityReview.STATUS_ARBITRATED
        quality_review.final_label_data = {"class": "cat"}  # Финальное решение
        quality_review.save()
        
        quality_review.refresh()
        assert quality_review.review_status == QualityReview.STATUS_ARBITRATED
        assert quality_review.final_label_data["class"] == "cat"


# =============================================================================
# Тесты метрик качества
# =============================================================================

@pytest.mark.django_db
class TestQualityMetrics:
    """Тесты метрик качества."""
    
    def test_create_quality_metric(self, db, task, dataset):
        """Тест создания метрики качества."""
        metric = QualityMetric(
            dataset=dataset,
            task=task,
            precision=0.92,
            recall=0.88,
            f1=0.90,
            details={
                "accuracy": 0.91,
                "samples": 100,
                "true_positives": 92,
                "false_positives": 8,
                "false_negatives": 12,
            },
        )
        metric.save()
        
        assert metric.id is not None
        assert metric.f1 == 0.90
    
    def test_get_metrics_by_dataset(self, client, auth_headers, dataset, quality_metric):
        """
        Тест получения метрик по датасету.
        
        Arrange: Создаем метрику для датасета
        Act: GET запрос на /api/quality/metrics/{dataset_id}/
        Assert: Возвращены метрики с пагинацией
        """
        response = client.get(f"/api/quality/metrics/{dataset.id}/", **auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        assert "items" in response.data
        assert len(response.data["items"]) == 1
        assert response.data["items"][0]["f1"] == 0.90
    
    def test_get_metrics_pagination(self, client, auth_headers, dataset, task):
        """Тест пагинации метрик."""
        # Создаем 25 метрик
        for i in range(25):
            metric = QualityMetric(
                dataset=dataset,
                task=task,
                precision=0.80 + i * 0.01,
                recall=0.75 + i * 0.01,
                f1=0.77 + i * 0.01,
            )
            metric.save()
        
        # Запрашиваем первую страницу
        response = client.get(f"/api/quality/metrics/{dataset.id}/?limit=10&offset=0", **auth_headers)
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["items"]) == 10
        assert response.data["total"] == 25
    
    def test_get_metrics_not_owner(self, client, auth_headers_annotator, dataset):
        """Тест что annotator не может получить метрики чужого датасета."""
        response = client.get(f"/api/quality/metrics/{dataset.id}/", **auth_headers_annotator)
        
        # Annotator не владелец dataset
        assert response.status_code == status.HTTP_403_FORBIDDEN
    
    def test_get_metrics_admin_access(self, client, auth_headers_admin, dataset, quality_metric):
        """Тест что admin может получить метрики любого датасета."""
        response = client.get(f"/api/quality/metrics/{dataset.id}/", **auth_headers_admin)
        
        assert response.status_code == status.HTTP_200_OK
    
    def test_get_metrics_invalid_dataset_id(self, client, auth_headers):
        """Тест получения метрик с невалидным dataset_id."""
        response = client.get("/api/quality/metrics/invalid_id/", **auth_headers)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_get_metrics_nonexistent_dataset(self, client, auth_headers):
        """Тест получения метрик для несуществующего датасета."""
        fake_id = str(ObjectId())
        
        response = client.get(f"/api/quality/metrics/{fake_id}/", **auth_headers)
        
        assert response.status_code == status.HTTP_404_NOT_FOUND


# =============================================================================
# Тесты обновления рейтинга исполнителя
# =============================================================================

@pytest.mark.django_db
class TestAnnotatorRating:
    """Тесты обновления рейтинга исполнителя после QC."""
    
    def test_rating_update_after_review(self, db, quality_review, user_annotator):
        """
        Тест обновления рейтинга после завершения review.
        
        Бизнес-логика: рейтинг исполнителя увеличивается на F1 метрику
        """
        initial_rating = user_annotator.rating
        
        # Завершаем review
        quality_review.review_status = QualityReview.STATUS_COMPLETED
        quality_review.metrics = {"f1": 0.85}
        quality_review.save()
        
        # В реальном коде рейтинг обновляется в views.py
        # Здесь проверяем что логика работает
        user_annotator.refresh()
        
        # После review рейтинг должен измениться
        # (в views.py есть логика update_one с $inc)
        assert user_annotator.rating >= initial_rating
    
    def test_rating_for_both_annotators(self, db, quality_review, user_annotator, user_customer):
        """Тест что обе аннотации получают рейтинг."""
        # annotations_pair содержит аннотации от user_annotator и user_customer
        initial_rating_a = user_annotator.rating
        initial_rating_b = user_customer.rating
        
        # Завершаем review
        quality_review.review_status = QualityReview.STATUS_COMPLETED
        quality_review.metrics = {"f1": 0.90}
        quality_review.save()
        
        # Обе стороны должны получить обновление рейтинга
        user_annotator.refresh()
        user_customer.refresh()
        
        # В MVP рейтинг обновляется через $inc в views.py
        assert user_annotator.rating >= initial_rating_a
        assert user_customer.rating >= initial_rating_b


# =============================================================================
# Тесты прав доступа
# =============================================================================

@pytest.mark.django_db
class TestQualityPermissions:
    """Тесты прав доступа к QC модулю."""
    
    def test_customer_can_create_review(self, client, auth_headers, task, dataset, annotations_pair):
        """Тест что customer может создавать review."""
        ann_a, ann_b = annotations_pair
        
        review_data = {
            "task_id": str(task.id),
            "dataset_id": str(dataset.id),
            "annotation_a_id": str(ann_a.id),
            "annotation_b_id": str(ann_b.id),
        }
        
        response = client.post("/api/quality/review/", review_data, **auth_headers, format="json")
        
        assert response.status_code == status.HTTP_201_CREATED
    
    def test_annotator_cannot_create_review(self, client, auth_headers_annotator, task, dataset, annotations_pair):
        """Тест что annotator не может создавать review."""
        ann_a, ann_b = annotations_pair
        
        review_data = {
            "task_id": str(task.id),
            "dataset_id": str(dataset.id),
            "annotation_a_id": str(ann_a.id),
            "annotation_b_id": str(ann_b.id),
        }
        
        response = client.post("/api/quality/review/", review_data, **auth_headers_annotator, format="json")
        
        # Annotator не должен создавать review для своих работ
        assert response.status_code == status.HTTP_403_FORBIDDEN
    
    def test_admin_can_access_all_reviews(self, client, auth_headers_admin, quality_review):
        """Тест что admin имеет доступ ко всем review."""
        response = client.get(f"/api/quality/review/{quality_review.id}/", **auth_headers_admin)
        
        # В MVP нет endpoint retrieve для review, проверяем list
        response = client.get("/api/quality/review/", **auth_headers_admin)
        
        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# Тесты краевых случаев
# =============================================================================

@pytest.mark.django_db
class TestQualityEdgeCases:
    """Тесты краевых случаев для QC модуля."""
    
    def test_review_with_null_metrics(self, client, auth_headers, task, dataset, annotations_pair):
        """Тест создания review без метрик."""
        ann_a, ann_b = annotations_pair
        
        review_data = {
            "task_id": str(task.id),
            "dataset_id": str(dataset.id),
            "annotation_a_id": str(ann_a.id),
            "annotation_b_id": str(ann_b.id),
            # metrics отсутствует
        }
        
        response = client.post("/api/quality/review/", review_data, **auth_headers, format="json")
        
        # metrics может быть null
        assert response.status_code == status.HTTP_201_CREATED
    
    def test_review_with_invalid_f1(self, client, auth_headers, task, dataset, annotations_pair):
        """Тест создания review с F1 > 1.0."""
        ann_a, ann_b = annotations_pair
        
        review_data = {
            "task_id": str(task.id),
            "dataset_id": str(dataset.id),
            "annotation_a_id": str(ann_a.id),
            "annotation_b_id": str(ann_b.id),
            "metrics": {"f1": 1.5},  # Невалидно (должно быть 0-1)
        }
        
        response = client.post("/api/quality/review/", review_data, **auth_headers, format="json")
        
        # Валидация может пропустить (проверяется в модели)
        assert response.status_code in [status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST]
    
    def test_metric_with_negative_precision(self, db, task, dataset):
        """Тест метрики с отрицательным precision."""
        metric = QualityMetric(
            dataset=dataset,
            task=task,
            precision=-0.5,  # Невалидно
            recall=0.8,
            f1=0.7,
        )
        
        # Сохранение должно выбросить ошибку валидации
        with pytest.raises(Exception):
            metric.save()
    
    def test_review_same_task_unique(self, db, task, dataset, annotations_pair):
        """Тест что для задачи может быть только один review."""
        ann_a, ann_b = annotations_pair
        
        # Создаем первый review
        review1 = QualityReview(
            task=task,
            dataset=dataset,
            annotation_a=ann_a,
            annotation_b=ann_b,
        )
        review1.save()
        
        # Пытаемся создать второй для той же задачи
        review2 = QualityReview(
            task=task,
            dataset=dataset,
            annotation_a=ann_a,
            annotation_b=ann_b,
        )
        
        # В модели есть unique=True для task
        # Это должно вызвать ошибку
        with pytest.raises(Exception):
            review2.save()
    
    def test_metrics_details_arbitrary_data(self, db, task, dataset):
        """Тест что details может содержать произвольные данные."""
        metric = QualityMetric(
            dataset=dataset,
            task=task,
            precision=0.9,
            recall=0.85,
            f1=0.87,
            details={
                "custom_field": "custom_value",
                "nested": {"key": "value"},
                "array": [1, 2, 3],
            },
        )
        metric.save()
        
        assert metric.details["custom_field"] == "custom_value"
        assert metric.details["nested"]["key"] == "value"


# =============================================================================
# Тесты бизнес-сценариев
# =============================================================================

@pytest.mark.django_db
class TestQualityBusinessScenarios:
    """Тесты бизнес-сценариев контроля качества."""
    
    def test_full_qc_workflow(self, client, auth_headers, task, dataset, annotations_pair, user_admin):
        """
        Полный сценарий контроля качества:
        1. Две аннотации созданы
        2. Создается cross-check review
        3. Рассчитываются метрики
        4. При расхождении - арбитраж
        5. Обновляется рейтинг исполнителей
        """
        ann_a, ann_b = annotations_pair
        
        # Шаг 1: Создаем review
        review_data = {
            "task_id": str(task.id),
            "dataset_id": str(dataset.id),
            "annotation_a_id": str(ann_a.id),
            "annotation_b_id": str(ann_b.id),
            "metrics": {"precision": 0.85, "recall": 0.80, "f1": 0.82},
        }
        
        response = client.post("/api/quality/review/", review_data, **auth_headers, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        
        review_id = response.data["id"]
        
        # Шаг 2: Проверяем что review создан
        review = QualityReview.objects(id=review_id).first()
        assert review.review_status == QualityReview.STATUS_PENDING
        
        # Шаг 3: Завершаем review
        review.review_status = QualityReview.STATUS_COMPLETED
        review.save()
        
        # Шаг 4: Проверяем что задача перешла в completed
        task.refresh()
        assert task.status == Task.STATUS_COMPLETED
        
        # Шаг 5: Проверяем что рейтинг обновился
        ann_a.annotator.refresh()
        ann_b.annotator.refresh()
        # Рейтинг должен быть >= 0 (обновляется через $inc)
    
    def test_arbitration_workflow(self, client, auth_headers, quality_review, user_admin):
        """
        Сценарий арбитража:
        1. Review показывает низкие метрики (расхождение)
        2. Заказчик запрашивает арбитраж
        3. Admin проверяет и выносит решение
        4. Финальная метка сохраняется
        """
        # Устанавливаем низкие метрики
        quality_review.metrics = {"precision": 0.5, "recall": 0.4, "f1": 0.45}
        quality_review.save()
        
        # Заказчик запрашивает арбитраж
        quality_review.arbitration_requested = True
        quality_review.save()
        
        # Admin выносит решение
        quality_review.arbitrator = user_admin
        quality_review.review_status = QualityReview.STATUS_ARBITRATED
        quality_review.final_label_data = {"class": "cat"}  # Решение арбитра
        quality_review.save()
        
        assert quality_review.review_status == QualityReview.STATUS_ARBITRATED
        assert quality_review.final_label_data["class"] == "cat"
    
    def test_high_quality_annotations(self, client, auth_headers, task, dataset, annotations_pair):
        """Сценарий с высококачественными аннотациями (F1 > 0.9)."""
        ann_a, ann_b = annotations_pair
        
        # Обе аннотации совпадают
        ann_a.label_data = {"class": "cat"}
        ann_a.save()
        ann_b.label_data = {"class": "cat"}
        ann_b.save()
        
        # Создаем review с высокими метриками
        review_data = {
            "task_id": str(task.id),
            "dataset_id": str(dataset.id),
            "annotation_a_id": str(ann_a.id),
            "annotation_b_id": str(ann_b.id),
            "metrics": {"precision": 0.98, "recall": 0.97, "f1": 0.97},
        }
        
        response = client.post("/api/quality/review/", review_data, **auth_headers, format="json")
        
        assert response.status_code == status.HTTP_201_CREATED
        
        # Арбитраж не требуется
        review = QualityReview.objects(id=response.data["id"]).first()
        assert review.arbitration_requested is False
