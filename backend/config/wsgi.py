"""
WSGI конфигурация для Django проекта.

Используется для production деплоя с Gunicorn/uWSGI.
"""

import os
import sys

from django.core.wsgi import get_wsgi_application

# Добавляем backend в path для корректных импортов
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = get_wsgi_application()
