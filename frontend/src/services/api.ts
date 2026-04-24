import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, isAxiosError } from "axios";
import {
  AnnotateRequest,
  AnnotatorProjectDetail,
  AnnotatorProjectsResponse,
  Annotation,
  ApiErrorResponse,
  ApiListResponse,
  AssignmentDetail,
  AssignmentSubmitRequest,
  AssignmentSubmitResponse,
  AuthResponse,
  CreateProjectRequest,
  Dataset,
  LoginRequest,
  Participant,
  PaymentRequestBody,
  Project,
  ProjectExportPayload,
  ProjectFinalizeResponse,
  ProjectImportResponse,
  ProjectOverview,
  QualityMetricsItem,
  QualityReviewRequest,
  QueueItem,
  RegisterRequest,
  ReviewDetail,
  ReviewQueueItem,
  ReviewResolveRequest,
  ReviewResolveResponse,
  SecurityEventItem,
  Task,
  Transaction,
  TransferRequest,
  User,
  ValidationBatchDetail,
  ValidationBatchResolveRequest,
  ValidationBatchResolveResponse,
  ValidationQueueItem,
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
    // ignore storage errors in browser-limited environments
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

export const api: AxiosInstance = axios.create({
  baseURL: "",
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    if (error.response?.status === 401) {
      clearTokens();
    }
    return Promise.reject(error);
  }
);

function extractDetail(err: unknown): string {
  if (isAxiosError(err)) {
    return (err.response?.data?.detail as string | undefined) ?? (err.response?.data?.error as string | undefined) ?? err.message;
  }
  return err instanceof Error ? err.message : "Unknown error";
}

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

export const participantsAPI = {
  async list(role?: "annotator" | "reviewer"): Promise<ApiListResponse<Participant>> {
    const res = await api.get<ApiListResponse<Participant>>("/api/users/participants/", { params: role ? { role } : undefined });
    return res.data;
  },
};

export const projectsAPI = {
  async create(body: CreateProjectRequest): Promise<Project> {
    const res = await api.post<Project>("/api/projects/", body);
    return res.data;
  },
  async list(params?: { limit?: number; offset?: number }): Promise<ApiListResponse<Project>> {
    const res = await api.get<ApiListResponse<Project>>("/api/projects/", { params });
    return res.data;
  },
  async get(id: string): Promise<Project> {
    const res = await api.get<Project>(`/api/projects/${id}/`);
    return res.data;
  },
  async update(id: string, body: Partial<CreateProjectRequest>): Promise<Project> {
    const res = await api.patch<Project>(`/api/projects/${id}/`, body);
    return res.data;
  },
  async delete(id: string): Promise<void> {
    await api.delete(`/api/projects/${id}/`);
  },
  async uploadInstructions(projectId: string, file: File): Promise<Pick<Project, "instructions_file_uri" | "instructions_file_name" | "instructions_version" | "instructions_updated_at">> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post(`/api/projects/${projectId}/instructions/upload/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data as any;
  },
  async importParticipantsCsv(projectId: string, file: File): Promise<{ created_users: number; linked_memberships: number; skipped_rows: number }> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post<{ created_users: number; linked_memberships: number; skipped_rows: number }>(`/api/projects/${projectId}/participants/import-csv/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },
  async manualDistributeAssignments(projectId: string, annotatorIds: string[], maxItems = 50): Promise<{ work_items_considered: number; assignments_created: number }> {
    const res = await api.post<{ work_items_considered: number; assignments_created: number }>(`/api/projects/${projectId}/assignments/manual-distribute/`, {
      annotator_ids: annotatorIds,
      max_items: maxItems,
    });
    return res.data;
  },
};

export const workflowAPI = {
  async upload(projectId: string, file: File, importId?: string | null): Promise<ProjectImportResponse> {
    const formData = new FormData();
    formData.append("file", file);
    if (importId) {
      formData.append("import_id", importId);
    }
    const res = await api.post<ProjectImportResponse>(`/api/projects/${projectId}/imports/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 10 * 60 * 1000,
    });
    return res.data;
  },
  async finalize(projectId: string, importId: string): Promise<ProjectFinalizeResponse> {
    const res = await api.post<ProjectFinalizeResponse>(`/api/projects/${projectId}/imports/${importId}/finalize/`, {});
    return res.data;
  },
  async overview(projectId: string): Promise<ProjectOverview> {
    const res = await api.get<ProjectOverview>(`/api/projects/${projectId}/overview/`);
    return res.data;
  },
  async export(projectId: string, format: "coco" | "yolo" | "both" = "both"): Promise<ProjectExportPayload> {
    const res = await api.get<ProjectExportPayload>(`/api/projects/${projectId}/export/`, { params: { format } });
    return res.data;
  },
  async exportArchive(projectId: string, format: "coco" | "yolo" | "both" = "both"): Promise<Blob> {
    const res = await api.get(`/api/projects/${projectId}/export/`, {
      params: { format, download: "1" },
      responseType: "blob",
    });
    return res.data as Blob;
  },
  async securityEvents(projectId: string): Promise<ApiListResponse<SecurityEventItem>> {
    const res = await api.get<ApiListResponse<SecurityEventItem>>(`/api/projects/${projectId}/security-events/`);
    return res.data;
  },
};

export const annotatorAPI = {
  async queue(): Promise<ApiListResponse<QueueItem>> {
    const res = await api.get<ApiListResponse<QueueItem>>("/api/annotator/queue/");
    return res.data;
  },
  async projects(): Promise<AnnotatorProjectsResponse> {
    const res = await api.get<AnnotatorProjectsResponse>("/api/annotator/projects/");
    return res.data;
  },
  async projectDetail(projectId: string): Promise<AnnotatorProjectDetail> {
    const res = await api.get<AnnotatorProjectDetail>(`/api/annotator/projects/${projectId}/`);
    return res.data;
  },
  async nextProjectAssignment(projectId: string): Promise<{ assignment_id: string; source: string }> {
    const res = await api.get<{ assignment_id: string; source: string }>(`/api/annotator/projects/${projectId}/next-assignment/`);
    return res.data;
  },
  async detail(assignmentId: string): Promise<AssignmentDetail> {
    const res = await api.get<AssignmentDetail>(`/api/annotator/assignments/${assignmentId}/`);
    return res.data;
  },
  async submit(assignmentId: string, body: AssignmentSubmitRequest): Promise<AssignmentSubmitResponse> {
    const res = await api.post<AssignmentSubmitResponse>(`/api/annotator/assignments/${assignmentId}/submit/`, body);
    return res.data;
  },
};

export const reviewerAPI = {
  async queue(): Promise<ApiListResponse<ReviewQueueItem>> {
    const res = await api.get<ApiListResponse<ReviewQueueItem>>("/api/reviewer/queue/");
    return res.data;
  },
  async detail(reviewId: string): Promise<ReviewDetail> {
    const res = await api.get<ReviewDetail>(`/api/reviews/${reviewId}/`);
    return res.data;
  },
  async resolve(reviewId: string, body: ReviewResolveRequest): Promise<ReviewResolveResponse> {
    const res = await api.post<ReviewResolveResponse>(`/api/reviews/${reviewId}/resolve/`, body);
    return res.data;
  },
};

export const validationAPI = {
  async queue(): Promise<ApiListResponse<ValidationQueueItem>> {
    const res = await api.get<ApiListResponse<ValidationQueueItem>>("/api/validation/queue/");
    return res.data;
  },
  async batchDetail(projectId: string, taskBatchId: string): Promise<ValidationBatchDetail> {
    const res = await api.get<ValidationBatchDetail>(`/api/validation/projects/${projectId}/batches/${encodeURIComponent(taskBatchId)}/`);
    return res.data;
  },
  async resolveBatch(projectId: string, taskBatchId: string, body: ValidationBatchResolveRequest): Promise<ValidationBatchResolveResponse> {
    const res = await api.post<ValidationBatchResolveResponse>(`/api/validation/projects/${projectId}/batches/${encodeURIComponent(taskBatchId)}/resolve/`, body);
    return res.data;
  },
};

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

export const qualityAPI = {
  async createReview(body: QualityReviewRequest): Promise<Record<string, unknown>> {
    const res = await api.post<Record<string, unknown>>("/api/quality/review/", body);
    return res.data;
  },
  async metrics(datasetId: string, params?: { limit?: number; offset?: number }): Promise<{ dataset_id: string; items: QualityMetricsItem[]; limit?: number; offset?: number; total?: number }> {
    const res = await api.get<{ dataset_id: string; items: QualityMetricsItem[]; limit?: number; offset?: number; total?: number }>(`/api/quality/metrics/${datasetId}/`, { params });
    return res.data;
  },
};

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
  // Отправляем то, что заполнил пользователь
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

export function throwApiError(err: unknown): never {
  throw new Error(extractDetail(err));
}
