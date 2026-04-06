import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, isAxiosError } from "axios";
import { 
  ApiErrorResponse, 
  ApiListResponse, 
  AuthResponse, 
  Dataset, 
  LoginRequest, 
  RegisterRequest, 
  Task,
  AnnotateRequest, 
  Annotation, 
  QualityMetricsItem, 
  PaymentRequestBody, 
  Transaction, 
  QualityReviewRequest, 
  User,
  UploadStatusResponse,
  DownloadResponse,
  UploadInitResponse,
  UploadStatus
} from "../types";

const ACCESS_TOKEN_KEY = "dataset_ai_access_token";
const REFRESH_TOKEN_KEY = "dataset_ai_refresh_token";

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setTokens(accessToken: string, refreshToken?: string | null) {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
  } catch {
    // В учебном MVP игнорируем ошибки storage.
  }
}

export function clearTokens() {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // noop
  }
}

function normalizeApiBaseUrl(): string {
  // В дев-режиме Vite проксирует /api -> backend, поэтому baseURL оставляем пустым.
  return "";
}

const apiBaseUrl = normalizeApiBaseUrl();

export const api: AxiosInstance = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000,
});

// Отдельный клиент для refresh (чтобы избежать рекурсивных перехватов).
const refreshClient: AxiosInstance = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000,
});

type RetriableConfig = AxiosRequestConfig & {
  _retry?: boolean;
};

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  const payload = refreshToken ? { refresh: refreshToken } : {};
  try {
    const res = await refreshClient.post<AuthResponse>("/api/auth/token/refresh/", payload, {
      headers: { "Content-Type": "application/json" },
    });
    const access = res.data.access;
    const nextRefresh = res.data.refresh;
    if (access) {
      setTokens(access, nextRefresh ?? refreshToken);
      return access;
    }
    return null;
  } catch {
    return null;
  }
}

api.interceptors.request.use((config) => {
  console.log('🔵 Axios Request:', config.method?.toUpperCase(), config.url, config.baseURL || '');
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    console.log('🟢 Axios Response:', response.config.method?.toUpperCase(), response.config.url, response.status);
    return response;
  },
  async (error: AxiosError<ApiErrorResponse>) => {
    console.log('🔴 Axios Error:', error.config?.method?.toUpperCase(), error.config?.url, error.response?.status);
    if (!isAxiosError(error)) {
      return Promise.reject(error);
    }
    const { response, config } = error;
    if (!response || !config) {
      return Promise.reject(error);
    }
    const status = response.status;
    const retriableConfig = config as RetriableConfig;
    if (status === 401 && !retriableConfig._retry) {
      retriableConfig._retry = true;
      const nextAccess = await refreshAccessToken();
      if (nextAccess) {
        // Повторяем исходный запрос с новым access-токеном.
        retriableConfig.headers = retriableConfig.headers ?? {};
        retriableConfig.headers.Authorization = `Bearer ${nextAccess}`;
        return api.request(retriableConfig);
      }
    }
    return Promise.reject(error);
  }
);

function extractDetail(err: unknown): string {
  if (isAxiosError(err)) {
    return err.response?.data?.detail ?? err.message;
  }
  return "Unknown error";
}

// ----------------------------------------------------------------------
// Auth API
// ----------------------------------------------------------------------

export const authAPI = {
  async login(body: LoginRequest): Promise<AuthResponse> {
    console.log('📤 authAPI.login():', { url: '/api/auth/login/', method: 'POST' });
    const res = await api.post<AuthResponse>("/api/auth/login/", body);
    console.log('✅ authAPI.login() ответ:', res.status);
    return res.data;
  },
  async register(body: RegisterRequest): Promise<AuthResponse> {
    console.log('📤 authAPI.register():', { url: '/api/auth/register/', method: 'POST', body: { email: body.email, username: body.username } });
    console.trace('📦 Stack trace вызова register():');
    const res = await api.post<AuthResponse>("/api/auth/register/", body);
    console.log('✅ authAPI.register() ответ:', res.status, { userId: res.data.user?.id });
    return res.data;
  },
  async me(): Promise<User> {
    console.log('📤 authAPI.me():', { url: '/api/users/me/', method: 'GET' });
    const res = await api.get<User>("/api/users/me/");
    console.log('✅ authAPI.me() ответ:', res.status);
    return res.data;
  },
};

// ----------------------------------------------------------------------
// Datasets API
// ----------------------------------------------------------------------

export const datasetsAPI = {
  async list(params?: { limit?: number; offset?: number; status?: string; search?: string }): Promise<ApiListResponse<Dataset>> {
    const res = await api.get<ApiListResponse<Dataset>>("/api/datasets/", { params });
    return res.data;
  },
  async create(body: FormData | Record<string, unknown>): Promise<Dataset> {
    if (body instanceof FormData) {
      const res = await api.post<Dataset>("/api/datasets/", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    }
    const res = await api.post<Dataset>("/api/datasets/", body);
    return res.data;
  },
  async detail(id: string): Promise<Dataset> {
    const res = await api.get<Dataset>(`/api/datasets/${id}/`);
    return res.data;
  },
  async update(id: string, body: Record<string, unknown>): Promise<Dataset> {
    const res = await api.patch<Dataset>(`/api/datasets/${id}/`, body);
    return res.data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/datasets/${id}/`);
  },
};

// ----------------------------------------------------------------------
// Tasks API
// ----------------------------------------------------------------------

export const tasksAPI = {
  async create(body: Record<string, unknown>): Promise<Task> {
    const res = await api.post<Task>("/api/tasks/", body);
    return res.data;
  },
  async list(params?: { limit?: number; offset?: number; status?: string }): Promise<ApiListResponse<Task>> {
    const res = await api.get<ApiListResponse<Task>>("/api/tasks/", { params });
    return res.data;
  },
  async update(id: string, body: Record<string, unknown>): Promise<Task> {
    const res = await api.patch<Task>(`/api/tasks/${id}/`, body);
    return res.data;
  },
  async annotate(id: string, body: AnnotateRequest): Promise<Annotation> {
    const res = await api.patch<Annotation>(`/api/tasks/${id}/annotate/`, body);
    return res.data;
  },
};

// ----------------------------------------------------------------------
// Quality API
// ----------------------------------------------------------------------

export const qualityAPI = {
  async createReview(body: QualityReviewRequest): Promise<Record<string, unknown>> {
    const res = await api.post<Record<string, unknown>>("/api/quality/review/", body);
    return res.data;
  },
  async metrics(datasetId: string, params?: { limit?: number; offset?: number }): Promise<{ dataset_id: string; items: QualityMetricsItem[]; limit?: number; offset?: number; total?: number }> {
    const res = await api.get<{ dataset_id: string; items: QualityMetricsItem[]; limit?: number; offset?: number; total?: number }>(
      `/api/quality/metrics/${datasetId}/`,
      { params }
    );
    return res.data;
  },
};

// ----------------------------------------------------------------------
// Finance API
// ----------------------------------------------------------------------

export const financeAPI = {
  async transactions(params?: { limit?: number; offset?: number; status?: string }): Promise<ApiListResponse<Transaction>> {
    const res = await api.get<ApiListResponse<Transaction>>("/api/finance/transactions/", { params });
    return res.data;
  },
  async pay(body: PaymentRequestBody): Promise<Record<string, unknown>> {
    const res = await api.post<Record<string, unknown>>("/api/finance/pay/", body);
    return res.data;
  },
  async withdraw(body: PaymentRequestBody): Promise<Record<string, unknown>> {
    const res = await api.post<Record<string, unknown>>("/api/finance/withdraw/", body);
    return res.data;
  },
};

// ----------------------------------------------------------------------
// Data Lake API (MinIO upload/download)
// ----------------------------------------------------------------------

export const dataLakeAPI = {
  /**
   * Инициирует загрузку файла для датасета
   */
  async uploadFile(datasetId: string, file: File): Promise<UploadInitResponse> {
    const formData = new FormData();
    formData.append('file', file);
    
    console.log(`📤 Uploading file to dataset ${datasetId}:`, file.name, `${(file.size / 1024 / 1024).toFixed(2)} MB`);
    
    const res = await api.post<UploadInitResponse>(
      `/api/datasets/${datasetId}/upload/`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    
    console.log('✅ Upload initiated:', res.data);
    return res.data;
  },

  /**
   * Получает статус загрузки датасета
   */
  async getUploadStatus(datasetId: string): Promise<UploadStatusResponse> {
    console.log(`📊 Checking upload status for dataset ${datasetId}`);
    const res = await api.get<UploadStatusResponse>(
      `/api/datasets/${datasetId}/upload-status/`
    );
    return res.data;
  },

  /**
   * Получает временную ссылку для скачивания датасета
   */
  async getDownloadUrl(datasetId: string): Promise<DownloadResponse> {
    console.log(`🔗 Getting download URL for dataset ${datasetId}`);
    const res = await api.get<DownloadResponse>(
      `/api/datasets/${datasetId}/download/`
    );
    return res.data;
  },

  /**
   * Скачивает файл датасета (автоматически запускает загрузку в браузере)
   */
  async downloadFile(datasetId: string, fileName?: string): Promise<void> {
    console.log(`⬇️ Downloading dataset ${datasetId}`);
    const { download_url, file_name } = await this.getDownloadUrl(datasetId);
    
    // Создаём временную ссылку и скачиваем
    const link = document.createElement('a');
    link.href = download_url;
    link.download = fileName || file_name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log('✅ Download started');
  },

  /**
   * Проверяет, загружен ли файл для датасета
   */
  async isFileUploaded(datasetId: string): Promise<boolean> {
    const status = await this.getUploadStatus(datasetId);
    return status.status === 'uploaded';
  },

  /**
   * Получает прогресс загрузки в процентах (0-100)
   */
  async getUploadProgress(datasetId: string): Promise<number> {
    const status = await this.getUploadStatus(datasetId);
    return status.progress || 0;
  },
};

export function throwApiError(err: unknown): never {
  throw new Error(extractDetail(err));
}
