import axios from "axios";
import { getAccessToken, clearTokens } from "../services/api";

const api = axios.create({
  baseURL: "",  // Используем Vite прокси (запросы идут на тот же порт, что и фронтенд)
  timeout: 10000,  // 10 секунд таймаут
});

// Добавляем JWT токен к каждому запросу
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Обработка ответов (401 = редирект на login)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Токен истек или невалиден - очищаем и редиректим
      clearTokens();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export async function getNextTask(projectId: string) {
  // Используем правильный эндпоинт через прокси
  const response = await api.get(`/api/cv/tasks/next/?project_id=${projectId}`);
  return response.data;
}

export async function submitAnnotation(taskId: string, boxes: any[]) {
  // Используем правильный эндпоинт через прокси
  const response = await api.post(`/api/cv/tasks/${taskId}/annotate/`, {
    boxes,
  });

  return response.data;
}