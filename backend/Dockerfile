FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .

# Устанавливаем ffmpeg для извлечения кадров из видео
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Используем зеркало Alibaba Cloud (Китай) - обычно не блокируется
RUN pip install --upgrade pip \
    -i https://mirrors.aliyun.com/pypi/simple/ \
    --trusted-host mirrors.aliyun.com && \
    pip install -r requirements.txt \
    -i https://mirrors.aliyun.com/pypi/simple/ \
    --trusted-host mirrors.aliyun.com \
    --default-timeout=120

COPY . .

RUN mkdir -p logs

EXPOSE 8000

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
