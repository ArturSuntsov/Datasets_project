# 📊 Итерация: Система оценки качества разметки (IoU + Dawid-Skene + EWMA)

## 🎯 Что добавлено

За эту итерацию в проект внедрена **полноценная система оценки качества разметки**, которая автоматически сравнивает ответы аннотаторов, вычисляет метрики и обновляет рейтинг.

---

## 📁 Новые файлы

| Файл | Назначение |
|------|-----------|
| `backend/apps/quality/services/__init__.py` | Инициализация пакета services |
| `backend/apps/quality/services/dawid_skene.py` | **Dawid-Skene EM-алгоритм** — вероятностная модель оценки качества для классификации. Определяет истинную метку без эталона, строит confusion matrix для каждого аннотатора |
| `backend/apps/quality/services/iou_matching.py` | **Greedy IoU Matching** — сравнение bounding box'ов через Intersection over Union. Жадный алгоритм сопоставления рамок |
| `backend/apps/quality/views_iou.py` | Эндпоинт `POST /api/quality/check-iou/` — быстрая проверка IoU по `work_item_id` без создания QualityReview |

## 📝 Изменённые файлы

| Файл | Что изменилось |
|------|---------------|
| `backend/apps/quality/models.py` | ✅ Добавлена коллекция `RatingHistory` (история изменений рейтинга). В `QualityMetric` добавлено поле `annotator` и `confusion_matrix`. В `QualityReview` поле `annotations` (список) заменило `annotation_a`/`annotation_b` |
| `backend/apps/quality/serializers.py` | ✅ Полностью переписан `ReviewSerializer`: поддержка multi-annotator, вызов Dawid-Skene или IoU Matching в зависимости от формата, обновление рейтинга через **EWMA** (экспоненциальное скользящее среднее) |
| `backend/apps/quality/views.py` | ✅ Упрощён `ReviewViewSet.create` — рейтинг обновляется внутри сериализатора, убран старый код с `annotation_a`/`annotation_b` |
| `backend/config/urls.py` | ✅ Добавлен маршрут `api/quality/check-iou/` |
| `backend/config/settings.py` | ✅ Добавлен параметр `ANNOTATOR_RATING_ALPHA = 0.1` (скорость обновления рейтинга) |
| `backend/apps/labeling/serializers.py` | ✅ Исправлен метод `create` — убраны поля `task_id`/`dataset_id` из `validated_data`, добавлена принудительная JWT-аутентификация |
| `backend/apps/labeling/views.py` | ✅ Исправлен `AnnotationViewSet.create` — принудительная аутентификация через `authenticate_from_jwt` |
| `frontend/src/components/AnnotationCanvas.tsx` | ✅ Горячие клавиши (`1-9`, `Delete`, `Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+C`, `Ctrl+V`, `D`, `P`, `?`), Undo/Redo, копирование/вставка рамок, модальное окно с подсказками |
| `frontend/src/pages/AnnotationPage.tsx` | ✅ Автосохранение каждые 30 секунд, индикатор несохранённых изменений, горячие клавиши (`Ctrl+S`, `Enter`), нумерация меток |

## 🔄 Как работает система оценки качества

### 1. IoU Matching (для bounding box / CV-проектов)

```
Аннотатор A рисует рамку → отправляет разметку
Аннотатор B рисует рамку → отправляет разметку
         ↓
Система находит обе аннотации для одного work_item
         ↓
greedy_iou_matching(boxes_A, boxes_B, threshold=0.5)
         ↓
Вычисляет IoU для каждой пары рамок
         ↓
IoU ≥ 0.5 → True Positive (совпадают)
IoU < 0.5 → False Positive / False Negative
         ↓
Precision = TP/(TP+FP), Recall = TP/(TP+FN), F1 = 2*P*R/(P+R)
         ↓
Результат: agreement_score = F1
```

### 2. Dawid-Skene (для классификации)

```
3 аннотатора дают ответы: cat, cat, dog
         ↓
EM-алгоритм (5-20 итераций):
  E-шаг: оценивает вероятности истинных меток
  M-шаг: обновляет confusion matrix каждого аннотатора
         ↓
Результат:
  - accuracy для каждого аннотатора
  - confusion matrix (какие классы путает)
  - наиболее вероятная истинная метка
```

### 3. Обновление рейтинга (EWMA)

```
task_score = accuracy × (0.5 + 0.5 × difficulty_score)
rating_new = α × task_score + (1-α) × rating_old
где α = 0.1 (ANNOTATOR_RATING_ALPHA)

Сохраняется в RatingHistory:
  - rating_before → rating_after
  - rating_delta
  - task_id, f1_score, difficulty
```

## 🚀 API-эндпоинты

| Метод | URL | Назначение |
|-------|-----|------------|
| `POST` | `/api/quality/review/` | Создать QualityReview (Dawid-Skene или IoU) |
| `GET` | `/api/quality/metrics/{dataset_id}/` | Получить метрики по датасету |
| `POST` | `/api/quality/check-iou/` | **Быстрая проверка IoU** (новый) |
| `GET` | `/api/quality/project/{id}/dawid-skene/` | Метрики Dawid-Skene для проекта |

### Пример: быстрая проверка IoU

```powershell
$token = (Invoke-RestMethod -Uri "http://localhost:8001/api/auth/login/" `
  -Method POST -Body '{"identifier":"customer@test.com","password":"customer123"}' `
  -ContentType "application/json").access

Invoke-RestMethod -Uri "http://localhost:8001/api/quality/check-iou/" `
  -Method POST `
  -Body '{"work_item_id":"69fedc564f34d0b36a7bfb2c"}' `
  -Headers @{"Authorization"="Bearer $token"; "Content-Type"="application/json"} `
  | ConvertTo-Json -Depth 5
```

**Ответ:**
```json
{
  "work_item_id": "69fedc564f34d0b36a7bfb2c",
  "annotations_count": 2,
  "pairwise_comparisons": [{
    "annotator_a": "annotator_alex",
    "annotator_b": "annotator_maria",
    "iou": 0.9719,
    "f1": 1.0,
    "precision": 1.0,
    "recall": 1.0,
    "tp": 1, "fp": 0, "fn": 0,
    "status": "MATCH"
  }],
  "average_iou": 0.9719,
  "threshold": 0.5,
  "verdict": "MATCH"
}
```

## ⌨️ Горячие клавиши разметки

| Клавиша | Действие |
|---------|----------|
| `1-9` | Выбрать метку по номеру |
| `Delete` / `Backspace` | Удалить выбранную рамку |
| `Ctrl+Z` | Отменить последнее действие |
| `Ctrl+Shift+Z` | Повторить отменённое |
| `Ctrl+C` / `Ctrl+V` | Копировать / вставить рамку |
| `D` | Инструмент «Разметка» |
| `P` | Инструмент «Перемещение» |
| `Escape` | Снять выделение |
| `Ctrl+S` | Сохранить черновик |
| `Enter` | Отправить финальную разметку |
| `→` / `←` | Следующий / предыдущий кадр |
| `?` | Показать панель горячих клавиш |

## 📊 Проверка IoU напрямую через MongoDB (JS-скрипт)

```powershell
$script = @'
const workItemId = ObjectId("69fedc564f34d0b36a7bfb2c");
const annotations = db.cv_work_annotations.find({ work_item: workItemId }).toArray();

if (annotations.length < 2) { print("Нужно 2 аннотации!"); quit(); }

function computeIoU(a, b) {
    const ix = Math.max(0, Math.min(a.x+a.width, b.x+b.width) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y+a.height, b.y+b.height) - Math.max(a.y, b.y));
    const inter = ix * iy;
    const union = a.width*a.height + b.width*b.height - inter;
    return union > 0 ? inter / union : 0;
}

const boxesA = annotations[0].label_data.boxes || [];
const boxesB = annotations[1].label_data.boxes || [];

print("IoU: " + boxesA.map((a,i) => boxesB.map((b,j) => 
  "A"+(i+1)+" vs B"+(j+1)+": " + computeIoU(a,b).toFixed(4)).join("\n")
).join("\n"));
'@

$script | Out-File -FilePath "check_iou.js" -Encoding UTF8
docker cp check_iou.js dataset_mongodb:/tmp/check_iou.js
docker exec dataset_mongodb mongosh --quiet ai_dataset_db /tmp/check_iou.js
Remove-Item check_iou.js -Force
```

## 🎯 Результаты проверки

| Метрика | Значение |
|---------|----------|
| Рамка Алексея | x=580, y=384.5, w=803.6, h=481.8 [drone] |
| Рамка Марии | x=580, y=377.2, w=814.5, h=489.1 [drone] |
| **IoU** | **0.9719** |
| **F1** | **1.0** |
| **Precision** | **1.0** |
| **Recall** | **1.0** |
| **Вердикт** | ✅ **MATCH** (рамки совпадают) |
