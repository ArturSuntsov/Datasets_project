export type Role = "customer" | "annotator" | "admin";

export interface User {
  id: string;
  email: string;
  username: string;
  role: Role;
  rating?: number;
  balance?: string; // DecimalField чаще отдаётся строкой (MVP)
}

export type DatasetStatus = "draft" | "active" | "archived";

// ============================================================================
// Data Lake (MinIO) Types - НОВЫЕ
// ============================================================================

export type UploadStatus = "pending" | "uploading" | "uploaded" | "failed";

export interface Dataset {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  status: DatasetStatus;
  file_uri?: string | null;
  schema_version: number;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  
  // Data Lake (MinIO) fields - НОВЫЕ ПОЛЯ
  file_size_bytes?: number;
  file_hash?: string;
  storage_path?: string;
  upload_status?: UploadStatus;
  mime_type?: string;
}

export type TaskStatus = "pending" | "in_progress" | "review" | "completed" | "rejected";

export interface Task {
  id: string;
  project_id?: string | null;
  dataset_id: string;
  annotator_id?: string | null;
  status: TaskStatus;
  difficulty_score: number;
  deadline_at?: string | null;
  input_ref?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type AnnotationStatus = "draft" | "submitted" | "pending_review" | "accepted" | "rejected";

export type AnnotationFormat = "classification_v1" | "ner_v1" | "generic_v1";

export interface Annotation {
  id: string;
  task_id: string;
  dataset_id: string;
  session_id?: string | null;
  annotation_format: AnnotationFormat | string;
  label_data: Record<string, unknown>;
  predicted_data?: Record<string, unknown> | null;
  status: AnnotationStatus | string;
  is_final: boolean;
  created_at?: string;
  updated_at?: string;
}

export type TransactionType = "payment" | "payout" | "earnings";
export type TransactionStatus = "pending" | "completed" | "failed" | "reversed";

export interface Transaction {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  user_id: string;
  task_id?: string | null;
  amount: string; // DecimalField -> строка
  currency: string;
  external_id?: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
}

export interface ApiErrorResponse {
  detail?: string;
  [key: string]: unknown;
}

export interface ApiListResponse<T> {
  items: T[];
  limit?: number;
  offset?: number;
  total?: number;
}

// ------------------ Auth ------------------
export interface LoginRequest {
  email?: string;
  username?: string;
  identifier: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  role?: Role;
}

export interface AuthResponse {
  access: string;
  refresh?: string;
  user?: User;  // ✅ Опционально: бэкенд может не возвращать
  // ✅ Альтернативные поля которые может возвращать бэкенд
  user_id?: string;
  email?: string;
  username?: string;
  role?: string;
  ok?: boolean;
}

// ------------------ Dataset ------------------
export interface DatasetCreateRequest {
  name: string;
  description?: string;
  status?: DatasetStatus;
  file_uri?: string | null;
  schema_version?: number;
  metadata?: Record<string, unknown>;
}

export interface DatasetUpdateRequest extends Partial<DatasetCreateRequest> {}

// ------------------ Task / Labeling ------------------
export interface TaskFilters {
  status?: TaskStatus;
  limit?: number;
  offset?: number;
}

export interface TaskCreateRequest {
  project_id?: string | null;
  dataset_id: string;
  annotator_id?: string | null;
  status?: TaskStatus;
  difficulty_score?: number;
  deadline_at?: string | null;
  input_ref?: string | null;
}

export interface TaskUpdateRequest extends Partial<TaskCreateRequest> {
  status?: TaskStatus;
  difficulty_score?: number;
  deadline_at?: string | null;
  input_ref?: string | null;
  annotator_id?: string | null;
  project_id?: string | null;
}

export interface AnnotateRequest {
  label_data: Record<string, unknown>;
  is_final?: boolean;
  status?: string;
  annotation_format?: AnnotationFormat | string;
  auto_label?: boolean;
  input_context?: Record<string, unknown>;
}

// ------------------ Quality ------------------
export interface QualityReviewRequest {
  task_id: string;
  annotation_a_id: string;
  annotation_b_id: string;
  arbitrator?: string | null;
  arbitration_requested?: boolean;
  arbitration_comment?: string | null;
}

export interface QualityMetricsItem {
  task_id: string;
  precision: number;
  recall: number;
  f1: number;
  details?: Record<string, unknown>;
  created_at?: string;
}

// ------------------ Finance ------------------
export interface TransactionFilters {
  status?: TransactionStatus;
  limit?: number;
  offset?: number;
}

export interface PaymentRequestBody {
  amount: string | number;
  currency?: string;
  task_id?: string | null;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Data Lake (MinIO) Types - НОВЫЕ (продолжение)
// ============================================================================

export interface UploadStatusResponse {
  status: UploadStatus;
  progress?: number;
  file_size_bytes?: number;
  file_hash?: string;
  error?: string;
}

export interface DownloadResponse {
  download_url: string;
  expires_in: number;
  file_name: string;
  file_size: number;
}

export interface UploadInitResponse {
  task_id: string;
  status: string;
  dataset_id: string;
  message: string;
}

export interface UploadProgress {
  task_id: string;
  status: UploadStatus;
  progress: number;
  file_size_bytes?: number;
  file_hash?: string;
  error?: string;
}

// ============================================================================
// Type Guards & Helper Functions - НОВЫЕ
// ============================================================================

export function isDataset(value: unknown): value is Dataset {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value
  );
}

export function isUploaded(dataset: Dataset): boolean {
  return dataset.upload_status === 'uploaded';
}

export function isUploading(dataset: Dataset): boolean {
  return dataset.upload_status === 'uploading' || dataset.upload_status === 'pending';
}

export function hasFile(dataset: Dataset): boolean {
  return !!dataset.storage_path && dataset.upload_status === 'uploaded';
}

export function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
