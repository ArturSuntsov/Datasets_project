# Исправления для AnnotationPage

## Найденные и исправленные проблемы

### 1. ❌ Проблема с cvApi.tsx
**Было:** 
- Использовался неверный `baseURL: "http://localhost:8000/api/cv"` 
- Такого эндпоинта не существует в URLs
- Не отправлялся JWT токен

**Стало:**
- Исправлен baseURL на `"http://localhost:8000/api"`
- Добавлен interceptor для отправки JWT токена
- Используются правильные эндпоинты

### 2. ❌ Отсутствие эндпоинта для получения следующей задачи
**Было:** Эндпоинт `/api/cv/tasks/next/` не существовал

**Стало:**
- Добавлен `@action` метод `tasks_next` в `ProjectViewSet`
- URL: `GET /api/projects/{id}/tasks/next/`
- Поддержка Active Learning (сортировка по difficulty_score)
- Доступно для owner проекта и annotator

### 3. ❌ Проблема с аутентификацией
**Было:** 
- `cvApi` не отправляла JWT токен
- `request.user` не устанавливался в `JWTRequiredMixin`

**Стало:**
- Добавлена установка `request.user` в `_get_user()`
- `cvApi` теперь использует `getAccessToken()` из `api.ts`
- Токены сохраняются/загружаются корректно

### 4. ❌ AnnotationPage не обрабатывал ошибки
**Было:** Страница "зависала" при ошибке без обратной связи

**Стало:**
- Добавлена обработка loading/error/no-tasks состояний
- Красивый UI с Tailwind CSS
- Кнопки "Retry" и "Skip Task"
- Отображение информации о задаче

### 5. ❌ TaskSerializer не возвращал нужные поля
**Было:** Отсутствовали `task_id` и `frame_url`

**Стало:**
- Добавлен `task_id` (копия `id` для совместимости)
- Добавлен `frame_url` (для MVP = `input_ref`)

## Как протестировать

### 1. Запустите проект
```bash
docker-compose up -d
```

### 2. Создайте тестовые данные
```bash
# Войдите в backend контейнер
docker-compose exec backend bash

# Запустите seed команду
python manage.py seed_test_data
```

### 3. Войдите как аннотатор
- Email: `annotator@test.com`
- Password: `test123`

### 4. Перейдите на AnnotationPage
```
http://localhost:5173/projects/{PROJECT_ID}/annotation
```
PROJECT_ID будет показан после выполнения seed команды.

## Дополнительные улучшения

### Что еще можно улучшить:
1. **Проверка проектов** - добавить страницу списка проектов
2. **Создание проекта через UI** - сейчас только через API
3. **Валидация AnnotationCanvas** - проверить работу с изображениями
4. **Обработка bbox** - улучшить формат аннотаций
5. **Real-time обновление** - WebSocket для новых задач

## API Endpoints для Annotation

### Получить следующую задачу
```
GET /api/projects/{project_id}/tasks/next/
Authorization: Bearer <token>
```

### Отправить аннотацию
```
PATCH /api/tasks/{task_id}/annotate/
Authorization: Bearer <token>
Body: {
  "label_data": { "boxes": [...] },
  "is_final": true
}
```

## Примечания

### Проблема с редиректом на /login
Если вас редиректит на страницу авторизации при переходе на `/projects/1/annotation`:

1. **Убедитесь, что вы авторизованы** - проверьте localStorage на наличие токенов
2. **Проверьте роль** - должен быть `annotator` или `customer`
3. **Проверьте Project ID** - должен быть ObjectId из MongoDB, не просто `1`

### Создание проекта через API
```bash
# Сначала войдите
curl -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"identifier":"customer@test.com","password":"test123"}'

# Создайте проект с токеном
curl -X POST http://localhost:8000/api/projects/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -d '{"title":"My Project","description":"Test"}'
```
