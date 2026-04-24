# Финальная инструкция по запуску проекта

## Сервис по сбору Dataset для ИИ

Этот документ содержит пошаговую инструкцию для запуска проекта и демонстрации на защите диплома.

---

## 📋 Содержание

1. [Быстрый старт (локальная разработка)](#1-быстрый-старт-локальная-разработка)
2. [Запуск тестов](#2-запуск-тестов)
3. [Production деплой](#3-production-деплой)
4. [Демонстрация для защиты](#4-демонстрация-для-защиты)
5. [Устранение проблем](#5-устранение-проблем)

---

## 1. Быстрый старт (локальная разработка)

### Требования

- Docker Desktop (Windows/Mac) или Docker + Docker Compose (Linux)
- Python 3.11+ (опционально, для разработки backend)
- Node.js 18+ (опционально, для разработки frontend)

### Шаг 1: Клонирование репозитория

```bash
git clone https://github.com/yourusername/dataset-ai.git
cd dataset-ai
```

### Шаг 2: Настройка переменных окружения

```bash
# Скопируйте шаблон
cp .env.example .env

# Для локальной разработки значения по умолчанию подходят
# При необходимости отредактируйте .env
```

### Шаг 3: Запуск через Docker Compose

```bash
# Запуск всех сервисов в фоновом режиме
docker-compose up -d

# Проверка статуса
docker-compose ps

# Просмотр логов
docker-compose logs -f

# Остановка
docker-compose down
```

### Шаг 4: Открытие приложения

| Сервис | URL | Описание |
|--------|-----|----------|
| **Frontend** | http://localhost:5173 | Основное приложение |
| **Backend API** | http://localhost:8000/api/ | REST API |
| **Django Admin** | http://localhost:8000/admin/ | Панель администратора |
| **MongoDB** | localhost:27017 | База данных |
| **Redis** | localhost:6379 | Кэш/очередь |

### Шаг 5: Первый вход

**Тестовая учетная запись:**

```
Email: admin@example.com
Пароль: admin123
Роль: admin
```

**Или зарегистрируйтесь:**

1. Откройте http://localhost:5173
2. Нажмите "Регистрация"
3. Заполните форму
4. Войдите с новыми учетными данными

---

## 2. Запуск тестов

### Backend тесты

```bash
# Перейдите в директорию backend
cd backend

# Установите зависимости для тестов
pip install -r requirements-test.txt

# Запуск всех тестов
pytest

# Запуск с verbose выводом
pytest -v

# Запуск конкретного тест файла
pytest tests/test_auth.py -v

# Запуск с coverage отчетом
pytest --cov=apps --cov-report=html --cov-report=term

# Запуск с параллелизацией (быстрее)
pytest -n auto

# Открыть HTML отчет о покрытии
# Windows: start htmlcov/index.html
# Linux/Mac: open htmlcov/index.html
```

### Frontend тесты

```bash
# Перейдите в директорию frontend
cd frontend

# Установите зависимости
npm install

# Запуск всех тестов
npm run test

# Запуск в watch режиме (автоматически при изменениях)
npm run test:watch

# Запуск с coverage отчетом
npm run test:coverage

# Запуск с UI (интерактивный режим)
npm run test:ui
```

### Проверка покрытия

| Компонент | Команда | Требуемое покрытие |
|-----------|---------|-------------------|
| Backend | `pytest --cov=apps` | ≥80% |
| Frontend | `npm run test:coverage` | ≥80% |

---

## 3. Production деплой

### Требования

- Сервер с Ubuntu 20.04+ или Debian 11+
- Docker и Docker Compose
- Доменное имя (опционально)
- SSL сертификат (опционально)

### Шаг 1: Подготовка сервера

```bash
# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Проверка
docker --version
docker-compose --version
```

### Шаг 2: Клонирование проекта

```bash
git clone https://github.com/yourusername/dataset-ai.git
cd dataset-ai
```

### Шаг 3: Настройка переменных окружения

```bash
cp .env.example .env

# Отредактируйте .env:
# - SECRET_KEY=сгенерируйте новый ключ
# - DEBUG=False
# - ALLOWED_HOSTS=your-domain.com
nano .env
```

### Шаг 4: Генерация SSL сертификатов (для диплома)

```bash
# Создание директории для SSL
mkdir -p nginx/ssl

# Генерация самоподписанного сертификата
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/server.key \
  -out nginx/ssl/server.crt \
  -subj "/C=RU/ST=Moscow/L=Moscow/O=Diploma/CN=localhost"

# Установка прав доступа
chmod 600 nginx/ssl/server.key
chmod 644 nginx/ssl/server.crt
```

### Шаг 5: Запуск production конфигурации

```bash
# Запуск production версии
docker-compose -f docker-compose.prod.yml up -d

# Проверка статуса
docker-compose -f docker-compose.prod.yml ps

# Просмотр логов
docker-compose -f docker-compose.prod.yml logs -f
```

### Шаг 6: Проверка доступности

```bash
# Проверка HTTP
curl http://localhost/health

# Проверка HTTPS (для самоподписанного сертификата)
curl -k https://localhost/health

# Проверка API
curl http://localhost/api/
```

---

## 4. Демонстрация для защиты

### Сценарий демонстрации (10 минут)

#### Часть 1: Введение (1 минута)

1. Открыть http://localhost:5173
2. Показать главную страницу
3. Кратко описать назначение системы

#### Часть 2: Регистрация и вход (2 минуты)

1. **Регистрация заказчика:**
   - Нажать "Регистрация"
   - Email: `customer@test.com`
   - Username: `customer`
   - Password: `password123`
   - Role: `customer`

2. **Регистрация исполнителя:**
   - Выйти из системы
   - Зарегистрировать: `annotator@test.com`, `annotator`, `password123`, `annotator`

3. **Войти как заказчик**

#### Часть 3: Создание датасета (2 минуты)

1. Перейти в раздел "Датасеты"
2. Нажать "Создать датасет"
3. Заполнить:
   - Название: "Image Classification Dataset"
   - Описание: "Датасет для классификации изображений"
   - Формат: classification_v1
4. Сохранить

#### Часть 4: Создание задачи (2 минуты)

1. Перейти в раздел "Задачи"
2. Нажать "Создать задачу"
3. Выбрать созданный датасет
4. Установить сложность: 0.7
5. Сохранить

#### Часть 5: Разметка (2 минуты)

1. Выйти и войти как `annotator@test.com`
2. Перейти в "Задачи"
3. Выбрать задачу
4. Нажать "Разметить"
5. Выбрать класс: "cat"
6. Нажать "Сохранить"

#### Часть 6: Контроль качества (1 минута)

1. Выйти и войти как `customer@test.com`
2. Перейти в "Качество"
3. Показать метрики
4. Объяснить cross-check процесс

#### Часть 7: Финансы (1 минута)

1. Перейти в "Финансы"
2. Нажать "Пополнить баланс"
3. Ввести сумму: 100
4. Показать историю транзакций

#### Часть 8: Заключение (1 минута)

1. Показать Dashboard со статистикой
2. Кратко подытожить возможности
3. Ответить на вопросы

### Чек-лист для проверки

- [ ] Все сервисы запущены (`docker-compose ps`)
- [ ] Frontend доступен (http://localhost:5173)
- [ ] Backend отвечает (http://localhost:8000/api/)
- [ ] Тесты проходят (`pytest` и `npm test`)
- [ ] Тестовые пользователи созданы
- [ ] Есть созданный датасет и задача

---

## 5. Устранение проблем

### Проблема: "Port already in use"

**Решение:**
```bash
# Остановить другие сервисы на порту 5173/8000
# Или изменить порты в docker-compose.yml
```

### Проблема: "MongoDB connection failed"

**Решение:**
```bash
# Проверить что MongoDB запущен
docker-compose ps mongodb

# Перезапустить MongoDB
docker-compose restart mongodb

# Проверить логи
docker-compose logs mongodb
```

### Проблема: "ModuleNotFoundError: No module named '...'"

**Решение:**
```bash
# Пересобрать backend контейнер
docker-compose build backend
docker-compose up -d backend
```

### Проблема: "npm install failed"

**Решение:**
```bash
# Очистить кэш npm
npm cache clean --force

# Удалить node_modules и package-lock.json
rm -rf node_modules package-lock.json

# Повторить установку
npm install
```

### Проблема: Тесты не проходят

**Решение:**
```bash
# Для backend тестов убедиться что MongoDB и Redis запущены
docker-compose up -d mongodb redis

# Запустить тесты с чистой БД
pytest --create-db

# Для frontend тестов
npm run test -- --run
```

### Проблема: "CORS error" в браузере

**Решение:**
```bash
# Проверить CORS_ALLOWED_ORIGINS в .env
# Должен включать http://localhost:5173

# Перезапустить backend
docker-compose restart backend
```

### Проблема: "JWT token expired"

**Решение:**
- Токен действителен 60 минут
- Выйти и войти заново
- Или увеличить JWT_ACCESS_TTL_MINUTES в .env

---

## 📞 Контакты для поддержки

- **Email:** support@your-domain.com
- **GitHub Issues:** https://github.com/yourusername/dataset-ai/issues

---

*Версия инструкции: 1.0*

*Последнее обновление: Март 2026*
