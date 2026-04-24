"""
JWT Authentication backend для Django REST Framework.

Позволяет аутентифицировать пользователей через JWT токен в заголовке Authorization.
"""

from __future__ import annotations

import jwt
from bson import ObjectId
from django.conf import settings
from rest_framework import authentication, exceptions

from apps.users.models import User
from apps.users.serializers import get_jwt_secret, get_jwt_algorithm


class JWTAuthentication(authentication.BaseAuthentication):
    """
    JWT Authentication backend для DRF.
    
    Извлекает JWT токен из заголовка Authorization:
    Authorization: Bearer <token>
    
    Возвращает объект User если токен валиден.
    """
    
    def authenticate(self, request):
        """
        Аутентифицировать запрос по JWT токену.
        """
        # Извлекаем токен из заголовка
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        
        if not auth_header:
            return None  # Нет заголовка - не аутентифицировано
        
        if not auth_header.startswith('Bearer '):
            raise exceptions.AuthenticationFailed('Invalid authorization header format. Use: Bearer <token>')
        
        token = auth_header[7:].strip()  # Убираем "Bearer "
        
        if not token:
            raise exceptions.AuthenticationFailed('Empty token.')
        
        # Декодируем токен
        try:
            payload = jwt.decode(
                token,
                get_jwt_secret(),
                algorithms=[get_jwt_algorithm()]
            )
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed('Token has expired.')
        except jwt.InvalidTokenError as e:
            raise exceptions.AuthenticationFailed(f'Invalid token: {str(e)}')
        
        # Извлекаем user ID из payload
        user_id = payload.get('sub')
        if not user_id:
            raise exceptions.AuthenticationFailed('Invalid token payload.')
        
        # Находим пользователя в MongoDB
        try:
            user = User.objects(id=ObjectId(user_id)).first()
        except Exception as e:
            raise exceptions.AuthenticationFailed(f'Error loading user: {str(e)}')
        
        if not user or not user.is_active:
            raise exceptions.AuthenticationFailed('User not found or inactive.')
        
        return (user, None)
    
    def authenticate_header(self, request):
        """
        Возвращает значение для WWW-Authenticate заголовка.
        """
        return 'Bearer'
