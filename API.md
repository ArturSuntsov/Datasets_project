# API Документация

Сервис по сбору Dataset для ИИ предоставляет RESTful API для управления датасетами, задачами разметки, контроля качества и финансовыми операциями.

**Base URL:** `http://localhost:8000/api/`

**Формат данных:** JSON

**Аутентификация:** JWT Bearer Token

---

## Содержание

- [Аутентификация](#-аутентификация)
- [Пользователи](#-пользователи)
- [Датасеты](#-датасеты)
- [Проекты](#-проекты)
- [Задачи](#-задачи)
- [Аннотации](#-аннотации)
- [Контроль качества](#-контроль-качества)
- [Финансы](#-финансы)
- [Коды ошибок](#-коды-ошибок)

---

## 🔐 Аутентификация

Все запросы к API (кроме регистрации и входа) требуют JWT токен в заголовке:

```
Authorization: Bearer <access_token>
```

### Регистрация пользователя

**POST** `/api/auth/register/`

Создание нового пользователя и получение JWT токена.

**Request:**
```json
{
  "email": "user@example.com",
  "username": "username",
  "password": "your-strong-password"
  "role": "customer"
}
```

**Параметры:**

| Поле | Тип | Обязательное | Описание |
|------|-----|--------------|----------|
| email | string | Да | Уникальный email (lowercase) |
| username | string | Да | Уникальный username (max 150) |
| password | string | Да | Минимум 8 символов |
| role | string | Нет | `customer`, `annotator`, `admin` (по умолчанию `customer`) |

**Response (201 Created):**
```json
{
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "65f1234567890abcdef12345",
    "email": "user@example.com",
    "username": "username",
    "role": "customer"
  }
}
```

---

### Вход

**POST** `/api/auth/login/`

Получение JWT токена по email или username.

**Request:**
```json
{
  "identifier": "user@example.com",
  "password": "your-strong-password"
}
```

**Параметры:**

| Поле | Тип | Обязательное | Описание |
|------|-----|--------------|----------|
| identifier | string | Да | Email или username |
| password | string | Да | Пароль пользователя |

**Response (200 OK):**
```json
{
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "65f1234567890abcdef12345",
    "email": "user@example.com",
    "username": "username",
    "role": "customer"
  }
}
```

---

## 👤 Пользователи

### Получить текущего пользователя

**GET** `/api/users/me/`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "id": "65f1234567890abcdef12345",
  "email": "user@example.com",
  "username": "username",
  "role": "customer",
  "rating": 0.85,
  "balance": "150.00",
  "is_active": true,
  "created_at": "2026-03-01T10:00:00Z"
}
```

---

## 📊 Датасеты

### Список датасетов

**GET** `/api/datasets/`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| limit | integer | 20 | Количество записей (max 100) |
| offset | integer | 0 | Смещение для пагинации |

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "65f1234567890abcdef12345",
      "owner": "65f1234567890abcdef12345",
      "name": "Image Classification Dataset",
      "description": "Датасет для классификации изображений",
      "status": "active",
      "file_uri": "s3://bucket/dataset.zip",
      "schema_version": 1,
      "metadata": {
        "annotation_format": "classification_v1",
        "classes": ["cat", "dog", "bird"]
      },
      "created_at": "2026-03-01T10:00:00Z",
      "updated_at": "2026-03-01T10:00:00Z"
    }
  ],
  "limit": 20,
  "offset": 0,
  "total": 5
}
```

---

### Создать датасет

**POST** `/api/datasets/`

**Request:**
```json
{
  "name": "New Dataset",
  "description": "Описание датасета",
  "status": "draft",
  "schema_version": 1,
  "metadata": {
    "annotation_format": "classification_v1"
  }
}
```

**Параметры:**

| Поле | Тип | Обязательное | Описание |
|------|-----|--------------|----------|
| name | string | Да | Название (max 255) |
| description | string | Нет | Описание |
| status | string | Нет | `draft`, `active`, `archived` |
| schema_version | integer | Нет | Версия схемы (по умолчанию 1) |
| metadata | object | Нет | Дополнительные метаданные |

**Response (201 Created):**
```json
{
  "id": "65f1234567890abcdef12345",
  "owner": "65f1234567890abcdef12345",
  "name": "New Dataset",
  "description": "Описание датасета",
  "status": "draft",
  "schema_version": 1,
  "metadata": {...},
  "created_at": "2026-03-01T10:00:00Z",
  "updated_at": "2026-03-01T10:00:00Z"
}
```

---

### Получить датасет

**GET** `/api/datasets/{id}/`

**Response (200 OK):**
```json
{
  "id": "65f1234567890abcdef12345",
  "owner": "65f1234567890abcdef12345",
  "name": "Dataset Name",
  "description": "Описание",
  "status": "active",
  "file_uri": "s3://bucket/dataset.zip",
  "schema_version": 1,
  "metadata": {...},
  "created_at": "2026-03-01T10:00:00Z",
  "updated_at": "2026-03-01T10:00:00Z"
}
```

---

### Обновить датасет

**PATCH** `/api/datasets/{id}/`

**Request:**
```json
{
  "name": "Updated Name",
  "status": "active"
}
```

**Response (200 OK):**
```json
{
  "id": "65f1234567890abcdef12345",
  "name": "Updated Name",
  "status": "active",
  ...
}
```

---

### Удалить датасет

**DELETE** `/api/datasets/{id}/`

**Response (204 No Content)**

---

## 📁 Проекты

### Список проектов

**GET** `/api/projects/`

**Query Parameters:**

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| limit | integer | 20 | Количество записей |
| offset | integer | 0 | Смещение |

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "65f1234567890abcdef12345",
      "owner": "65f1234567890abcdef12345",
      "title": "Image Labeling Project",
      "description": "Проект по разметке изображений",
      "status": "active",
      "created_at": "2026-03-01T10:00:00Z",
      "updated_at": "2026-03-01T10:00:00Z"
    }
  ],
  "limit": 20,
  "offset": 0,
  "total": 3
}
```

---

### Создать проект

**POST** `/api/projects/`

**Request:**
```json
{
  "title": "New Project",
  "description": "Описание проекта",
  "status": "active"
}
```

**Response (201 Created):**
```json
{
  "id": "65f1234567890abcdef12345",
  "owner": "65f1234567890abcdef12345",
  "title": "New Project",
  "description": "Описание проекта",
  "status": "active",
  "created_at": "2026-03-01T10:00:00Z",
  "updated_at": "2026-03-01T10:00:00Z"
}
```

---

## 🎯 Задачи

### Список задач

**GET** `/api/tasks/`

**Query Parameters:**

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| limit | integer | 20 | Количество записей |
| offset | integer | 0 | Смещение |
| status | string | - | Фильтр по статусу |

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "65f1234567890abcdef12345",
      "project": "65f1234567890abcdef12345",
      "dataset": "65f1234567890abcdef12345",
      "annotator": null,
      "title": "Label Image #001",
      "description": "Разметить изображение с кошками",
      "status": "pending",
      "difficulty_score": 0.75,
      "deadline_at": "2026-03-15T23:59:59Z",
      "input_ref": "s3://bucket/image_001.jpg",
      "created_at": "2026-03-01T10:00:00Z",
      "updated_at": "2026-03-01T10:00:00Z"
    }
  ],
  "limit": 20,
  "offset": 0,
  "total": 10
}
```

---

### Создать задачу

**POST** `/api/tasks/`

**Request:**
```json
{
  "dataset_id": "65f1234567890abcdef12345",
  "project_id": "65f1234567890abcdef12345",
  "title": "New Task",
  "description": "Описание задачи",
  "difficulty_score": 0.5,
  "input_ref": "s3://bucket/image.jpg"
}
```

**Параметры:**

| Поле | Тип | Обязательное | Описание |
|------|-----|--------------|----------|
| dataset_id | string | Да | ID датасета |
| project_id | string | Нет | ID проекта |
| title | string | Да | Название задачи |
| description | string | Нет | Описание |
| difficulty_score | float | Нет | Сложность (0-1) |
| input_ref | string | Нет | Ссылка на данные |

**Response (201 Created):**
```json
{
  "id": "65f1234567890abcdef12345",
  "dataset": "65f1234567890abcdef12345",
  "project": "65f1234567890abcdef12345",
  "title": "New Task",
  "status": "pending",
  "difficulty_score": 0.5,
  ...
}
```

---

### Разметить задачу (Annotate)

**PATCH** `/api/tasks/{id}/annotate/`

Создание аннотации для задачи.

**Request:**
```json
{
  "label_data": {
    "class": "cat",
    "confidence": 0.95,
    "bbox": [100, 100, 200, 200]
  },
  "is_final": true
}
```

**Параметры:**

| Поле | Тип | Обязательное | Описание |
|------|-----|--------------|----------|
| label_data | object | Да | Данные разметки |
| is_final | boolean | Нет | Флаг завершения |

**Response (201 Created):**
```json
{
  "id": "65f1234567890abcdef12345",
  "annotator": "65f1234567890abcdef12345",
  "task": "65f1234567890abcdef12345",
  "dataset": "65f1234567890abcdef12345",
  "annotation_format": "classification_v1",
  "label_data": {
    "class": "cat",
    "confidence": 0.95
  },
  "status": "submitted",
  "is_final": true,
  "created_at": "2026-03-01T10:00:00Z"
}
```

---

## 🏷 Аннотации

### Список аннотаций

**GET** `/api/annotations/`

**Query Parameters:**

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| task_id | string | - | Фильтр по задаче |
| annotator_id | string | - | Фильтр по исполнителю |

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "65f1234567890abcdef12345",
      "annotator": "65f1234567890abcdef12345",
      "task": "65f1234567890abcdef12345",
      "dataset": "65f1234567890abcdef12345",
      "annotation_format": "classification_v1",
      "label_data": {...},
      "predicted_data": {...},
      "status": "submitted",
      "is_final": true,
      "created_at": "2026-03-01T10:00:00Z"
    }
  ],
  "total": 5
}
```

---

### Создать аннотацию

**POST** `/api/annotations/`

**Request:**
```json
{
  "task_id": "65f1234567890abcdef12345",
  "dataset_id": "65f1234567890abcdef12345",
  "annotation_format": "classification_v1",
  "label_data": {
    "class": "dog"
  },
  "auto_label": false
}
```

**Параметры:**

| Поле | Тип | Обязательное | Описание |
|------|-----|--------------|----------|
| task_id | string | Да | ID задачи |
| dataset_id | string | Да | ID датасета |
| annotation_format | string | Да | Формат аннотации |
| label_data | object | Да | Данные разметки |
| auto_label | boolean | Нет | Использовать AI |

**Response (201 Created):**
```json
{
  "id": "65f1234567890abcdef12345",
  "annotator": "65f1234567890abcdef12345",
  "task": "65f1234567890abcdef12345",
  "label_data": {...},
  "status": "submitted",
  ...
}
```

---

## ✅ Контроль качества

### Создать Cross-Check Review

**POST** `/api/quality/review/`

Сравнение двух аннотаций для оценки качества.

**Request:**
```json
{
  "task_id": "65f1234567890abcdef12345",
  "dataset_id": "65f1234567890abcdef12345",
  "annotation_a_id": "65f1234567890abcdef12345",
  "annotation_b_id": "65f1234567890abcdef67890",
  "metrics": {
    "precision": 0.92,
    "recall": 0.88,
    "f1": 0.90
  }
}
```

**Response (201 Created):**
```json
{
  "id": "65f1234567890abcdef12345",
  "task_id": "65f1234567890abcdef12345",
  "dataset_id": "65f1234567890abcdef12345",
  "review_status": "pending",
  "metrics": {
    "precision": 0.92,
    "recall": 0.88,
    "f1": 0.90
  },
  "final_label_data": null,
  "created_at": "2026-03-01T10:00:00Z"
}
```

---

### Получить метрики качества

**GET** `/api/quality/metrics/{dataset_id}/`

**Query Parameters:**

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| limit | integer | 20 | Количество записей |
| offset | integer | 0 | Смещение |

**Response (200 OK):**
```json
{
  "dataset_id": "65f1234567890abcdef12345",
  "items": [
    {
      "task_id": "65f1234567890abcdef12345",
      "precision": 0.92,
      "recall": 0.88,
      "f1": 0.90,
      "details": {
        "accuracy": 0.91,
        "samples": 100
      },
      "created_at": "2026-03-01T10:00:00Z"
    }
  ],
  "limit": 20,
  "offset": 0,
  "total": 5
}
```

---

## 💰 Финансы

### История транзакций

**GET** `/api/finance/transactions/`

**Query Parameters:**

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| limit | integer | 20 | Количество записей |
| offset | integer | 0 | Смещение |
| status | string | - | `pending`, `completed`, `failed` |

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "65f1234567890abcdef12345",
      "user": "65f1234567890abcdef12345",
      "task": null,
      "type": "payment",
      "status": "completed",
      "amount": "100.00",
      "currency": "USD",
      "external_id": "stripe_pi_123456",
      "metadata": {},
      "created_at": "2026-03-01T10:00:00Z"
    }
  ],
  "limit": 20,
  "offset": 0,
  "total": 10
}
```

---

### Пополнение баланса (Pay)

**POST** `/api/finance/payments/pay/`

**Request:**
```json
{
  "amount": 100.00,
  "currency": "USD",
  "task_id": null,
  "metadata": {
    "description": "Пополнение баланса"
  }
}
```

**Параметры:**

| Поле | Тип | Обязательное | Описание |
|------|-----|--------------|----------|
| amount | number | Да | Сумма (> 0) |
| currency | string | Нет | Валюта (по умолчанию USD) |
| task_id | string | Нет | ID связанной задачи |
| metadata | object | Нет | Дополнительные данные |

**Response (201 Created):**
```json
{
  "transaction": {
    "id": "65f1234567890abcdef12345",
    "type": "payment",
    "status": "completed",
    "amount": "100.00",
    "currency": "USD"
  },
  "transaction_id": "65f1234567890abcdef12345",
  "payment_request_id": "65f1234567890abcdef67890",
  "status": "completed"
}
```

---

### Запрос выплаты (Withdraw)

**POST** `/api/finance/payments/withdraw/`

**Request:**
```json
{
  "amount": 50.00,
  "currency": "USD"
}
```

**Response (201 Created):**
```json
{
  "transaction": {...},
  "transaction_id": "65f1234567890abcdef12345",
  "payment_request_id": "65f1234567890abcdef67890",
  "status": "completed"
}
```

Вот отформатированный контент в корректном Markdown для вставки в ваши `.md` файлы:

---

## 🔒 Безопасность

### Аутентификация

- Все запросы к API (кроме `/auth/register/` и `/auth/login/`) требуют JWT-токен.
- Токен передаётся в заголовке:  
  ```
  Authorization: Bearer <token>
  ```
- Время жизни токена: **60 минут** (настраивается в `.env`).

---

### Переменные окружения

> ⚠️ **Никогда не храните секреты в коде!**  
> Все чувствительные данные должны находиться в файле `.env`, который добавлен в `.gitignore`.

| Переменная | Назначение |
|------------|------------|
| `SECRET_KEY` | Секретный ключ Django |
| `JWT_SECRET_KEY` | Ключ для подписи JWT |
| `MONGO_URI` | Строка подключения к MongoDB |
| `STRIPE_TEST_SECRET_KEY` | Ключ Stripe (тестовый режим) |
| `STRIPE_LIVE_SECRET_KEY` | Ключ Stripe (production) |
| `MONGODB_USER` | Пользователь MongoDB |
| `MONGODB_PASSWORD` | Пароль MongoDB |

#### Генерация надёжных ключей

```bash
# Сгенерировать криптографически стойкий ключ
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

---

### Рекомендации по безопасности

1. ✅ Используйте разные ключи для разработки и production
2. ✅ Никогда не коммитьте файл `.env` в репозиторий
3. ✅ В production установите `DEBUG=False`
4. ✅ Используйте HTTPS для всех внешних запросов
5. ✅ Регулярно обновляйте зависимости (`pip audit`, `npm audit`)
6. ✅ Валидируйте и санитизируйте все входящие данные

---

### Rate Limiting

| Тип запроса | Лимит | Окно |
|-------------|-------|------|
| Анонимные | 100 | 1 час |
| Авторизованные | 1000 | 1 час |
| `POST /auth/login/` | 10 | 1 час |
| `POST /auth/register/` | 5 | 1 час |

> Превышение лимита возвращает ответ `429 Too Many Requests`.


---

## ❌ Коды ошибок

### Стандартные коды HTTP

| Код | Описание |
|-----|----------|
| 200 | OK — успешный запрос |
| 201 | Created — ресурс создан |
| 204 | No Content — успешное удаление |
| 400 | Bad Request — невалидные данные |
| 401 | Unauthorized — токен отсутствует |
| 403 | Forbidden — недостаточно прав |
| 404 | Not Found — ресурс не найден |
| 429 | Too Many Requests — rate limit |
| 500 | Internal Server Error — ошибка сервера |

### Формат ответа при ошибке

```json
{
  "detail": "Описание ошибки",
  "errors": {
    "field_name": ["Список ошибок поля"]
  }
}
```

### Примеры ошибок

**400 Bad Request:**
```json
{
  "detail": "Неверный логин или пароль",
  "errors": {
    "email": ["Пользователь с таким email не существует"]
  }
}
```

**401 Unauthorized:**
```json
{
  "detail": "Authorization header missing."
}
```

**403 Forbidden:**
```json
{
  "detail": "User not found or inactive."
}
```

**404 Not Found:**
```json
{
  "detail": "Dataset not found."
}
```

**429 Too Many Requests:**
```json
{
  "detail": "Rate limit exceeded. Try again later."
}
```

---

## 📝 Примечания

### Пагинация

Все списки ресурсов поддерживают пагинацию через параметры `limit` и `offset`.

- Максимальный `limit`: 100
- По умолчанию: `limit=20`, `offset=0`

### Rate Limiting

| Тип запроса | Лимит |
|-------------|-------|
| Анонимные | 100/час |
| Авторизованные | 1000/час |
| Login | 10/час |
| Register | 5/час |

### JWT Токены

- Время жизни access токена: 60 минут
- Токен передается в заголовке `Authorization: Bearer <token>`

### Форматы дат

Все даты в формате ISO 8601:
```
2026-03-01T10:00:00Z
```

---

*Версия API: 1.0*

*Последнее обновление: Март 2026*
