FROM node:18-alpine

WORKDIR /app

# Копирование package файлов
COPY package*.json ./

# Установка зависимостей
RUN npm install

# Копирование исходного кода
COPY . .

# Порт frontend
EXPOSE 5173

# Команда по умолчанию
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
