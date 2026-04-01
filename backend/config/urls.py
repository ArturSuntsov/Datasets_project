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
from rest_framework.routers import DefaultRouter

# Импорты ViewSet'ов для роутинга
from apps.users.views import register, login, me_view
from apps.datasets_core.views import DatasetCollectionView, DatasetDetailView
from apps.projects.views import ProjectViewSet, TaskViewSet
from apps.labeling.views import AnnotationViewSet
from apps.quality.views import ReviewViewSet, MetricsViewSet
from apps.finance.views import TransactionViewSet, PaymentViewSet
from apps.core.views import HealthCheckView, MongoDBCheckView, RedisCheckView

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
router.register(r"finance/transactions", TransactionViewSet, basename="transaction")
router.register(r"finance/payments", PaymentViewSet, basename="payment")

urlpatterns = [
    # Django admin
    path("admin/", admin.site.urls),
    
    # API эндпоинты
    path("api/", include([
        # Health checks (проверка сервисов)
        path("health/", HealthCheckView.as_view(), name="health-check"),
        path("health/mongodb/", MongoDBCheckView.as_view(), name="health-mongodb"),
        path("health/redis/", RedisCheckView.as_view(), name="health-redis"),

        # Пользователь (текущий)
        path("users/me/", me_view, name="user-me"),

        # Авторизация (function-based views)
        path("auth/register/", register, name="auth-register"),
        path("auth/login/", login, name="auth-login"),
        
        # Датасеты (collection + detail views)
        path("datasets/", DatasetCollectionView.as_view(), name="dataset-list"),
        path("datasets/<str:dataset_id>/", DatasetDetailView.as_view(), name="dataset-detail"),
        
        # Остальные эндпоинты через router
    ] + router.urls)),
]

# Заголовки для API документации
admin.site.site_header = "Dataset AI Admin"
admin.site.site_title = "Dataset AI Admin Portal"
admin.site.index_title = "Панель администратора"
