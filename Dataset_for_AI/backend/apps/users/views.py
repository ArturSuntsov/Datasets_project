from __future__ import annotations

from typing import Any, Dict

import jwt
from bson import ObjectId
from django.http import HttpRequest
from mongoengine import DoesNotExist
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import User
from .serializers import LoginSerializer, RegisterSerializer, create_access_token, decode_access_token


class RegisterView(APIView):
    """
    Регистрация + выдача JWT.
    POST body:
      { "email": "...", "username": "...", "password": "...", "role": "customer|annotator|admin" }
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user: User = serializer.save()
        token = create_access_token(user)
        return Response(
            {
                "access": token,
                "user": {"id": str(user.id), "email": user.email, "username": user.username, "role": user.role},
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    """
    Логин по email или username + выдача JWT.
    POST body:
      { "identifier": "...(email|username)", "password": "..." }
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user: User = serializer.validated_data["user"]
        token = create_access_token(user)
        return Response(
            {
                "access": token,
                "user": {"id": str(user.id), "email": user.email, "username": user.username, "role": user.role},
            },
            status=status.HTTP_200_OK,
        )


def authenticate_from_jwt(request: HttpRequest) -> User:
    """
    MVP-auth для dataset API:
    - читает Authorization: Bearer <token>
    - проверяет подпись и exp
    - возвращает пользователя из MongoDB
    """

    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise PermissionError("Authorization header missing.")

    token = header[len("Bearer ") :].strip()
    try:
        payload = decode_access_token(token)
    except jwt.PyJWTError:
        raise PermissionError("Invalid token.")

    sub = payload.get("sub")
    if not sub:
        raise PermissionError("Invalid token payload.")

    try:
        user = User.objects(id=ObjectId(sub)).first()
    except Exception:
        user = None

    if not user or not user.is_active:
        raise PermissionError("User not found or inactive.")

    return user

