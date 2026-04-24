FROM python:3.11-slim

WORKDIR /app

# Копирование requirements
COPY requirements.txt .

# Установка Python зависимостей
RUN pip install --upgrade pip && pip install -r requirements.txt

# Копирование исходного кода
COPY . .

# Копируем entrypoint скрипт
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Создание директории для логов
RUN mkdir -p logs

# Порт backend
EXPOSE 8000

# Команда по умолчанию
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
