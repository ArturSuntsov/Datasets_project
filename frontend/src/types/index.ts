export type Role = "customer" | "annotator" | "reviewer" | "admin";

export interface User {
  id: string;
  email: string;
  username: string;
  role: Role;
  rating?: number;
  balance?: string;
  specialization?: string;
  group_name?: string;
  experience_level?: string;
}

export interface ApiErrorResponse {
  detail?: string;
  error?: string;
  [key: string]: unknown;
}

export interface ApiListResponse<T> {
  items: T[];
  limit?: number;
  offset?: number;
  total?: number;
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

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  role?: Role;
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

export interface DatasetCreateRequest {
  name: string;
  description?: string;
  status?: DatasetStatus;
  file_uri?: string | null;
  schema_version?: number;
  metadata?: Record<string, unknown>;
}

export interface DatasetUpdateRequest extends Partial<DatasetCreateRequest> {}

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
}


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

export type ProjectStatus = "open" | "active" | "closed";
export type ProjectType = "standard" | "cv";
export type AnnotationType = "generic" | "bbox";

export interface ProjectLabel {
  name: string;
  color?: string;
  description?: string;
}

export interface Project {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  status: ProjectStatus;
  project_type: ProjectType;
  annotation_type: AnnotationType;
  instructions: string;
  label_schema: ProjectLabel[];
  participant_rules: Record<string, unknown>;
  allowed_annotator_ids: string[];
  allowed_reviewer_ids: string[];
  frame_interval_sec: number;
  assignments_per_task: number;
  agreement_threshold: number;
  iou_threshold: number;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectRequest {
  title: string;
  description?: string;
  status?: ProjectStatus;
  project_type?: ProjectType;
  annotation_type?: AnnotationType;
  instructions?: string;
  label_schema?: ProjectLabel[];
  participant_rules?: Record<string, unknown>;
  allowed_annotator_ids?: string[];
  allowed_reviewer_ids?: string[];
  frame_interval_sec?: number;
  assignments_per_task?: number;
  agreement_threshold?: number;
  iou_threshold?: number;
}

export interface Participant extends User {}

export interface ProjectImportResponse {
  import_id: string;
  asset_id: string;
  asset_status: string;
  error_message?: string;
  preview: {
    assets_total: number;
    assets_processed: number;
    assets_failed: number;
    frames_total: number;
    errors: string[];
    sample_frames: string[];
  };
}

export interface ProjectFinalizeResponse {
  import_id: string;
  status: string;
  summary: Record<string, unknown>;
  overview: ProjectOverview;
}

export interface ProjectOverview {
  project_id: string;
  project: {
    title: string;
    status: string;
    project_type: string;
    annotation_type: string;
  };
  imports: Record<string, number>;
  work_items: Record<string, number>;
  assignments: Record<string, number>;
  reviews: Record<string, number>;
  annotators: Array<{
    user_id: string;
    username: string;
    rating: number;
    open_assignments: number;
    submitted_assignments: number;
    conflict_rate: number;
  }>;
}

export interface QueueItem {
  assignment_id: string;
  project_id: string;
  project_title: string;
  work_item_id: string;
  frame_url: string;
  status: string;
  instruction: string;
  label_schema: ProjectLabel[];
  created_at: string;
}

export interface AssignmentDetail {
  assignment_id: string;
  project_id: string;
  project_title: string;
  work_item_id: string;
  frame_url: string;
  frame: {
    frame_number: number;
    timestamp_sec: number;
    width: number;
    height: number;
  };
  status: string;
  instructions: string;
  label_schema: ProjectLabel[];
  draft: { boxes: BoundingBox[] };
  comment: string;
  quality_signals: Record<string, unknown>;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface AssignmentSubmitRequest {
  label_data: { boxes: BoundingBox[] };
  comment?: string;
  is_final?: boolean;
}

export interface AssignmentSubmitResponse {
  annotation_id: string;
  assignment_status: string;
  annotation_status: string;
  evaluation?: Record<string, unknown> | null;
}

export interface ReviewQueueItem {
  review_id: string;
  project_id: string;
  project_title: string;
  work_item_id: string;
  frame_url: string;
  agreement_score: number;
  metrics: Record<string, unknown>;
  annotations: Array<{
    annotation_id: string;
    annotator_id: string;
    annotator_username: string;
    label_data: { boxes: BoundingBox[] };
    comment: string;
  }>;
}

export interface ReviewDetail extends ReviewQueueItem {
  resolution?: { boxes: BoundingBox[] };
  status: string;
}

export interface ReviewResolveRequest {
  resolution: { boxes: BoundingBox[] };
  comment?: string;
}

export interface ReviewResolveResponse {
  review_id: string;
  work_item_id: string;
  status: string;
}

export interface ProjectExportPayload {
  project: {
    id: string;
    title: string;
    annotation_type: string;
  };
  manifest: Array<Record<string, unknown>>;
  coco: {
    images: Array<Record<string, unknown>>;
    annotations: Array<Record<string, unknown>>;
    categories: Array<Record<string, unknown>>;
  };
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

export interface AnnotateRequest {
  label_data: Record<string, unknown>;
  is_final?: boolean;
  status?: string;
  annotation_format?: AnnotationFormat | string;
  auto_label?: boolean;
  input_context?: Record<string, unknown>;
}

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

export type TransactionType = "payment" | "payout" | "earnings";
export type TransactionStatus = "pending" | "completed" | "failed" | "reversed";

export interface TransactionFilters {
  status?: TransactionStatus;
  limit?: number;
  offset?: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  user_id: string;
  task_id?: string | null;
  amount: string;
  currency: string;
  external_id?: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
}

export interface PaymentRequestBody {
  amount: string | number;
  currency?: string;
  task_id?: string | null;
  metadata?: Record<string, unknown>;
}
