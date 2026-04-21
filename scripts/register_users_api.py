#!/usr/bin/env python
"""
Скрипт для массовой регистрации пользователей через HTTP API.
Запуск: python scripts/register_users_api.py
"""
import requests
import json
import random
import string
import time

# Конфигурация
API_BASE_URL = "http://localhost:8001"
REGISTER_ENDPOINT = f"{API_BASE_URL}/api/auth/register/"

# Количество создаваемых пользователей
CUSTOMERS_COUNT = 0    # Только аннотаторы, без заказчиков
ANNOTATORS_COUNT = 5   # Создаем 5 аннотаторов


def generate_random_string(length=8):
    """Генерирует случайную строку для username/email."""
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))


def register_user(email, username, password, role):
    """Отправляет POST-запрос на регистрацию пользователя."""
    payload = {
        "email": email,
        "username": username,
        "password": password,
        "role": role
    }

    try:
        response = requests.post(
            REGISTER_ENDPOINT,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10
        )

        if response.status_code == 201:
            data = response.json()
            return {
                "success": True,
                "user_id": data.get("user_id"),
                "email": email,
                "username": username,
                "access_token": data.get("access")
            }
        else:
            return {
                "success": False,
                "email": email,
                "status_code": response.status_code,
                "error": response.text
            }
    except requests.exceptions.ConnectionError:
        return {
            "success": False,
            "email": email,
            "error": "❌ Не удалось подключиться к серверу. Убедитесь, что Docker запущен."
        }
    except Exception as e:
        return {
            "success": False,
            "email": email,
            "error": str(e)
        }


def main():
    print("=" * 60)
    print("🚀 АВТОМАТИЧЕСКАЯ РЕГИСТРАЦИЯ АННОТАТОРОВ ЧЕРЕЗ API")
    print("=" * 60)

    # Проверка доступности сервера
    print("\n🔍 Проверка доступности сервера...")
    try:
        health_check = requests.get(f"{API_BASE_URL}/api/health/", timeout=5)
        if health_check.status_code == 200:
            print(f"✅ Сервер доступен: {health_check.json().get('status', 'ok')}")
        else:
            print("⚠️ Сервер ответил с ошибкой, но продолжаем...")
    except:
        print("❌ Сервер недоступен! Запустите Docker: docker-compose up -d")
        return

    created_users = []
    failed_users = []

    # Создаем только аннотаторов
    print(f"\n✏️ Создание {ANNOTATORS_COUNT} аннотаторов (annotator)...")
    for i in range(ANNOTATORS_COUNT):
        suffix = generate_random_string(6)
        email = f"api_annotator_{suffix}@test.com"
        username = f"api_ann_{suffix}"
        password = "annotator123"

        print(f"  📝 Регистрация {email}...", end=" ")
        result = register_user(email, username, password, "annotator")

        if result["success"]:
            created_users.append(result)
            print(f"✅ (ID: {result['user_id'][:8]}...)")
        else:
            failed_users.append(result)
            print(f"❌ {result.get('error', 'Unknown error')}")

        time.sleep(0.5)

    # Итоговая статистика
    print("\n" + "=" * 60)
    print("📊 ИТОГИ РЕГИСТРАЦИИ")
    print("=" * 60)
    print(f"✅ Успешно создано: {len(created_users)} аннотаторов")
    print(f"❌ Ошибок: {len(failed_users)}")

    if created_users:
        print("\n💡 Учетные данные для входа (пароль: annotator123):")
        for i, user in enumerate(created_users[:5]):
            print(f"  {i+1}. Email: {user['email']}")


if __name__ == "__main__":
    main()
