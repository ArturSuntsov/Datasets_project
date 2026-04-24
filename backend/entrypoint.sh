#!/bin/sh
set -e

echo "🔧 Применяем миграции (если есть)..."
python manage.py migrate --noinput 2>/dev/null || true

echo "👥 Создаем тестовых аннотаторов..."
python manage.py seed_annotators --count 5

echo "🚀 Запускаем сервер..."
exec "$@"
