"""
Модель пользователя для проекта "Сервис по сбору Dataset для ИИ".

Использует bcrypt для хеширования паролей.
Для разработки используется 4 раунда (быстро), для production - 12+.
Добавлено детальное логирование для отладки блокировок.
"""

from __future__ import annotations

import logging
import time
import bcrypt
from datetime import datetime

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from mongoengine import BooleanField, DateTimeField, Document, DecimalField, EmailField, FloatField, StringField


logger = logging.getLogger(__name__)


class User(Document):
    """
    Кастомный пользователь (MongoEngine).
    Пароль хранится только в виде хеша.

    Роли:
    - customer: заказчик (создает датасеты и задачи)
    - annotator: исполнитель (размечает данные)
    - admin: администратор (полный доступ)
    """

    ROLE_CUSTOMER = "customer"   # Заказчик
    ROLE_ANNOTATOR = "annotator"  # Исполнитель
    ROLE_ADMIN = "admin"

    ROLE_CHOICES = (
        (ROLE_CUSTOMER, "customer"),
        (ROLE_ANNOTATOR, "annotator"),
        (ROLE_ADMIN, "admin"),
    )

    # Поля пользователя
    email = EmailField(required=True, unique=True)
    username = StringField(required=True, unique=True, max_length=150)
    role = StringField(required=True, choices=[c[0] for c in ROLE_CHOICES], default=ROLE_CUSTOMER)

    password_hash = StringField(required=True)
    is_active = BooleanField(default=True)

    # Рейтинг исполнителя (обновляется после QC-арбитража/метрик).
    rating = FloatField(default=0.0)
    # Баланс пользователя для выплат/расчетов (обновляется атомарными $inc в finance).
    balance = DecimalField(default=0, precision=20, rounding=None)

    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    # Индексы для ускорения поиска и уникальности
    meta = {
        "collection": "users",
        "strict": False,
        "indexes": [
            # ✅ Только уникальные индексы (они же работают как обычные для поиска)
            {"fields": ["email"], "unique": True},
            {"fields": ["username"], "unique": True},
            # ✅ Составной индекс для фильтрации
            {"fields": ["role", "is_active"]},
        ]
    }

    @property
    def is_authenticated(self):
        """
        Возвращает True для аутентифицированных пользователей.
        Требуется для DRF authentication.
        """
        return True

    @property
    def is_anonymous(self):
        """
        Возвращает False для реальных пользователей.
        Требуется для DRF authentication.
        """
        return False

    def save(self, *args, **kwargs):
        """Сохранение пользователя с обновлением timestamp и логированием."""
        start_time = time.time()
        logger.info(f"Начало сохранения пользователя: {self.email}")

        self.updated_at = datetime.utcnow()
        result = super().save(*args, **kwargs)

        elapsed = round(time.time() - start_time, 3)
        logger.info(f"Пользователь сохранен успешно: {self.id} (время: {elapsed} сек)")
        return result

    def set_password(self, raw_password: str) -> None:
        """
        Хеширование пароля с использованием bcrypt.
        Для разработки: rounds=4 (быстро ~100ms), для production: rounds=12 (~300ms)

        Логирование добавлено для отладки блокировок.
        """
        start_time = time.time()
        logger.info(f"Начало хеширования пароля для: {self.email}")

        # Получаем количество раундов из настроек
        rounds = getattr(settings, 'BCRYPT_ROUNDS', 4)
        logger.info(f"BCRYPT_ROUNDS={rounds}")

        # Генерация соли и хеширование
        start_salt = time.time()
        salt = bcrypt.gensalt(rounds=rounds)
        logger.info(f"Соль сгенерирована за {round(time.time() - start_salt, 3)} сек")

        start_hash = time.time()
        self.password_hash = bcrypt.hashpw(
            raw_password.encode('utf-8'),
            salt
        ).decode('utf-8')
        logger.info(f"Пароль захеширован за {round(time.time() - start_hash, 3)} сек")

        total_time = round(time.time() - start_time, 3)
        logger.info(f"Хеширование завершено за {total_time} сек (rounds={rounds})")

    def check_password(self, raw_password: str) -> bool:
        """
        Проверка пароля через bcrypt (соответствует set_password).
        Логирование добавлено для отладки блокировок.
        """
        start_time = time.time()
        logger.info(f"Начало проверки пароля для: {self.email}")

        # ✅ Используем bcrypt.checkpw для соответствия с set_password
        try:
            start_verify = time.time()
            result = bcrypt.checkpw(
                raw_password.encode('utf-8'),
                self.password_hash.encode('utf-8')
            )
            logger.info(f"Проверка пароля выполнена за {round(time.time() - start_verify, 3)} сек: {result}")

            total_time = round(time.time() - start_time, 3)
            logger.info(f"Проверка пароля завершена за {total_time} сек")
            return result

        except Exception as e:
            logger.error(f"Ошибка при проверке пароля: {e}", exc_info=True)
            return False
