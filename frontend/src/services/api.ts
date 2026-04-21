import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, isAxiosError } from "axios";
import { ApiErrorResponse, ApiListResponse, AuthResponse, Dataset, LoginRequest, RegisterRequest, Task, AnnotateRequest, Annotation, QualityMetricsItem, PaymentRequestBody, Transaction, QualityReviewRequest, TransferRequest, User } from "../types";

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
    // ignore
  }
}

export function clearTokens() {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

function normalizeApiBaseUrl(): string {
  return "";
}

const apiBaseUrl = normalizeApiBaseUrl();

export const api: AxiosInstance = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000,
});

const refreshClient: AxiosInstance = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000,
});

type RetriableConfig = AxiosRequestConfig & { _retry?: boolean };

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
  console.log('🔵 Axios Request:', config.method?.toUpperCase(), config.url);
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
    if (!isAxiosError(error)) return Promise.reject(error);
    const { response, config } = error;
    if (!response || !config) return Promise.reject(error);
    const status = response.status;
    const retriableConfig = config as RetriableConfig;
    if (status === 401 && !retriableConfig._retry) {
      retriableConfig._retry = true;
      const nextAccess = await refreshAccessToken();
      if (nextAccess) {
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

// ------------------ Auth API ------------------
export const authAPI = {
  async login(body: LoginRequest): Promise<AuthResponse> {
    const res = await api.post<AuthResponse>("/api/auth/login/", body);
    return res.data;
  },
  async register(body: RegisterRequest): Promise<AuthResponse> {
    const res = await api.post<AuthResponse>("/api/auth/register/", body);
    return res.data;
  },
  async me(): Promise<User> {
    const res = await api.get<User>("/api/users/me/");
    return res.data;
  },
};

// ------------------ Datasets API ------------------
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

// ------------------ Tasks API ------------------
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

// ------------------ Quality API ------------------
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

// ------------------ Finance API ------------------
export const financeAPI = {
  async transactions(params?: { limit?: number; offset?: number; status?: string }): Promise<ApiListResponse<Transaction>> {
    const res = await api.get<ApiListResponse<Transaction>>("/api/finance/transactions/", { params });
    return res.data;
  },
  
  async pay(body: PaymentRequestBody): Promise<Record<string, unknown>> {
    const res = await api.post<Record<string, unknown>>("/api/finance/payments/pay/", body);
    return res.data;
  },
  
  async withdraw(body: PaymentRequestBody): Promise<Record<string, unknown>> {
    const res = await api.post<Record<string, unknown>>("/api/finance/payments/withdraw/", body);
    return res.data;
  },
  
  async transfer(body: TransferRequest): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
      amount: body.amount,
      currency: body.currency || "USD",
      description: body.description || "",
    };
    
    if (body.to_username) {
      payload.to_username = body.to_username;
    } else if (body.to_email) {
      payload.to_email = body.to_email;
    } else if (body.to_user_id) {
      payload.to_user_id = body.to_user_id;
    }
    
    const res = await api.post<Record<string, unknown>>("/api/finance/payments/transfer/", payload);
    return res.data;
  },
};

// ------------------ Annotator API (восстановлено) ------------------
export const annotatorAPI = {
  async queue(): Promise<ApiListResponse<any>> {
    const res = await api.get<ApiListResponse<any>>("/api/tasks/", { 
      params: { status: "in_progress", limit: 50 } 
    });
    return res.data;
  },
  async detail(assignmentId: string): Promise<any> {
    const res = await api.get<any>(`/api/tasks/${assignmentId}/`);
    return res.data;
  },
  async submit(assignmentId: string, body: any): Promise<any> {
    const res = await api.patch<any>(`/api/tasks/${assignmentId}/annotate/`, body);
    return res.data;
  },
};

// ------------------ Reviewer API (восстановлено) ------------------
export const reviewerAPI = {
  async queue(): Promise<ApiListResponse<any>> {
    const res = await api.get<ApiListResponse<any>>("/api/quality/review/");
    return res.data;
  },
  async detail(reviewId: string): Promise<any> {
    const res = await api.get<any>(`/api/quality/review/${reviewId}/`);
    return res.data;
  },
  async resolve(reviewId: string, body: { resolution: any; comment?: string }): Promise<any> {
    const res = await api.post<any>(`/api/quality/review/${reviewId}/resolve/`, body);
    return res.data;
  },
};

// ------------------ Participants API (восстановлено) ------------------
export const participantsAPI = {
  async list(role?: "annotator" | "reviewer"): Promise<ApiListResponse<any>> {
    const res = await api.get<ApiListResponse<any>>("/api/users/participants/", { 
      params: role ? { role } : undefined 
    });
    return res.data;
  },
};

// ------------------ Projects API (восстановлено) ------------------
export const projectsAPI = {
  async create(body: any): Promise<any> {
    const res = await api.post<any>("/api/projects/", body);
    return res.data;
  },
  async list(params?: { limit?: number; offset?: number }): Promise<ApiListResponse<any>> {
    const res = await api.get<ApiListResponse<any>>("/api/projects/", { params });
    return res.data;
  },
  async get(id: string): Promise<any> {
    const res = await api.get<any>(`/api/projects/${id}/`);
    return res.data;
  },
  async update(id: string, body: any): Promise<any> {
    const res = await api.patch<any>(`/api/projects/${id}/`, body);
    return res.data;
  },
  async delete(id: string): Promise<void> {
    await api.delete(`/api/projects/${id}/`);
  },
};

// ------------------ Workflow API (восстановлено) ------------------
export const workflowAPI = {
  async upload(projectId: string, file: File, importId?: string | null): Promise<any> {
    const formData = new FormData();
    formData.append("file", file);
    if (importId) formData.append("import_id", importId);
    const res = await api.post<any>(`/api/projects/${projectId}/imports/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },
  async finalize(projectId: string, importId: string): Promise<any> {
    const res = await api.post<any>(`/api/projects/${projectId}/imports/${importId}/finalize/`, {});
    return res.data;
  },
  async overview(projectId: string): Promise<any> {
    const res = await api.get<any>(`/api/projects/${projectId}/overview/`);
    return res.data;
  },
  async export(projectId: string): Promise<any> {
    const res = await api.get<any>(`/api/projects/${projectId}/export/`);
    return res.data;
  },
};

export function throwApiError(err: unknown): never {
  throw new Error(extractDetail(err));
}
