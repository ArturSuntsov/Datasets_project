# Руководство по использованию платформы

## Текущий функционал

### ✅ Что уже работает:

1. **Аутентификация** (JWT)
   - Регистрация и вход
   - Токены сохраняются в localStorage

2. **Создание проекта** (Computer Vision)
   - Страница: `http://localhost:3000/projects/create`
   - Типы аннотаций: Bounding Boxes, Polygons, Keypoints, Classification
   - Загрузка изображений и видео

3. **Разметка изображений**
   - Страница: `http://localhost:3000/projects/{id}/annotation`
   - Рисование рамок (bounding boxes)
   - Отображение изображений
   - Отправка аннотаций

4. **Backend для загрузки файлов**
   - Локальное хранилище (`backend/media/uploads/`)
   - Поддержка: JPG, PNG, GIF, MP4, AVI, MOV
   - Максимальный размер: 10MB

---

## Как создать проект и разметить данные

### Шаг 1: Войдите в систему
```
http://localhost:3000/login
```

Используйте тестовые данные (если запущен `seed_test_data`):
- Email: `customer@test.com` / Password: `test123`
- Email: `annotator@test.com` / Password: `test123`

### Шаг 2: Создайте проект
```
http://localhost:3000/projects/create
```

1. Выберите тип проекта: **Computer Vision**
2. Введите название (например, "Drone Detection")
3. Выберите тип аннотации: **Bounding Boxes**
4. Загрузите файлы (изображения/видео)
5. Нажмите **Create Project**

После создания вы будете перенаправлены на страницу проекта.

### Шаг 3: Перейдите к разметке
```
http://localhost:3000/projects/{PROJECT_ID}/annotation
```

**Важно:** Замените `{PROJECT_ID}` на реальный ID из MongoDB (например, `69dd28b2db35f1391d364dca`)

На странице разметки:
1. Дождитесь загрузки изображения
2. **Кликните и тяните** чтобы нарисовать рамку вокруг объекта (дрон и т.д.)
3. Нажмите **Submit Annotation** для сохранения
4. Или **Skip Task** чтобы пропустить

---

## API Endpoints

### Создание CV проекта
```http
POST /api/cv/projects/
Content-Type: application/json

{
  "title": "Drone Detection",
  "annotation_type": "bbox",
  "description": "Detect drones in video footage"
}
```

### Загрузка файла
```http
POST /api/cv/projects/{project_id}/upload/
Content-Type: multipart/form-data

file: <image/video file>
```

### Получить следующую задачу
```http
GET /api/cv/tasks/next/?project_id={project_id}
```

### Отправить аннотацию
```http
POST /api/cv/tasks/{task_id}/annotate/
Content-Type: application/json

{
  "boxes": [
    {"x": 100, "y": 100, "width": 200, "height": 150}
  ]
}
```

---

## Хранение файлов

Загруженные файлы сохраняются в:
```
backend/media/uploads/{project_id}/{filename}
```

URL для доступа к файлам:
```
http://localhost:8000/media/uploads/{project_id}/{filename}
```

---

## Что нужно доработать:

### 🔧 Требуется улучшение:

1. **Связь Projects и Datasets**
   - Сейчас есть две отдельные модели проектов
   - Нужно объединить или создать явную связь

2. **Управление проектом**
   - Страница проекта (список файлов, задач, аннотаций)
   - Редактирование проекта
   - Удаление файлов

3. **Видео разметка**
   - Сейчас поддерживаются только изображения
   - Нужно добавить покадровую разметку видео

4. **Массовая загрузка**
   - Drag & drop интерфейс
   - Прогресс-бар загрузки
   - ZIP архивы

5. **Предпросмотр аннотаций**
   - Редактирование существующих рамок
   - Удаление рамок
   - Метки классов (drone, bird, etc.)

6. **Автоматическое создание задач**
   - При загрузке файлов автоматически создавать задачи
   - Связь MediaAsset → Task

---

## Архитектура данных

### CVProject (mongoengine)
```python
CVProject:
  - title: str
  - description: str
  - annotation_type: str (bbox/polygon/keypoints/classification)
  - created_at: datetime

MediaAsset:
  - project: Reference(CVProject)
  - file_uri: str
  - asset_type: str (image/video)
  - file_size: int

MediaFrame:
  - asset: Reference(MediaAsset)
  - frame_uri: str
  - frame_number: int

AnnotationTask:
  - frame: Reference(MediaFrame)
  - status: str (pending/done)
  
Annotation:
  - task: Reference(AnnotationTask)
  - data: Dict (координаты рамок и т.д.)
```

---

## Быстрый тест

```bash
# 1. Запустите проект
docker-compose up -d

# 2. Создайте тестовые данные (опционально)
docker-compose exec backend python manage.py seed_test_data

# 3. Откройте браузер
http://localhost:3000/projects/create

# 4. Создайте проект и загрузите изображения

# 5. Перейдите к разметке
http://localhost:3000/projects/{PROJECT_ID}/annotation
```
