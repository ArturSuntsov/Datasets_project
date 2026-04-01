"""
Celery конфигурация для проекта.
"""

import os
from celery import Celery

# Устанавливаем переменную окружения для Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Создаем приложение Celery
app = Celery('dataset_ai')

# Загружаем настройки из Django settings
app.config_from_object('django.conf:settings', namespace='CELERY')

# Автообнаружение задач в приложениях Django
app.autodiscover_tasks()


@app.task(bind=True)
def debug_task(self):
    """Тестовая задача для проверки Celery."""
    print(f'Request: {self.request!r}')
