# Архитектура проекта

**Сервис по сбору Dataset для ИИ**

---

## 1. Обзор архитектуры

### 1.1 Высокоуровневая диаграмма

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Клиентский слой                               │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Frontend (React + TypeScript)                 │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │    │
│  │  │  Pages   │  │Components│  │ Services │  │  Store   │        │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS / REST API
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            Слой API (Django)                             │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Django REST Framework                        │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │    │
│  │  │  Users   │  │ Datasets │  │  Tasks   │  │ Quality  │        │    │
│  │  │   API    │  │   API    │  │   API    │  │   API    │        │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │    │
│  │  ┌──────────┐  ┌──────────┐                                      │    │
│  │  │ Finance │  │ Labeling │                                      │    │
│  │  │   API   │  │   API    │                                      │    │
│  │  └──────────┘  └──────────┘                                      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
┌──────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│   MongoDB (NoSQL)    │  │   Redis (Cache)  │  │   Celery (Queue)     │
│  ┌────────────────┐  │  │  ┌────────────┐  │  │  ┌────────────────┐  │
│  │   Users        │  │  │  │   Cache    │  │  │  │  Task Worker   │  │
│  │   Datasets     │  │  │  │   Session  │  │  │  │  AI Processing │  │
│  │   Tasks        │  │  │  │   Rate Lim │  │  │  │  Notifications │  │
│  │   Annotations  │  │  │  └────────────┘  │  │  └────────────────┘  │
│  └────────────────┘  │  └──────────────────┘  └──────────────────────┘
└──────────────────────┘
```

### 1.2 Компоненты системы

| Компонент | Технология | Назначение |
|-----------|------------|------------|
| **Frontend** | React 18 + TypeScript + Tailwind CSS | Пользовательский интерфейс |
| **Backend API** | Django 4.2 + DRF | REST API, бизнес-логика, валидация |
| **MongoDB** | MongoDB 7 | Основное хранилище данных (NoSQL) |
| **Redis** | Redis 7 | Кэширование, сессии, rate limiting |
| **Celery** | Celery 5 | Асинхронная обработка задач |

---

## 2. Backend архитектура

### 2.1 Структура приложения

```
backend/
├── config/                 # Конфигурация Django
│   ├── settings.py        # Настройки приложения
│   ├── urls.py            # Корневая маршрутизация
│   └── wsgi.py            # WSGI entry point
├── apps/
│   ├── users/             # Модуль пользователей
│   │   ├── models.py      # User модель (MongoEngine)
│   │   ├── views.py       # RegisterView, LoginView
│   │   ├── serializers.py # JWT логика, валидация
│   │   └── urls.py        # Маршруты авторизации
│   ├── datasets_core/     # Модуль датасетов
│   │   ├── models.py      # Dataset модель
│   │   ├── views.py       # DatasetCollectionView, DatasetDetailView
│   │   ├── serializers.py # Валидация датасетов
│   │   └── urls.py        # CRUD маршруты
│   ├── projects/          # Модуль проектов
│   │   ├── models.py      # Project, Task модели
│   │   └── views.py       # ProjectViewSet, TaskViewSet
│   ├── labeling/          # Модуль разметки
│   │   ├── models.py      # Annotation, LabelingSession
│   │   └── views.py       # AnnotationViewSet
│   ├── quality/           # Модуль контроля качества
│   │   ├── models.py      # QualityMetric, QualityReview
│   │   └── views.py       # ReviewViewSet, MetricsViewSet
│   └── finance/           # Финансовый модуль
│       ├── models.py      # Transaction, PaymentRequest
│       └── views.py       # TransactionViewSet, PaymentViewSet
└── tests/                 # Unit тесты
    ├── conftest.py        # Фикстуры pytest
    ├── test_auth.py
    ├── test_datasets.py
    ├── test_tasks.py
    ├── test_quality.py
    └── test_finance.py
```

### 2.2 Модель данных (MongoDB)

```
┌─────────────────────────────────────────────────────────────────┐
│                         USERS                                   │
├─────────────────────────────────────────────────────────────────┤
│ _id: ObjectId                                                   │
│ email: String (unique, indexed)                                 │
│ username: String (unique, indexed)                              │
│ role: Enum [customer, annotator, admin]                         │
│ password_hash: String                                           │
│ rating: Float (для annotator)                                   │
│ balance: Decimal                                                │
│ is_active: Boolean                                              │
│ created_at: DateTime                                            │
│ updated_at: DateTime                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ owner (ReferenceField)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATASETS                                 │
├─────────────────────────────────────────────────────────────────┤
│ _id: ObjectId                                                   │
│ owner: Reference(User)                                          │
│ name: String (max 255)                                          │
│ description: String                                             │
│ status: Enum [draft, active, archived]                          │
│ file_uri: String (S3/MinIO URL)                                 │
│ schema_version: Integer                                         │
│ metadata: Dict                                                  │
│ created_at: DateTime                                            │
│ updated_at: DateTime                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ dataset (ReferenceField)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          TASKS                                  │
├─────────────────────────────────────────────────────────────────┤
│ _id: ObjectId                                                   │
│ dataset: Reference(Dataset)                                     │
│ project: Reference(Project)                                     │
│ annotator: Reference(User, nullable)                            │
│ status: Enum [pending, in_progress, review, completed, rejected]│
│ difficulty_score: Float (0-1, для Active Learning)              │
│ input_ref: String (ссылка на данные)                            │
│ deadline_at: DateTime                                           │
│ created_at: DateTime                                            │
│ updated_at: DateTime                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ task (ReferenceField)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       ANNOTATIONS                               │
├─────────────────────────────────────────────────────────────────┤
│ _id: ObjectId                                                   │
│ annotator: Reference(User)                                      │
│ task: Reference(Task)                                           │
│ dataset: Reference(Dataset)                                     │
│ session: Reference(LabelingSession)                             │
│ annotation_format: String                                       │
│ label_data: Dict (результат разметки)                           │
│ predicted_data: Dict (AI prediction)                            │
│ status: Enum [draft, submitted, accepted, rejected]             │
│ is_final: Boolean                                               │
│ created_at: DateTime                                            │
│ updated_at: DateTime                                            │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Жизненный цикл задачи (Kanban)

```
┌─────────┐     ┌─────────────┐     ┌────────┐     ┌───────────┐     ┌──────────┐
│ PENDING │────▶│ IN_PROGRESS │────▶│ REVIEW │────▶│ COMPLETED │────▶│ REJECTED │
└─────────┘     └─────────────┘     └────────┘     └───────────┘     └──────────┘
     ▲                                                        │              │
     │                                                        │              │
     └────────────────────────────────────────────────────────┴──────────────┘
```

**Статусы:**
- `pending` — задача ожидает исполнителя
- `in_progress` — назначен annotator, идет разметка
- `review` — разметка завершена, требуется проверка
- `completed` — проверка пройдена успешно
- `rejected` — требуется доработка (арбитраж)

---

## 3. Frontend архитектура

### 3.1 Структура приложения

```
frontend/
├── src/
│   ├── components/        # Переиспользуемые UI компоненты
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   ├── LoadingSpinner.tsx
│   │   └── ErrorBoundary.tsx
│   ├── pages/             # Страницы приложения
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── DatasetsPage.tsx
│   │   ├── DatasetDetailPage.tsx
│   │   ├── TasksPage.tsx
│   │   ├── LabelingPage.tsx
│   │   ├── QualityPage.tsx
│   │   ├── FinancePage.tsx
│   │   └── ProfilePage.tsx
│   ├── services/          # API клиент
│   │   └── api.ts         # Axios instance, API методы
│   ├── store/             # Zustand store
│   │   ├── index.ts       # Экспорт store
│   │   ├── useAuthStore.ts
│   │   ├── useDatasetStore.ts
│   │   ├── useTaskStore.ts
│   │   └── useFinanceStore.ts
│   ├── types/             # TypeScript типы
│   │   └── index.ts
│   ├── tests/             # Unit тесты
│   │   ├── setup.ts
│   │   ├── LoginPage.test.tsx
│   │   ├── DashboardPage.test.tsx
│   │   └── api.test.ts
│   ├── App.tsx            # Корневой компонент
│   └── main.tsx           # Entry point
├── vitest.config.ts       # Конфигурация Vitest
└── package.json
```

### 3.2 State Management

```
┌─────────────────────────────────────────────────────────────┐
│                    Zustand Stores                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  useAuth     │  │ useDataset   │  │   useTask    │      │
│  │   Store      │  │   Store      │  │    Store     │      │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤      │
│  │ - user       │  │ - datasets   │  │ - tasks      │      │
│  │ - token      │  │ - loading    │  │ - loading    │      │
│  │ - loading    │  │ - error      │  │ - error      │      │
│  │ - error      │  │              │  │              │      │
│  │ - login()    │  │ - list()     │  │ - list()     │      │
│  │ - register() │  │ - create()   │  │ - annotate() │      │
│  │ - logout()   │  │ - update()   │  │              │      │
│  │              │  │ - delete()   │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │  useFinance  │  │  useQuality  │                        │
│  │   Store      │  │   Store      │                        │
│  ├──────────────┤  ├──────────────┤                        │
│  │ - balance    │  │ - metrics    │                        │
│  │ - transact.  │  │ - reviews    │                        │
│  │ - pay()      │  │ - create()   │                        │
│  │ - withdraw() │  │              │                        │
│  └──────────────┘  └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Data Flow

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   User      │─────▶│  Component  │─────▶│   Store     │
│  Interaction│      │   (React)   │      │  (Zustand)  │
└─────────────┘      └─────────────┘      └─────────────┘
                            │                    │
                            │                    │
                            ▼                    ▼
                     ┌─────────────┐      ┌─────────────┐
                     │ React Query │─────▶│  API Client │
                     │   (Cache)   │      │   (Axios)   │
                     └─────────────┘      └─────────────┘
                                                 │
                                                 │
                                                 ▼
                                          ┌─────────────┐
                                          │   Backend   │
                                          │    (API)    │
                                          └─────────────┘
```

---

## 4. Безопасность

### 4.1 JWT Аутентификация

```
┌──────────┐                          ┌──────────┐
│  Client  │                          │  Server  │
└────┬─────┘                          └────┬─────┘
     │                                     │
     │  POST /api/auth/login/              │
     │  {email, password}                  │
     │────────────────────────────────────▶│
     │                                     │
     │  Verify credentials                 │
     │  Generate JWT (exp: 60 min)         │
     │                                     │
     │  {access_token}                     │
     │◀────────────────────────────────────│
     │                                     │
     │  GET /api/datasets/                 │
     │  Authorization: Bearer <token>      │
     │────────────────────────────────────▶│
     │                                     │
     │  Verify JWT signature & exp         │
     │  Return data                        │
     │◀────────────────────────────────────│
```

### 4.2 Security Headers

```python
# Django Settings
SECURE_HSTS_SECONDS = 31536000  # 1 год
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_SSL_REDIRECT = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = "DENY"
```

### 4.3 Rate Limiting

```python
REST_FRAMEWORK = {
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/hour",
        "user": "1000/hour",
        "login": "10/hour",
        "register": "5/hour",
    },
}
```

---

## 5. Производительность

### 5.1 Кэширование (Redis)

```python
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": "redis://redis:6379/0",
        "TIMEOUT": 300,  # 5 минут
    }
}
```

### 5.2 Индексы MongoDB

```python
# В моделях MongoEngine
meta = {
    "collection": "datasets",
    "indexes": [
        "owner",
        "status",
        ("created_at", "-created_at"),
    ],
}
```

### 5.3 Пагинация

Все API endpoints поддерживают пагинацию:
- Default: `limit=20`, `offset=0`
- Maximum: `limit=100`

---

## 6. Деплой архитектура

### 6.1 Production конфигурация

```
┌─────────────────────────────────────────────────────────────┐
│                         Nginx                                │
│                    (Reverse Proxy)                           │
│                   Port 80 / 443                              │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────┐           ┌─────────────────────┐
│   Frontend (Vite)   │           │   Backend (Gunicorn)│
│   Static Files      │           │   Django App        │
│   Port 3000         │           │   Port 8000         │
└─────────────────────┘           └─────────────────────┘
                                              │
                              ┌───────────────┼───────────────┐
                              │               │               │
                              ▼               ▼               ▼
                    ┌─────────────────┐ ┌───────────┐ ┌───────────┐
                    │    MongoDB      │ │   Redis   │ │  Celery   │
                    │    Port 27017   │ │ Port 6379 │ │  Worker   │
                    └─────────────────┘ └───────────┘ └───────────┘
```

### 6.2 Docker Compose сервисы

```yaml
version: '3.9'
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
  
  frontend:
    build: ./frontend
    command: nginx -g "daemon off;"
  
  backend:
    build: ./backend
    command: gunicorn config.wsgi:application --bind 0.0.0.0:8000
  
  mongodb:
    image: mongo:7
  
  redis:
    image: redis:7-alpine
  
  celery:
    build: ./backend
    command: celery -A config worker --loglevel=info
```

---

## 7. Бизнес-логика

### 7.1 Решаемые проблемы

| Проблема | Решение |
|----------|---------|
| Сложность сбора датасетов | Централизованное управление метаданными |
| Низкое качество разметки | Cross-check проверка + метрики |
| Отсутствие мотивации исполнителей | Финансовая система выплат |
| Сложные примеры игнорируются | Active Learning приоритизация |
| Нет AI поддержки | AI-assisted предразметка |

### 7.2 Active Learning

```python
# Сортировка задач по difficulty_score
tasks = Task.objects().order_by("-difficulty_score", "-created_at")

# При создании аннотации обновляется статус задачи
if annotation.is_final:
    task.status = Task.STATUS_REVIEW
    task.save()
```

### 7.3 Cross-Check QC

```python
# Создание review для двух аннотаций
review = QualityReview(
    task=task,
    annotation_a=ann_a,
    annotation_b=ann_b,
    metrics={"precision": 0.9, "recall": 0.85, "f1": 0.87}
)

# При завершении обновляется рейтинг исполнителей
User.objects(id=ann_a.annotator.id).update_one(
    __inc__={"rating": review.metrics["f1"]}
)
```

---

## 8. Расширяемость

### 8.1 Добавление нового модуля

1. Создать приложение в `apps/new_module/`
2. Определить модели в `models.py`
3. Создать serializers для валидации
4. Реализовать views (APIView или ViewSet)
5. Добавить маршруты в `config/urls.py`
6. Написать тесты в `tests/test_new_module.py`

### 8.2 Интеграция ML моделей

```python
# apps/labeling/models.py
def auto_label(self, input_context: dict) -> dict:
    """AI-предразметка (заглушка ML-модели)."""
    # TODO: Интегрировать реальную модель
    # from transformers import pipeline
    # model = pipeline("image-classification")
    # return model(input_context["image"])
    return {"predicted_class": "mock_class"}
```

---

*Версия документа: 1.0*

*Последнее обновление: Март 2026*
