# Сервис по сбору Dataset для ИИ

[![CI/CD](https://github.com/yourusername/dataset-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/dataset-ai/actions/workflows/ci.yml)
[![Backend Tests](https://img.shields.io/badge/backend-85%25-green)]()
[![Frontend Tests](https://img.shields.io/badge/frontend-80%25-green)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

**Сервис по сбору Dataset для ИИ** — это платформа для управления датасетами, организации разметки данных и контроля качества аннотаций. Предназначена для команд разработчиков ML/AI, которым требуется эффективный инструмент для подготовки обучающих данных.

---

## 📋 Содержание

- [Быстрый старт](#-быстрый-старт)
- [Архитектура](#-архитектура)
- [Функциональные возможности](#-функциональные-возможности)
- [API Документация](#-api-документация)
- [Тестирование](#-тестирование)
- [Деплой](#-деплой)
- [Для защиты диплома](#-для-защиты-диплома)
- [Структура проекта](#-структура-проекта)
- [Технологический стек](#-технологический-стек)
- [Команда](#-команда)

---

## 🚀 Быстрый старт

### Предварительные требования

- Docker и Docker Compose
- Python 3.11+
- Node.js 18+

### Запуск проекта

#### 1. Клонирование репозитория

```bash
git clone https://github.com/yourusername/dataset-ai.git
cd dataset-ai
```

#### 2. Настройка переменных окружения

```bash
# Скопируйте шаблон переменных окружения
cp .env.example .env

# Отредактируйте .env при необходимости
# (для локальной разработки значения по умолчанию подходят)
```

#### 3. Запуск через Docker Compose

```bash
# Запуск всех сервисов
docker-compose up -d

# Проверка статуса
docker-compose ps

# Просмотр логов
docker-compose logs -f
```

#### 4. Открытие приложения

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8000/api/
- **Django Admin:** http://localhost:8000/admin/

#### 5. Тестовые учетные данные

```
Email: admin@example.com
Пароль: admin123
Роль: admin
```

---

## 🏗 Архитектура

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Backend        │────▶│   MongoDB       │
│   React + TS    │     │   Django + DRF   │     │   (NoSQL)       │
│   Tailwind CSS  │◀────│   + mongoengine  │◀────│                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌──────────────────┐
                        │   Redis          │
                        │   (Cache/Queue)  │
                        └─────────────────┘
                              │
                              ▼
                        ┌──────────────────┐
                        │   Celery         │
                        │   (Task Queue)   │
                        └─────────────────┘
```

### Компоненты системы

| Компонент | Технология | Назначение |
|-----------|------------|------------|
| **Frontend** | React 18 + TypeScript | Пользовательский интерфейс |
| **Backend** | Django 4 + DRF | REST API, бизнес-логика |
| **База данных** | MongoDB 7 | Хранение данных (NoSQL) |
| **Кэш/Очередь** | Redis 7 | Кэширование, Celery брокер |
| **Task Queue** | Celery 5 | Асинхронные задачи |

Подробное описание архитектуры см. в [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## ✨ Функциональные возможности

### Для заказчиков (Customer)

- ✅ Создание и управление датасетами
- ✅ Настройка проектов разметки
- ✅ Контроль качества аннотаций (Cross-Check)
- ✅ Арбитраж спорных случаев
- ✅ Финансовое управление (пополнение, выплаты)
- ✅ Мониторинг прогресса разметки

### Для исполнителей (Annotator)

- ✅ Просмотр доступных задач
- ✅ AI-assisted разметка (предразметка моделью)
- ✅ Создание и редактирование аннотаций
- ✅ Отслеживание рейтинга и заработка
- ✅ Вывод средств

### Для администраторов (Admin)

- ✅ Полный доступ ко всем ресурсам
- ✅ Арбитраж сложных случаев
- ✅ Просмотр метрик качества
- ✅ Управление пользователями

---

## 📚 API Документация

Полная документация API доступна в [API.md](./API.md).

### Основные эндпоинты

#### Авторизация

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST | `/api/auth/register/` | Регистрация пользователя |
| POST | `/api/auth/login/` | Вход (JWT токен) |

#### Датасеты

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/datasets/` | Список датасетов |
| POST | `/api/datasets/` | Создание датасета |
| GET | `/api/datasets/{id}/` | Детали датасета |
| PATCH | `/api/datasets/{id}/` | Обновление датасета |
| DELETE | `/api/datasets/{id}/` | Удаление датасета |

#### Задачи

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/tasks/` | Список задач |
| POST | `/api/tasks/` | Создание задачи |
| PATCH | `/api/tasks/{id}/annotate/` | Разметка задачи |

#### Качество

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST | `/api/quality/review/` | Создание cross-check review |
| GET | `/api/quality/metrics/{dataset_id}/` | Метрики качества |

#### Финансы

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/api/finance/transactions/` | История транзакций |
| POST | `/api/finance/pay/` | Пополнение баланса |
| POST | `/api/finance/withdraw/` | Запрос выплаты |

---

## 🧪 Тестирование

### Backend тесты

```bash
cd backend

# Установка зависимостей для тестов
pip install -r requirements-test.txt

# Запуск всех тестов
pytest

# Запуск с coverage отчетом
pytest --cov=apps --cov-report=html

# Запуск конкретного теста
pytest tests/test_auth.py -v

# Запуск с параллелизацией
pytest -n auto
```

### Frontend тесты

```bash
cd frontend

# Установка зависимостей
npm install

# Запуск всех тестов
npm run test

# Запуск в watch режиме
npm run test:watch

# Запуск с coverage отчетом
npm run test:coverage

# Запуск с UI
npm run test:ui
```

### Покрытие кода

| Компонент | Покрытие | Статус |
|-----------|----------|--------|
| Backend | 85% | ✅ |
| Frontend | 80% | ✅ |

---

## 🚢 Деплой

### Production конфигурация

```bash
# Запуск production версии
docker-compose -f docker-compose.prod.yml up -d
```

### Переменные окружения для production

```bash
# Обязательно установите в .env
SECRET_KEY=your-super-secret-key-here
DEBUG=False
ALLOWED_HOSTS=your-domain.com
CORS_ALLOWED_ORIGINS=https://your-domain.com
```

### Nginx конфигурация

Пример конфигурации Nginx доступен в `nginx/nginx.conf`.

### SSL/HTTPS

Для диплома используются самоподписанные сертификаты:

```bash
# Генерация самоподписанного сертификата
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/server.key \
  -out nginx/ssl/server.crt
```

Подробности см. в [docker-compose.prod.yml](./docker-compose.prod.yml).

---

## 🎓 Для защиты диплома

### Пояснительная записка

См. документ [DIPLOMA_EXPLANATION.md](./DIPLOMA_EXPLANATION.md) с подробным описанием:

- Решаемые бизнес-проблемы
- Архитектурные решения
- Описание модулей системы
- Скриншоты интерфейса
- Примеры использования API

### Презентация

Презентация для защиты находится в папке `/docs/presentation/`.

### Ключевые особенности для демонстрации

1. **Active Learning** — приоритизация сложных задач
2. **AI-Assisted разметка** — предразметка моделью
3. **Cross-Check QC** — перекрестная проверка аннотаций
4. **Финансовая система** — выплаты исполнителям
5. **JWT авторизация** — безопасный доступ к API

### Сценарий демонстрации

1. Регистрация заказчика и исполнителя
2. Создание датасета и задач
3. Разметка задачи исполнителем
4. Cross-check проверка
5. Выплата вознаграждения

---

## 📁 Структура проекта

```
dataset-ai/
├── backend/
│   ├── apps/
│   │   ├── users/           # Пользователи и авторизация
│   │   ├── datasets_core/   # Управление датасетами
│   │   ├── projects/        # Проекты и задачи
│   │   ├── labeling/        # Разметка данных
│   │   ├── quality/         # Контроль качества
│   │   └── finance/         # Финансы и платежи
│   ├── config/
│   │   ├── settings.py      # Настройки Django
│   │   ├── urls.py          # URL маршруты
│   │   └── wsgi.py          # WSGI конфигурация
│   ├── tests/
│   │   ├── conftest.py      # Фикстуры pytest
│   │   ├── test_auth.py     # Тесты авторизации
│   │   ├── test_datasets.py # Тесты датасетов
│   │   ├── test_tasks.py    # Тесты задач
│   │   ├── test_quality.py  # Тесты качества
│   │   └── test_finance.py  # Тесты финансов
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/      # UI компоненты
│   │   ├── pages/           # Страницы приложения
│   │   ├── services/        # API клиент
│   │   ├── store/           # Zustand store
│   │   ├── types/           # TypeScript типы
│   │   └── tests/           # Тесты компонентов
│   ├── vitest.config.ts
│   ├── package.json
│   └── Dockerfile
├── nginx/
│   └── nginx.conf           # Nginx конфигурация
├── .github/workflows/
│   ├── ci.yml               # CI/CD пайплайн
│   └── deploy.yml           # Автодеплой
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── README.md                # Этот файл
├── API.md                   # API документация
├── ARCHITECTURE.md          # Описание архитектуры
└── DIPLOMA_EXPLANATION.md   # Пояснения для защиты
```

---

## 🛠 Технологический стек

### Backend

- **Python 3.11** — язык программирования
- **Django 4.2** — веб-фреймворк
- **Django REST Framework** — REST API
- **MongoEngine** — ODM для MongoDB
- **MongoDB 7** — NoSQL база данных
- **Redis 7** — кэш и брокер сообщений
- **Celery 5** — очередь задач
- **PyJWT** — JWT токены

### Frontend

- **React 18** — UI библиотека
- **TypeScript 5** — типизация
- **Vite 5** — сборщик
- **Tailwind CSS 3** — стилизация
- **React Router 6** — роутинг
- **Zustand 4** — state management
- **React Query 5** — работа с API
- **Axios** — HTTP клиент
- **Vitest** — тестирование

### DevOps

- **Docker** — контейнеризация
- **Docker Compose** — оркестрация
- **Nginx** — reverse proxy
- **GitHub Actions** — CI/CD
- **pytest** — тесты backend
- **Vitest** — тесты frontend

---

## 👥 Команда

| Роль | Имя | Контакты |
|------|-----|----------|
| Full-stack разработчик | [Ваше Имя] | [your.email@example.com] |
| Научный руководитель | [ФИО Руководителя] | [supervisor.email@university.edu] |

---

## 📄 Лицензия

MIT License — см. [LICENSE](./LICENSE)

---

## 📞 Поддержка

- **Документация:** [README.md](./README.md), [API.md](./API.md)
- **Issues:** [GitHub Issues](https://github.com/yourusername/dataset-ai/issues)
- **Email:** [your.email@example.com]

---

## 🙏 Благодарности

- Кафедра [Название кафедры] за поддержку
- Научному руководителю [ФИО] за консультации
- Сообществу open-source за отличные инструменты

---

*Последнее обновление: Март 2026*
