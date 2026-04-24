export type Role = "customer" | "annotator" | "admin";

export interface User {
  id: string;
  email: string;
  username: string;
  role: Role;
  rating?: number;
  balance?: string;
  specialization?: string;
  group_name?: string;
  groups?: string[];
  experience_level?: string;
  avatar_url?: string | null;  // ✅ Аватар (data URL)
}

export type DatasetStatus = "draft" | "active" | "archived";

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

// ✅ ИСПРАВЛЕНО: добавлен "transfer"
export type TransactionType = "payment" | "payout" | "earnings" | "transfer";
export type TransactionStatus = "pending" | "completed" | "failed" | "reversed";

export interface Transaction {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  user_id: string;
  from_user_id?: string | null;
  to_user_id?: string | null;
  from_user_name?: string | null;
  to_user_name?: string | null;
  description?: string;
  task_id?: string | null;
  amount: string;
  currency: string;
  external_id?: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
}

// ✅ ИСПРАВЛЕНО: добавлены поля для перевода по username/email
export interface TransferRequest {
  to_user_id?: string;
  to_username?: string;
  to_email?: string;
  amount: string | number;
  currency?: string;
  description?: string;
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
  user?: User;
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
  description?: string;
  metadata?: Record<string, unknown>;
}

// ------------------ Stats ------------------
export interface UserStats {
  rating: number;
  level: "novice" | "intermediate" | "advanced" | "expert";
  level_label: string;
  level_color: string;
  completed_tasks: number;
  total_annotations: number;
  average_f1: number;
  reviews_count: number;
  balance: string;
  next_level_rating: number;
}

// ------------------ Leaderboard ------------------
export interface LeaderboardEntry {
  position: number;
  user_id: string;
  username: string;
  email: string;
  rating: number;
  completed_tasks: number;
  unique_tasks: number;
  total_annotations: number;
  average_f1: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  current_user: LeaderboardEntry | null;
  total_participants: number;
}
