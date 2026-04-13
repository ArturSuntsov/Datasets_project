"""
Тесты для модуля авторизации (apps/users).

Проверяет:
- Регистрацию нового пользователя
- Вход по email/username
- JWT токен валидацию
- Выход из системы
- Обработку ошибок (неверный пароль, несуществующий пользователь)

Бизнес-логика:
- Пользователь может зарегистрироваться с уникальным email
- Пароль хранится только в хешированном виде
- JWT токен содержит sub (user id), role, exp
- Токен действителен 60 минут (настраивается)
"""

import pytest
from django.test import Client
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import User
from apps.users.serializers import create_access_token, decode_access_token, JWT_ACCESS_TTL_MINUTES


# =============================================================================
# Тесты регистрации пользователя
# =============================================================================

@pytest.mark.django_db
class TestUserRegistration:
    """Тесты регистрации новых пользователей."""
    
    def test_user_registration_success(self, client):
        """
        Тест успешной регистрации нового пользователя.
        
        Arrange: Создаем данные для регистрации
        Act: Отправляем POST запрос на /api/auth/register/
        Assert: Пользователь создан, JWT токен выдан
        """
        # Arrange
        registration_data = {
            "email": "newuser@example.com",
            "username": "newuser",
            "password": "securepassword123",
            "role": User.ROLE_CUSTOMER,
        }
        
        # Act
        response = client.post("/api/auth/register/", registration_data, format="json")
        
        # Assert
        assert response.status_code == status.HTTP_201_CREATED, f"Ошибка регистрации: {response.data}"
        assert "access" in response.data, "JWT access токен не выдан"
        assert "user" in response.data, "Данные пользователя не возвращены"
        
        # Проверяем что пользователь создан в БД
        user = User.objects(email="newuser@example.com").first()
        assert user is not None, "Пользователь не найден в БД"
        assert user.email == "newuser@example.com"
        assert user.username == "newuser"
        assert user.role == User.ROLE_CUSTOMER
        assert user.is_active is True
        
        # Проверяем что пароль захеширован
        assert user.password_hash is not None
        assert user.password_hash != "securepassword123"  # Не в plain text
        assert user.check_password("securepassword123")  # Но проверка работает
        
        # Проверяем JWT токен
        token_data = decode_access_token(response.data["access"])
        assert token_data["sub"] == str(user.id)
        assert token_data["role"] == user.role
    
    def test_user_registration_annotator_role(self, client):
        """Тест регистрации с ролью annotator."""
        registration_data = {
            "email": "annotator@example.com",
            "username": "annotator_user",
            "password": "password123",
            "role": User.ROLE_ANNOTATOR,
        }
        
        response = client.post("/api/auth/register/", registration_data, format="json")
        
        assert response.status_code == status.HTTP_201_CREATED
        user = User.objects(email="annotator@example.com").first()
        assert user.role == User.ROLE_ANNOTATOR
    
    def test_user_registration_admin_role(self, client):
        """Тест регистрации с ролью admin."""
        registration_data = {
            "email": "admin@example.com",
            "username": "admin_user",
            "password": "admin123",
            "role": User.ROLE_ADMIN,
        }
        
        response = client.post("/api/auth/register/", registration_data, format="json")
        
        assert response.status_code == status.HTTP_201_CREATED
        user = User.objects(email="admin@example.com").first()
        assert user.role == User.ROLE_ADMIN
    
    def test_user_registration_default_role(self, client):
        """Тест регистрации без указания роли (по умолчанию customer)."""
        registration_data = {
            "email": "default@example.com",
            "username": "default_user",
            "password": "password123",
        }
        
        response = client.post("/api/auth/register/", registration_data, format="json")
        
        assert response.status_code == status.HTTP_201_CREATED
        user = User.objects(email="default@example.com").first()
        assert user.role == User.ROLE_CUSTOMER
    
    def test_user_registration_duplicate_email(self, client, user_customer):
        """
        Тест регистрации с уже существующим email.
        
        Бизнес-правило: email должен быть уникальным
        """
        # Arrange - email уже существует
        registration_data = {
            "email": "customer@example.com",  # Уже есть в БД
            "username": "another_user",
            "password": "password123",
        }
        
        # Act
        response = client.post("/api/auth/register/", registration_data, format="json")
        
        # Assert
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "email" in response.data or "detail" in response.data
    
    def test_user_registration_duplicate_username(self, client, user_customer):
        """Тест регистрации с уже существующим username."""
        registration_data = {
            "email": "another@example.com",
            "username": "customer_user",  # Уже есть в БД
            "password": "password123",
        }
        
        response = client.post("/api/auth/register/", registration_data, format="json")
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_user_registration_weak_password(self, client):
        """Тест регистрации со слабым паролем (менее 8 символов)."""
        registration_data = {
            "email": "weak@example.com",
            "username": "weak_user",
            "password": "123",  # Слишком короткий
        }
        
        response = client.post("/api/auth/register/", registration_data, format="json")
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "password" in response.data
    
    def test_user_registration_password_with_spaces(self, client):
        """Тест регистрации с паролем содержащим пробелы."""
        registration_data = {
            "email": "spaces@example.com",
            "username": "spaces_user",
            "password": "pass word",  # Пробел запрещен
        }
        
        response = client.post("/api/auth/register/", registration_data, format="json")
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_user_registration_invalid_email(self, client):
        """Тест регистрации с невалидным email."""
        registration_data = {
            "email": "invalid-email",  # Неверный формат
            "username": "invalid_user",
            "password": "password123",
        }
        
        response = client.post("/api/auth/register/", registration_data, format="json")
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "email" in response.data
    
    def test_user_registration_empty_fields(self, client):
        """Тест регистрации с пустыми обязательными полями."""
        registration_data = {
            "email": "",
            "username": "",
            "password": "",
        }
        
        response = client.post("/api/auth/register/", registration_data, format="json")
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# Тесты входа (login)
# =============================================================================

@pytest.mark.django_db
class TestUserLogin:
    """Тесты входа пользователей."""
    
    def test_login_with_email_success(self, client, user_customer):
        """
        Тест успешного входа по email.
        
        Arrange: Создаем пользователя через фикстуру
        Act: Отправляем POST запрос с email и паролем
        Assert: Получаем JWT токен
        """
        # Arrange
        login_data = {
            "identifier": "customer@example.com",
            "password": "password123",
        }
        
        # Act
        response = client.post("/api/auth/login/", login_data, format="json")
        
        # Assert
        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data
        assert "user" in response.data
        assert response.data["user"]["email"] == "customer@example.com"
        assert response.data["user"]["role"] == User.ROLE_CUSTOMER
    
    def test_login_with_username_success(self, client, user_customer):
        """Тест успешного входа по username."""
        login_data = {
            "identifier": "customer_user",  # Username вместо email
            "password": "password123",
        }
        
        response = client.post("/api/auth/login/", login_data, format="json")
        
        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data
    
    def test_login_annotator(self, client, user_annotator):
        """Тест входа для annotator."""
        login_data = {
            "identifier": "annotator@example.com",
            "password": "password123",
        }
        
        response = client.post("/api/auth/login/", login_data, format="json")
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["user"]["role"] == User.ROLE_ANNOTATOR
    
    def test_login_admin(self, client, user_admin):
        """Тест входа для admin."""
        login_data = {
            "identifier": "admin@example.com",
            "password": "admin123",
        }
        
        response = client.post("/api/auth/login/", login_data, format="json")
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data["user"]["role"] == User.ROLE_ADMIN
    
    def test_login_wrong_password(self, client, user_customer):
        """
        Тест входа с неверным паролем.
        
        Бизнес-правило: при неверном пароле возвращаем общую ошибку
        (не раскрываем что именно неверно)
        """
        login_data = {
            "identifier": "customer@example.com",
            "password": "wrongpassword",
        }
        
        response = client.post("/api/auth/login/", login_data, format="json")
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "access" not in response.data
    
    def test_login_nonexistent_user(self, client):
        """Тест входа с несуществующим пользователем."""
        login_data = {
            "identifier": "nonexistent@example.com",
            "password": "password123",
        }
        
        response = client.post("/api/auth/login/", login_data, format="json")
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_login_inactive_user(self, client, user_inactive):
        """
        Тест входа неактивного пользователя.
        
        Бизнес-правило: заблокированные пользователи не могут войти
        """
        login_data = {
            "identifier": "inactive@example.com",
            "password": "password123",
        }
        
        response = client.post("/api/auth/login/", login_data, format="json")
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_login_empty_credentials(self, client):
        """Тест входа с пустыми учетными данными."""
        login_data = {
            "identifier": "",
            "password": "",
        }
        
        response = client.post("/api/auth/login/", login_data, format="json")
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_login_case_insensitive_email(self, client, user_customer):
        """Тест что email регистронезависимый при входе."""
        login_data = {
            "identifier": "CUSTOMER@EXAMPLE.COM",  # Верхний регистр
            "password": "password123",
        }
        
        response = client.post("/api/auth/login/", login_data, format="json")
        
        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# Тесты JWT токенов
# =============================================================================

@pytest.mark.django_db
class TestJWTToken:
    """Тесты JWT токенов."""
    
    def test_jwt_token_structure(self, user_customer):
        """
        Тест структуры JWT токена.
        
        Токен должен содержать:
        - sub: ID пользователя
        - role: роль пользователя
        - iat: время выпуска
        - exp: время истечения
        """
        # Act
        token = create_access_token(user_customer)
        
        # Assert
        token_data = decode_access_token(token)
        
        assert "sub" in token_data
        assert token_data["sub"] == str(user_customer.id)
        assert "role" in token_data
        assert token_data["role"] == user_customer.role
        assert "iat" in token_data
        assert "exp" in token_data
        
        # Проверяем что exp > iat
        assert token_data["exp"] > token_data["iat"]
    
    def test_jwt_token_expiration(self, user_customer):
        """Тест времени жизни токена."""
        import time
        from datetime import datetime, timezone
        
        token = create_access_token(user_customer)
        token_data = decode_access_token(token)
        
        # Проверяем что время истечения примерно через JWT_ACCESS_TTL_MINUTES
        expected_ttl = JWT_ACCESS_TTL_MINUTES * 60  # В секундах
        actual_ttl = token_data["exp"] - token_data["iat"]
        
        # Допускаем погрешность в 5 секунд
        assert abs(actual_ttl - expected_ttl) < 5
    
    def test_jwt_token_invalid_signature(self):
        """Тест токена с неверной подписью."""
        import jwt
        
        # Создаем токен с неправильным секретом
        payload = {"sub": "123", "role": "customer"}
        invalid_token = jwt.encode(payload, "wrong-secret", algorithm="HS256")
        
        # Пытаемся декодировать - должно выбросить исключение
        with pytest.raises(jwt.InvalidSignatureError):
            decode_access_token(invalid_token)
    
    def test_jwt_token_expired(self):
        """Тест просроченного токена."""
        import jwt
        from datetime import datetime, timedelta, timezone
        
        # Создаем просроченный токен вручную
        payload = {
            "sub": "123",
            "role": "customer",
            "iat": int((datetime.now(timezone.utc) - timedelta(hours=2)).timestamp()),
            "exp": int((datetime.now(timezone.utc) - timedelta(hours=1)).timestamp()),
        }
        
        token = jwt.encode(payload, "dev-secret-key-change-in-production", algorithm="HS256")
        
        # Пытаемся декодировать - должно выбросить исключение
        with pytest.raises(jwt.ExpiredSignatureError):
            decode_access_token(token)
    
    def test_jwt_token_missing_claims(self):
        """Тест токена без обязательных claims."""
        import jwt
        
        # Токен без exp
        payload = {"sub": "123", "role": "customer"}
        token = jwt.encode(payload, "dev-secret-key-change-in-production", algorithm="HS256")
        
        with pytest.raises(jwt.MissingRequiredClaimError):
            decode_access_token(token)


# =============================================================================
# Тесты аутентификации в API
# =============================================================================

@pytest.mark.django_db
class TestAuthentication:
    """Тесты аутентификации в API эндпоинтах."""
    
    def test_authenticated_request_with_valid_token(self, client, jwt_token):
        """Тест запроса с валидным JWT токеном."""
        # Arrange
        headers = {"HTTP_AUTHORIZATION": f"Bearer {jwt_token}"}
        
        # Act - пробуем получить список датасетов
        response = client.get("/api/datasets/", **headers)
        
        # Assert - должен быть успешный ответ (200) или пустой список
        assert response.status_code in [status.HTTP_200_OK]
    
    def test_unauthenticated_request(self, client):
        """Тест запроса без токена."""
        # Act
        response = client.get("/api/datasets/")
        
        # Assert - должен быть отказ в доступе
        assert response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]
    
    def test_request_with_invalid_token(self, client):
        """Тест запроса с невалидным токеном."""
        headers = {"HTTP_AUTHORIZATION": "Bearer invalid_token_here"}
        
        response = client.get("/api/datasets/", **headers)
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
    
    def test_request_with_malformed_auth_header(self, client):
        """Тест запроса с неправильно сформированным заголовком."""
        # Отсутствует префикс "Bearer"
        headers = {"HTTP_AUTHORIZATION": "jwt_token_here"}
        
        response = client.get("/api/datasets/", **headers)
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
    
    def test_request_with_empty_auth_header(self, client):
        """Тест запроса с пустым заголовком авторизации."""
        headers = {"HTTP_AUTHORIZATION": ""}
        
        response = client.get("/api/datasets/", **headers)
        
        assert response.status_code == status.HTTP_403_FORBIDDEN


# =============================================================================
# Тесты безопасности
# =============================================================================

@pytest.mark.django_db
class TestSecurity:
    """Тесты безопасности авторизации."""
    
    def test_password_not_returned_in_response(self, client, user_customer):
        """Тест что пароль не возвращается в ответе."""
        login_data = {
            "identifier": "customer@example.com",
            "password": "password123",
        }
        
        response = client.post("/api/auth/login/", login_data, format="json")
        
        # Проверяем что в ответе нет поля password
        assert "password" not in str(response.data).lower()
    
    def test_password_hash_not_exposed(self, client, user_customer):
        """Тест что хеш пароля не возвращается."""
        login_data = {
            "identifier": "customer@example.com",
            "password": "password123",
        }
        
        response = client.post("/api/auth/login/", login_data, format="json")
        
        # Хеш не должен совпадать с тем что в БД
        user = User.objects(email="customer@example.com").first()
        assert user.password_hash not in str(response.data)
    
    def test_sql_injection_in_login(self, client):
        """Тест на SQL/NoSQL инъекцию в логине."""
        # Попытка инъекции через identifier
        login_data = {
            "identifier": "admin@example.com' || '1'='1",
            "password": "password123",
        }
        
        response = client.post("/api/auth/login/", login_data, format="json")
        
        # Должен быть отказ (не должно быть успешного входа)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_xss_in_registration(self, client):
        """Тест на XSS через поля регистрации."""
        registration_data = {
            "email": "xss@example.com",
            "username": "<script>alert('xss')</script>",
            "password": "password123",
        }
        
        response = client.post("/api/auth/register/", registration_data, format="json")
        
        # Валидация должна отработать корректно
        # (username с HTML тегами должен быть обработан)
        assert response.status_code in [status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST]
    
    def test_rate_limiting_registration(self, client):
        """
        Тест rate limiting для регистрации.
        
        Бизнес-правило: не более 5 регистраций в час
        """
        for i in range(6):
            registration_data = {
                "email": f"ratelimit{i}@example.com",
                "username": f"ratelimit_user{i}",
                "password": "password123",
            }
            response = client.post("/api/auth/register/", registration_data, format="json")
            
            # После 5 запросов должен быть rate limit
            if i >= 5:
                assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS, \
                    f"Rate limiting не сработал на запросе {i+1}"
    
    def test_rate_limiting_login(self, client, user_customer):
        """
        Тест rate limiting для входа.
        
        Бизнес-правило: не более 10 попыток входа в час
        """
        login_data = {
            "identifier": "customer@example.com",
            "password": "wrongpassword",  # Неверный пароль
        }
        
        for i in range(11):
            response = client.post("/api/auth/login/", login_data, format="json")
            
            # После 10 запросов должен быть rate limit
            if i >= 10:
                assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS, \
                    f"Rate limiting не сработал на запросе {i+1}"


# =============================================================================
# Тесты краевых случаев
# =============================================================================

@pytest.mark.django_db
class TestEdgeCases:
    """Тесты краевых случаев авторизации."""
    
    def test_registration_with_unicode_username(self, client):
        """Тест регистрации с юникод username."""
        registration_data = {
            "email": "unicode@example.com",
            "username": "Пользователь_Тест",
            "password": "password123",
        }
        
        response = client.post("/api/auth/register/", registration_data, format="json")
        
        # Должна быть успешная регистрация
        assert response.status_code == status.HTTP_201_CREATED
        
        user = User.objects(email="unicode@example.com").first()
        assert user.username == "Пользователь_Тест"
    
    def test_registration_email_case_insensitive(self, client, user_customer):
        """Тест что email приводится к нижнему регистру."""
        registration_data = {
            "email": "NEWUSER@EXAMPLE.COM",
            "username": "newuser",
            "password": "password123",
        }
        
        response = client.post("/api/auth/register/", registration_data, format="json")
        
        assert response.status_code == status.HTTP_201_CREATED
        
        # Проверяем что email сохранен в нижнем регистре
        user = User.objects(email="newuser@example.com").first()
        assert user is not None
    
    def test_login_with_whitespace_in_identifier(self, client, user_customer):
        """Тест входа с пробелами в identifier."""
        login_data = {
            "identifier": "  customer@example.com  ",  # Пробелы вокруг
            "password": "password123",
        }
        
        response = client.post("/api/auth/login/", login_data, format="json")
        
        # Должен быть успешный вход (пробелы обрезаются)
        assert response.status_code == status.HTTP_200_OK
    
    def test_multiple_sessions_same_user(self, client, user_customer):
        """Тест что пользователь может иметь несколько активных сессий."""
        login_data = {
            "identifier": "customer@example.com",
            "password": "password123",
        }
        
        # Входим несколько раз
        tokens = []
        for _ in range(3):
            response = client.post("/api/auth/login/", login_data, format="json")
            assert response.status_code == status.HTTP_200_OK
            tokens.append(response.data["access"])
        
        # Все токены должны быть валидными (но могут быть разными из-за iat)
        assert len(set(tokens)) == 3  # Все токены уникальны
