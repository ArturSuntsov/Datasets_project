# Диагностика проблем

## Ошибка 500 при логине

### Возможные причины:

1. **MongoDB не запущена**
   ```bash
   # Проверьте Docker контейнеры
   docker-compose ps
   
   # MongoDB должен быть в статусе "Up"
   dataset_mongodb    Up (healthy)
   ```

2. **Backend не может подключиться к MongoDB**
   - Проверьте логи backend:
   ```bash
   docker-compose logs -f web
   ```
   
   Ищите сообщение:
   - ✓ `MongoDB подключен: db:27017` - всё OK
   - ✗ `Ошибка подключения к MongoDB` - проблема с подключением

3. **Redis не запущен**
   ```bash
   # Должен быть в статусе "Up"
   dataset_redis      Up (healthy)
   ```

### Решение:

```bash
# 1. Остановите все контейнеры
docker-compose down

# 2. Перезапустите
docker-compose up -d

# 3. Проверьте статус
docker-compose ps

# 4. Проверьте логи
docker-compose logs -f web
```

---

## Долгая загрузка при входе

### Причина:
- Timeout подключения к MongoDB (5 секунд)
- Если MongoDB не доступна, сервер ждет timeout

### Решение:

1. **Убедитесь что MongoDB запущен:**
   ```bash
   docker-compose ps | findstr mongodb
   ```

2. **Проверьте подключение к MongoDB:**
   ```bash
   # Windows PowerShell
   docker-compose exec db mongosh --eval "db.runCommand({ping: 1})"
   ```

3. **Проверьте логи backend:**
   ```bash
   docker-compose logs web | Select-String -Pattern "MongoDB"
   ```

---

## Ошибка CORS

Если видите в консоли:
```
Access to XMLHttpRequest blocked by CORS policy
```

### Решение:

В `backend/config/settings.py` убедитесь что:
```python
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
]

CORS_ALLOW_ALL_ORIGINS = True  # Для разработки
```

---

## Ошибка 403 Forbidden

### Причина:
- JWT токен не отправляется или неверный
- Пользователь не найден по токену

### Решение:

1. **Проверьте localStorage:**
   Откройте DevTools → Application → Local Storage
   Должен быть ключ: `dataset_ai_access_token`

2. **Если токена нет - войдите снова:**
   ```
   http://localhost:3000/login
   ```

3. **Проверьте что пользователь существует в MongoDB:**
   ```bash
   docker-compose exec db mongosh ai_dataset_db --eval "db.users.find().pretty()"
   ```

---

## Нет изображения на AnnotationPage

### Причина:
- У задачи нет `input_ref` или `frame_url`
- Файл не загружен в проект

### Решение:

1. **Загрузите файлы в проект:**
   - Перейдите на `/projects/create`
   - Загрузите изображения

2. **Проверьте что задачи созданы:**
   ```bash
   # Docker
   docker-compose exec db mongosh ai_dataset_db --eval "db.tasks.find().pretty()"
   ```

3. **Проверьте что файлы существуют:**
   ```
   backend/media/uploads/{project_id}/
   ```

---

## Быстрая проверка работоспособности

```bash
# 1. Запустите проект
docker-compose up -d

# 2. Подождите 10-15 секунд (пока MongoDB инициализируется)

# 3. Проверьте статус
docker-compose ps

# Все сервисы должны быть "Up"

# 4. Откройте браузер
http://localhost:3000

# 5. Войдите (используйте тестовые данные если есть)
# Email: customer@test.com
# Password: test123

# 6. Создайте проект
http://localhost:3000/projects/create

# 7. Загрузите изображения

# 8. Перейдите к разметке
http://localhost:3000/projects/{PROJECT_ID}/annotation
```

---

## Частые ошибки

### "service backend is not running"
```bash
docker-compose up -d web
```

### "Connection refused" на порту 8000
```bash
# Проверьте что backend запущен
docker-compose ps web

# Если не запущен - запустите
docker-compose up -d web
```

### "MongoServerError: Authentication failed"
```bash
# Пересоздайте контейнер MongoDB
docker-compose down
docker-compose up -d db
```

### Файлы не загружаются
```bash
# Проверьте права доступа к директории media
# Windows: убедитесь что Docker Desktop имеет доступ
```
