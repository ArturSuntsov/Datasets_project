"""
Представления для аутентификации пользователей.

Регистрация и вход с выдачей JWT токена.
Все действия логируются с детальным логированием для отладки ошибок.
"""

from __future__ import annotations

import logging
import time
import traceback
from typing import Any, Dict

import bcrypt
import jwt
from bson import ObjectId
from django.conf import settings
from django.http import HttpRequest
from mongoengine import Q
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import User
from .serializers import LoginSerializer, RegisterSerializer, create_access_token, decode_access_token


logger = logging.getLogger(__name__)


# =============================================================================
# ЭНДПОИНТ ME (защищённый)
# =============================================================================
@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def me_view(request):
    """
    Получить текущего пользователя.
    GET /api/users/me/

    Возвращает данные пользователя из JWT токена.
    """
    logger.info("=" * 60)
    logger.info("ME_VIEW: Запрос данных пользователя")
    logger.info(f"Headers: {dict(request.headers)}")

    try:
        user = authenticate_from_jwt(request)
        logger.info(f"me_view: пользователь {user.email} запросил свои данные")

        result = {
            'id': str(user.id),
            'email': user.email,
            'username': user.username,
            'role': user.role,
            'specialization': user.specialization,
            'group_name': user.group_name,
            'experience_level': user.experience_level,
            'is_active': user.is_active,
            'rating': user.rating,
            'balance': str(user.balance) if user.balance else '0',
            'created_at': user.created_at.isoformat() if user.created_at else None,
        }
        logger.info(f"me_view: возвращаем данные: {result}")
        return Response(result)

    except PermissionError as e:
        logger.warning(f"me_view: ошибка аутентификации: {e}")
        return Response({'error': str(e)}, status=status.HTTP_401_UNAUTHORIZED)
    except Exception as e:
        logger.error(f"me_view: ошибка: {type(e).__name__}: {e}", exc_info=True)
        logger.error(traceback.format_exc())
        return Response({'error': f'{type(e).__name__}: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# =============================================================================
# РЕГИСТРАЦИЯ - МИНИМАЛЬНАЯ ВЕРСИЯ ДЛЯ ОТЛАДКИ
# =============================================================================
@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def register(request):
    """
    Регистрация нового пользователя - МИНИМАЛЬНАЯ ВЕРСИЯ для отладки.
    
    POST /api/auth/register/
    Body: {
        "email": "user@example.com",
        "username": "username",
        "password": "password123"
    }
    """
    logger.info("=" * 60)
    logger.info("=== REGISTER_VIEW: НАЧАЛО ===")
    
    try:
        # ========== ОТЛАДКА: что пришло в запросе ==========
        logger.info(f"Request method: {request.method}")
        logger.info(f"Request path: {request.path}")
        logger.info(f"Headers: {dict(request.headers)}")
        logger.info(f"Content-Type: {request.content_type}")
        logger.info(f"Data type: {type(request.data)}")
        logger.info(f"Data: {request.data}")
        
        # ========== Получаем данные ==========
        data = request.data
        if not isinstance(data, dict):
            logger.error(f"ERROR: request.data не dict, а {type(request.data)}")
            return Response({'error': 'Invalid data format'}, status=status.HTTP_400_BAD_REQUEST)
        
        email = str(data.get('email', '')).strip().lower()
        username = str(data.get('username', '')).strip()
        password = str(data.get('password', ''))
        role = str(data.get('role', 'customer')).strip()
        
        logger.info(f"Извлечено: email={email}, username={username}, role={role}")
        
        # ========== Простая валидация ==========
        if not email or '@' not in email:
            logger.warning(f"Invalid email: '{email}'")
            return Response({'error': 'Invalid email format'}, status=status.HTTP_400_BAD_REQUEST)
        
        if not username or len(username) < 3:
            logger.warning(f"Invalid username: '{username}' (too short)")
            return Response({'error': 'Username must be at least 3 characters'}, status=status.HTTP_400_BAD_REQUEST)
        
        if not password or len(password) < 4:
            logger.warning(f"Password too short: {len(password)} chars")
            return Response({'error': 'Password must be at least 4 characters'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Проверка role
        if role not in ['customer', 'annotator', 'reviewer', 'admin']:
            logger.warning(f"Invalid role: '{role}', using 'customer'")
            role = 'customer'
        
        # ========== Проверка дубликата ==========
        logger.info(f"Проверка существования пользователя с email={email}...")
        existing = User.objects(email=email).first()
        if existing:
            logger.warning(f"Email уже существует: {email}")
            return Response({'error': 'Email already registered'}, status=status.HTTP_400_BAD_REQUEST)
        logger.info("Email уникален ✓")
        
        # ========== Создание пользователя ==========
        logger.info("Создание объекта User...")
        user = User(
            email=email,
            username=username,
            role=role,
            is_active=True
        )
        
        # ========== Хеширование пароля ==========
        logger.info("Хеширование пароля (bcrypt rounds=4)...")
        try:
            salt = bcrypt.gensalt(rounds=4)
            logger.info(f"Соль сгенерирована: {salt[:20]}...")
            
            password_bytes = password.encode('utf-8')
            hashed = bcrypt.hashpw(password_bytes, salt)
            user.password_hash = hashed.decode('utf-8')
            logger.info("Пароль захеширован ✓")
        except Exception as e:
            logger.error(f"ERROR при хешировании: {type(e).__name__}: {e}", exc_info=True)
            return Response({'error': f'Password hashing error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # ========== Сохранение в MongoDB ==========
        logger.info(f"Сохранение в MongoDB...")
        try:
            user.save()
            logger.info(f"✓ ПОЛЬЗОВАТЕЛЬ СОЗДАН: id={user.id}, email={user.email}")
        except Exception as e:
            logger.error(f"ERROR при сохранении: {type(e).__name__}: {e}", exc_info=True)
            logger.error(traceback.format_exc())
            return Response({'error': f'MongoDB save error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # ========== Генерация JWT токена ==========
        logger.info("Генерация JWT токена...")
        try:
            token = create_access_token(user)
            logger.info(f"JWT токен сгенерирован (длина: {len(token)})")
        except Exception as e:
            logger.error(f"ERROR при генерации токена: {type(e).__name__}: {e}", exc_info=True)
            token = None
        
        # ========== Формируем ответ ==========
        result = {
            'ok': True,
            'user_id': str(user.id),
            'email': user.email,
            'username': user.username,
            'role': user.role,
            'access': token,
            'message': 'User registered successfully',
            # ✅ Добавляем поле user для совместимости с фронтендом
            'user': {
                'id': str(user.id),
                'email': user.email,
                'username': user.username,
                'role': user.role,
            }
        }
        
        logger.info("=" * 60)
        logger.info("=== REGISTER_VIEW: УСПЕХ ===")
        logger.info(f"Response: {result}")
        logger.info("=" * 60)
        
        return Response(result, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        # ========== КРИТИЧЕСКАЯ ОШИБКА: логируем всё ==========
        error_type = type(e).__name__
        error_msg = str(e)
        
        logger.error("=" * 60)
        logger.error(f"=== REGISTER_VIEW: КРИТИЧЕСКАЯ ОШИБКА ===")
        logger.error(f"ERROR: {error_type}: {error_msg}", exc_info=True)
        logger.error(f"Full traceback:\n{traceback.format_exc()}")
        logger.error("=" * 60)
        
        return Response(
            {'error': f'{error_type}: {error_msg}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# =============================================================================
# ЛОГИН - ФУНКЦИЯ (публичный эндпоинт)
# =============================================================================
@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def login(request):
    """
    Вход по email или username + выдача JWT токена.
    
    POST /api/auth/login/
    Body: {
        "identifier": "user@example.com" или username,
        "password": "password"
    }
    """
    logger.info("=" * 60)
    logger.info("=== LOGIN_VIEW: НАЧАЛО ===")
    
    try:
        # Отладка
        logger.info(f"Request data: {request.data}")
        
        data = request.data
        if not isinstance(data, dict):
            return Response({'error': 'Invalid data format'}, status=status.HTTP_400_BAD_REQUEST)
        
        identifier = str(data.get('identifier', '')).strip()
        password = str(data.get('password', ''))
        
        logger.info(f"Identifier: {identifier}")
        
        # Валидация
        if not identifier or not password:
            return Response({'error': 'Identifier and password required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Поиск пользователя по email или username
        query_lower = identifier.lower()
        user = User.objects(
            (Q(email=query_lower) | Q(username=identifier)) & Q(is_active=True)
        ).first()
        
        if not user:
            logger.warning("Пользователь не найден")
            return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)
        
        logger.info(f"Пользователь найден: {user.id}")
        
        # Проверка пароля
        if not user.check_password(password):
            logger.warning("Неверный пароль")
            return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)
        
        logger.info("Пароль верный ✓")
        
        # Генерация токена
        token = create_access_token(user)
        logger.info(f"JWT токен сгенерирован")
        
        result = {
            'ok': True,
            'access': token,
            'user': {
                'id': str(user.id),
                'email': user.email,
                'username': user.username,
                'role': user.role,
            }
        }
        
        logger.info("=== LOGIN_VIEW: УСПЕХ ===")
        return Response(result, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"LOGIN ERROR: {type(e).__name__}: {e}", exc_info=True)
        logger.error(traceback.format_exc())
        return Response({'error': f'{type(e).__name__}: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# =============================================================================
# АУТЕНТИФИКАЦИЯ ПО JWT ТОКЕНУ
# =============================================================================
def authenticate_from_jwt(request: HttpRequest) -> User:
    """
    Аутентификация по JWT токену.
    """
    start_time = time.time()
    logger.info("Аутентификация по JWT токену...")

    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        logger.warning("Authorization header отсутствует или некорректен")
        raise PermissionError("Authorization header missing.")

    token = header[len("Bearer "):].strip()
    logger.info(f"Токен получен (длина: {len(token)})")

    try:
        payload = decode_access_token(token)
        logger.info("Токен декодирован успешно")
    except jwt.PyJWTError as e:
        logger.error(f"Невалидный токен: {e}")
        raise PermissionError("Invalid token.")

    sub = payload.get("sub")
    if not sub:
        logger.error("Отсутствует 'sub' в токене")
        raise PermissionError("Invalid token payload.")

    try:
        user = User.objects(id=ObjectId(sub)).first()
        logger.info(f"Пользователь найден по токену: {user.email if user else 'None'}")
    except Exception as e:
        logger.error(f"Ошибка поиска пользователя: {e}")
        user = None

    if not user or not user.is_active:
        logger.warning("Пользователь не найден или не активен")
        raise PermissionError("User not found or inactive.")

    elapsed = round(time.time() - start_time, 3)
    logger.info(f"Аутентификация успешна за {elapsed} сек: {user.email}")
    return user


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def participants_view(request):
    """List annotators/reviewers for project setup."""
    try:
        user = authenticate_from_jwt(request)
    except PermissionError as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_401_UNAUTHORIZED)

    if user.role not in [User.ROLE_CUSTOMER, User.ROLE_ADMIN]:
        return Response({'detail': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)

    role = request.query_params.get('role')
    query = {'is_active': True}
    if role in [User.ROLE_ANNOTATOR, User.ROLE_REVIEWER]:
        query['role'] = role
    users = User.objects(**query).order_by('username')
    return Response({
        'items': [
            {
                'id': str(candidate.id),
                'email': candidate.email,
                'username': candidate.username,
                'role': candidate.role,
                'rating': candidate.rating,
                'specialization': candidate.specialization,
                'group_name': candidate.group_name,
            }
            for candidate in users
        ]
    })
