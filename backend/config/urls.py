"""
URL конфигурация проекта.

Маршрутизация API эндпоинтов по приложениям:
- /api/auth/* - авторизация (users)
- /api/datasets/* - управление датасетами
- /api/projects/* - проекты и задачи
- /api/tasks/* - задачи разметки
- /api/labeling/* - аннотации
- /api/quality/* - контроль качества
- /api/finance/* - финансы и платежи
"""

from django.contrib import admin
from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.routers import DefaultRouter

# Импорты ViewSet'ов для роутинга
from apps.users.views import register, login, me_view, participants_view, user_stats_view, avatar_upload_view, avatar_delete_view, BulkCreateAnnotatorsView
from apps.datasets_core.views import DatasetCollectionView, DatasetDetailView
from apps.projects.views import ProjectViewSet, TaskViewSet
from apps.labeling.views import AnnotationViewSet
from apps.quality.views import ReviewViewSet, MetricsViewSet
from apps.finance.views import TransactionViewSet, PaymentViewSet
from apps.core.views import HealthCheckView, MongoDBCheckView, RedisCheckView
from apps.quality.views_dawid_skene import project_dawid_skene_view
from apps.quality.views_iou import check_iou_view

# Создаем роутер для ViewSet'ов
router = DefaultRouter()

# Проекты и задачи
router.register(r"projects", ProjectViewSet, basename="project")
router.register(r"tasks", TaskViewSet, basename="task")

# Аннотации
router.register(r"annotations", AnnotationViewSet, basename="annotation")

# Качество
router.register(r"quality/review", ReviewViewSet, basename="quality-review")
router.register(r"quality/metrics", MetricsViewSet, basename="quality-metrics")

# Финансы
router.register(r"finance/payments", PaymentViewSet, basename="payment")
router.register(r"finance/transactions", TransactionViewSet, basename="transaction")

urlpatterns = [
    # Django admin
    path("api/", include([
        # Health checks
        path("health/", HealthCheckView.as_view(), name="health-check"),
        path("health/mongodb/", MongoDBCheckView.as_view(), name="health-mongodb"),
        path("health/redis/", RedisCheckView.as_view(), name="health-redis"),

        # Пользователь
        path("users/me/", me_view, name="user-me"),
        path("users/me/stats/", user_stats_view, name="user-stats"),
        path("users/me/avatar/", avatar_upload_view, name="avatar-upload"),
        path("users/me/avatar/delete/", avatar_delete_view, name="avatar-delete"),
        path("users/participants/", participants_view, name="user-participants"),
        path("users/bulk-create-annotators/", BulkCreateAnnotatorsView.as_view(), name="bulk-create-annotators"),

        # Авторизация
        path("auth/register/", register, name="auth-register"),
        path("auth/login/", login, name="auth-login"),
        
        # Датасеты
        path("datasets/", DatasetCollectionView.as_view(), name="dataset-list"),
        path("datasets/<str:dataset_id>/", DatasetDetailView.as_view(), name="dataset-detail"),
        
        # ✅ Dawid-Skene (исправлено)
        path("quality/project/<str:project_id>/dawid-skene/", project_dawid_skene_view, name="project-dawid-skene"),

        # IoU Check (быстрая проверка)
        path("quality/check-iou/", check_iou_view, name="quality-check-iou"),
        
        # Остальные эндпоинты через router
    ] + router.urls)),
    
    # CV Annotation эндпоинты
    path("api/", include("apps.cv_annotation.urls")),
]

# Обслуживание медиафайлов (для разработки)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Заголовки для API документации
admin.site.site_header = "Dataset AI Admin"
admin.site.site_title = "Dataset AI Admin Portal"
admin.site.index_title = "Панель администратора"
