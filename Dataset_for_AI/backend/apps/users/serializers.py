from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import jwt
from django.core.exceptions import ValidationError as DjangoValidationError
from mongoengine import Q
from rest_framework import serializers

from .models import User


JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-change-me")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_ACCESS_TTL_MINUTES = int(os.getenv("JWT_ACCESS_TTL_MINUTES", "60"))


def create_access_token(user: User) -> str:
    """
    Генерирует JWT access-token.
    В production секрет должен быть только из env/секрет-хранилища.
    """

    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=JWT_ACCESS_TTL_MINUTES)

    payload: Dict[str, Any] = {
        "sub": str(user.id),
        "role": user.role,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    """
    Проверяет подпись и срок действия.
    При ошибке выбрасывает jwt exceptions (они обрабатываются в views).
    """

    return jwt.decode(
        token,
        JWT_SECRET_KEY,
        algorithms=[JWT_ALGORITHM],
        options={"require": ["exp", "sub"], "verify_exp": True},
    )


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=8)
    role = serializers.ChoiceField(choices=[c[0] for c in User.ROLE_CHOICES], default=User.ROLE_CUSTOMER)

    def validate_email(self, value: str) -> str:
        v = value.strip().lower()
        # Предотвращаем дубликаты (уникальный индекс в MongoDB).
        if User.objects(email=v).first():
            raise serializers.ValidationError("Пользователь с таким email уже существует.")
        return v

    def validate_username(self, value: str) -> str:
        v = value.strip()
        if User.objects(username=v).first():
            raise serializers.ValidationError("Пользователь с таким username уже существует.")
        return v

    def validate_password(self, value: str) -> str:
        # MVP: минимальные требования к паролю.
        if " " in value:
            raise serializers.ValidationError("Пароль не должен содержать пробелы.")
        return value

    def create(self, validated_data: Dict[str, Any]) -> User:
        # Критично: храним только hash, never plain password.
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        try:
            user.save()
        except Exception as e:
            # MongoEngine может бросать ошибки индексов/валидации.
            raise serializers.ValidationError({"detail": f"Ошибка создания пользователя: {str(e)}"})
        return user


class LoginSerializer(serializers.Serializer):
    # Разрешаем логиниться по email или username.
    identifier = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        identifier = attrs.get("identifier", "").strip()
        password = attrs.get("password", "")

        # Email — делаем lower-case для стабильного matching.
        query = Q(email=identifier.lower()) | Q(username=identifier)
        user = User.objects(query).first()
        if not user or not user.is_active:
            raise serializers.ValidationError("Неверный логин или пароль.")
        if not user.check_password(password):
            raise serializers.ValidationError("Неверный логин или пароль.")
        attrs["user"] = user
        return attrs

