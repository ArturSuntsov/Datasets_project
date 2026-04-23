# Платформа сбора и разметки датасетов (Фото/Видео)

Этот репозиторий содержит end-to-end workflow разметки CV-датасетов для изображений и видео: загрузка, обработка, assignment исполнителям, QA ревью и экспорт результата.

## Что реализовано

- Полный pipeline в `cv_annotation`: импорт фото/видео, разбиение видео на кадры, preview и finalize.
- Очередь исполнителей с bbox-разметкой, черновиками и финальной отправкой.
- Автоматическая оценка согласованности между аннотаторами (IoU/F1), auto-accept при достаточном agreement и перевод спорных кейсов в review.
- Очередь ревьюеров и финальное разрешение споров с фиксацией итоговой аннотации.
- Строгая валидация bbox и меток на backend:
  - обязательные поля `x/y/width/height/label`,
  - числовые координаты,
  - `width/height > 0`,
  - рамка внутри границ кадра,
  - label из `project.label_schema`.
- Клиентская pre-submit валидация bbox на странице разметки.
- Экспорт проекта в форматах `COCO`, `YOLO` или `COCO+YOLO`, включая `quality_report`.

## Архитектура workflow

Основной домен workflow находится в:

- `backend/apps/cv_annotation/models.py`
- `backend/apps/cv_annotation/views.py`
- `backend/apps/cv_annotation/services/workflow.py`
- `backend/apps/cv_annotation/services/upload.py`
- `backend/apps/cv_annotation/services/frames.py`

Legacy endpoint `PATCH /api/tasks/{id}/annotate/` ограничен для CV-проектов и не должен использоваться в новом CV процессе.

## Ключевые API для workflow

- `POST /api/projects/{project_id}/imports/` - загрузка файла в import session.
- `POST /api/projects/{project_id}/imports/{import_id}/finalize/` - создание work items и assignments.
- `GET /api/projects/{project_id}/overview/` - агрегированный прогресс проекта.
- `GET /api/projects/{project_id}/export/?format=both|coco|yolo` - экспорт датасета.
- `GET /api/annotator/queue/` - очередь аннотатора.
- `GET /api/annotator/assignments/{assignment_id}/` - детали assignment.
- `POST /api/annotator/assignments/{assignment_id}/submit/` - submit черновика/финала.
- `GET /api/reviewer/queue/` - очередь ревью.
- `GET /api/reviews/{review_id}/` - детали спора.
- `POST /api/reviews/{review_id}/resolve/` - финальное решение ревьюера.

## Как работает процесс (коротко)

1. Заказчик создает CV-проект (`project_type=cv`) и настраивает `label_schema`.
2. Загружает фото/видео в import session.
3. Backend валидирует файлы, извлекает кадры из видео (`ffmpeg`) и формирует preview.
4. После finalize создаются `WorkItem` и `Assignment`.
5. Аннотаторы размечают bbox и отправляют результат.
6. Сервис оценки считает agreement; при низком значении формируется `ReviewRecord`.
7. Ревьюер выбирает финальную разметку.
8. Заказчик экспортирует датасет в нужном формате.

## Frontend страницы процесса

- `frontend/src/pages/ProjectDetailPage.tsx` - импорт, finalize, экспорт.
- `frontend/src/pages/AnnotationPage.tsx` - bbox-разметка + pre-submit проверки.
- `frontend/src/pages/LabelingPage.tsx` - очередь аннотатора.
- `frontend/src/pages/QualityPage.tsx` - очередь ревьюера.

## Запуск локально

### Backend

```bash
cd backend
pip install -r requirements.txt
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Проверка end-to-end

1. Создать проект с `project_type=cv`, `annotation_type=bbox`, заполнить `label_schema`.
2. Загрузить 1-2 изображения и 1 видео в `ProjectDetailPage`.
3. Нажать finalize и убедиться, что появились `work_items` и `assignments`.
4. Под аннотатором выполнить submit нескольких assignment.
5. При низком agreement проверить появление задач в `QualityPage`.
6. Выполнить resolve ревью.
7. Запустить экспорт:
   - `?format=coco`
   - `?format=yolo`
   - `?format=both`
8. Проверить, что в ответе есть `quality_report` и ожидаемые секции формата.

## Ограничения текущей версии

- Поддерживается только тип разметки `bbox`.
- Экспорт возвращается как API payload (без отдельного архиватора файлов).
- Обработка видео выполняется синхронно в API запросе.

## Ближайший roadmap

- Асинхронная обработка видео (queue/worker).
- Экспорт в архив (`zip`) с файловой структурой dataset.
- Поддержка дополнительных типов разметки (polygon/keypoints/tracking).
