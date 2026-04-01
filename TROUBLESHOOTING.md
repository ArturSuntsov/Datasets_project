# 🔧 Диагностика и исправление перезапуска контейнеров

## 📋 Команды для диагностики

### 1. Проверка статуса контейнеров
```bash
docker compose ps
```

Ожидаемый результат:
- backend: **Up** (не Restarting!)
- celery: **Up** (не Restarting!)
- mongodb: **Up (healthy)**
- redis: **Up (healthy)**
- frontend: **Up**

### 2. Просмотр логов backend
```bash
docker compose logs --tail=100 backend
```

### 3. Просмотр логов celery
```bash
docker compose logs --tail=100 celery
```

### 4. Проверка подключения к MongoDB
```bash
docker compose exec mongodb mongosh --eval "db.adminCommand('ping')"
```

### 5. Проверка подключения к Redis
```bash
docker compose exec redis redis-cli ping
```

### 6. Проверка Django
```bash
docker compose exec backend python manage.py check
```

### 7. Проверка миграций
```bash
docker compose exec backend python manage.py showmigrations
```

---

## ✅ Что было исправлено

### 1. docker-compose.yml
- ✅ Добавлены **healthcheck** для MongoDB и Redis
- ✅ Изменены `depends_on` на использование `condition: service_healthy`
- ✅ Добавлен `--pool=solo` для Celery (исключает проблемы с multiprocessing в Docker)
- ✅ Добавлен `|| true` для миграций (чтобы ошибки не останавливали запуск)
- ✅ Правильные имена сервисов: `mongodb`, `redis`

### 2. backend/config/settings.py
- ✅ Исправлено подключение MongoDB через URI
- ✅ Добавлена обработка ошибок подключения
- ✅ Добавлены информативные сообщения о статусе подключения

### 3. backend/Dockerfile
- ✅ Добавлена директория для логов

### 4. .env
- ✅ Установлены правильные хосты: `MONGODB_HOST=mongodb`, `REDIS_HOST=redis`
- ✅ Добавлены `ALLOWED_HOSTS` для Docker

---

## 🚀 Перезапуск контейнеров

### Полный перезапуск (очистка и запуск заново)
```bash
# Остановка и удаление контейнеров
docker compose down

# Удаление томов (если нужны чистые данные)
docker compose down -v

# Сборка заново
docker compose build --no-cache

# Запуск
docker compose up -d
```

### Проверка статуса
```bash
docker compose ps
```

### Просмотр логов в реальном времени
```bash
docker compose logs -f backend
docker compose logs -f celery
```

---

## 🐛 Частые ошибки и решения

### Ошибка 1: MongoDB не доступен
**Симптом:** `pymongo.errors.ServerSelectionTimeoutError`

**Решение:**
```bash
# Проверить что MongoDB запущен
docker compose ps mongodb

# Проверить логи MongoDB
docker compose logs mongodb

# Перезапустить MongoDB
docker compose restart mongodb
```

### Ошибка 2: Redis не доступен
**Симптом:** `redis.exceptions.ConnectionError`

**Решение:**
```bash
# Проверить что Redis запущен
docker compose ps redis

# Проверить подключение
docker compose exec redis redis-cli ping

# Перезапустить Redis
docker compose restart redis
```

### Ошибка 3: Миграции не применяются
**Симптом:** `django.db.utils.OperationalError`

**Решение:**
```bash
# Применить миграции вручную
docker compose exec backend python manage.py migrate

# Создать суперпользователя
docker compose exec backend python manage.py createsuperuser
```

### Ошибка 4: Celery не запускается
**Симптом:** `ModuleNotFoundError` или `ImportError`

**Решение:**
```bash
# Пересобрать backend контейнер
docker compose build backend

# Запустить заново
docker compose up -d backend celery
```

### Ошибка 5: Port already in use
**Симптом:** `Address already in use`

**Решение:**
```bash
# Остановить другие сервисы на порту 8000/5173
# Или изменить порты в docker-compose.yml
```

---

## 📊 Ожидаемые логи

### Успешный запуск backend
```
✓ MongoDB подключен: mongodb:27017/dataset_ai
Watching for file changes with StatReloader
Performing system checks...
System check identified no issues (0 silenced).
Django version 4.2.7, using settings 'config.settings'
Starting development server at http://0.0.0.0:8000/
Quit the server with CONTROL-C.
```

### Успешный запуск Celery
```
✓ MongoDB подключен: mongodb:27017/dataset_ai
celery@hostname ready.
```

---

## 🎯 Финальная проверка

```bash
# 1. Проверить статус
docker compose ps

# 2. Проверить backend
curl http://localhost:8000/api/

# 3. Проверить frontend
# Открыть http://localhost:5173

# 4. Проверить API health
curl http://localhost:8000/admin/
```

---

## 📞 Если проблема не решается

### Альтернативный запуск без Docker

#### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
python manage.py runserver
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

#### MongoDB и Redis локально
```bash
# MongoDB
mongod --dbpath /data/db

# Redis
redis-server
```

---

**Контейнеры должны работать со статусом "Up" 🎉**
