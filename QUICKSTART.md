# 🚀 БЫСТРЫЙ СТАРТ - 3 КОМАНДЫ

## Запуск проекта

### 1. Перейдите в директорию проекта
```bash
cd d:\Dataset_for_AI
```

### 2. Запустите все сервисы одной командой
```bash
docker-compose up -d
```

### 3. Откройте приложение
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8000/api/

### 4. Создайте первого пользователя
Откройте frontend и зарегистрируйтесь через форму, либо через API:
```bash
curl -X POST http://localhost:8000/api/auth/register/ \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","username":"admin","password":"your-strong-password","role":"admin"}'
  ```

```
Email: admin@example.com
Пароль: admin123
```

---

## Остановка

```bash
docker-compose down
```

---

## Проверка статуса

```bash
docker-compose ps
```

---

## Просмотр логов

```bash
docker-compose logs -f
```

---

## Требования

| Компонент | Версия |
|-----------|--------|
| Docker | 20.10+ |
| Docker Compose | 2.0+ |

---

## Структура

```
Dataset_for_AI/
├── backend/          # Django API (порт 8000)
├── frontend/         # React App (порт 5173)
├── mongodb           # База данных (порт 27017)
├── redis             # Очередь (порт 6379)
└── docker-compose.yml
```

---

**Всё готово к работе! 🎉**
