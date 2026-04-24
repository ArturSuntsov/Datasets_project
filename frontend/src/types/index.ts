export type Role = "customer" | "annotator" | "reviewer" | "admin";

export interface User {
  id: string;
  email: string;
  username: string;
  role: Role;
  rating?: number;

  specialization?: string;
  group_name?: string;
  experience_level?: string;
  balance?: string; // DecimalField чаще отдаётся строкой (MVP)
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

export type TransactionType = "payment" | "payout" | "earnings" | "transfer";
export type TransactionStatus = "pending" | "completed" | "failed" | "reversed";

export interface Transaction {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  user_id: string;
  from_user_id?: string | null;      // ← Новое поле
  to_user_id?: string | null;        // ← Новое поле
  from_user_name?: string | null;    // ← Новое поле
  to_user_name?: string | null;      // ← Новое поле
  description?: string;              // ← Новое поле
  task_id?: string | null;
  amount: string;
  currency: string;
  external_id?: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
}

export interface TransferRequest {
  to_user_id?: string;      // опционально (можно не использовать)
  to_username?: string;     // ← новое поле
  to_email?: string;        // ← новое поле
  amount: string | number;
  currency?: string;
  description?: string;
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

export type ProjectStatus = "open" | "active" | "closed";
export type ProjectType = "standard" | "cv";
export type AnnotationType = "generic" | "bbox";

export interface ProjectLabel {
  name: string;
  color?: string;
  description?: string;
  rules?: string[];
  examples?: {
    good?: string[];
    bad?: string[];
  };
  attributes?: Record<string, boolean | string | number | null | undefined>;
}

export interface ProjectParticipantRules {
  specialization?: string;
  group?: string;
  assignment_scope?: "all" | "specialists" | "group_only" | "selected_only";
  ai_prelabel_enabled?: boolean;
  ai_model?: string;
  ai_confidence_threshold?: number;
  video_keyframe_interval?: number;
  tracking_algorithm?: string;
  task_batch_size?: number;
  min_sequence_size?: number;
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
  instructions_file_uri?: string;
  instructions_file_name?: string;
  instructions_version?: number;
  instructions_updated_at?: string | null;
  label_schema: ProjectLabel[];
  participant_rules: ProjectParticipantRules;
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
  participant_rules?: ProjectParticipantRules;
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
    cleanup?: {
      duplicates_removed?: number;
      invalid_frames_removed?: number;
      duplicate_assets?: string[];
    };
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

export interface SecurityEventItem {
  id: string;
  event_type: string;
  severity: string;
  created_at: string;
  actor_id?: string | null;
  payload: Record<string, unknown>;
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

export interface AnnotatorProjectSummary {
  project_id: string;
  project_title: string;
  project_status: string;
  instructions: string;
  instructions_file_uri?: string;
  instructions_file_name?: string;
  label_schema: ProjectLabel[];
  available_count: number;
  active_count: number;
  draft_count: number;
  submitted_count: number;
  accepted_count: number;
  rejected_count: number;
  completed_count?: number;
  batch_count?: number;
  validation_ready_count?: number;
  total_assignments: number;
  next_assignment_id?: string | null;
  active_assignment_id?: string | null;
  last_activity_at?: string;
}

export interface AnnotatorProjectsResponse {
  available_projects: AnnotatorProjectSummary[];
  active_projects: AnnotatorProjectSummary[];
  completed_projects: AnnotatorProjectSummary[];
}

export interface AnnotatorProjectDetail {
  project_id: string;
  project_title: string;
  project_status: string;
  description: string;
  instructions: string;
  instructions_file_uri?: string;
  instructions_file_name?: string;
  instructions_version?: number;
  instructions_updated_at?: string | null;
  label_schema: ProjectLabel[];
  frame_interval_sec: number;
  participant_rules: ProjectParticipantRules;
  stats: {
    available_count: number;
    active_count: number;
    submitted_count: number;
    accepted_count: number;
    rejected_count: number;
    completed_count: number;
    total_assignments: number;
    batch_count: number;
    validation_ready_count: number;
  };
  workflow?: {
    workflow_batches_total?: number;
    validation_ready_items?: number;
    [key: string]: unknown;
  };
  next_assignment_id?: string | null;
  active_assignment_id?: string | null;
}

export interface AssignmentWorkflowMeta {
  task_batch_id?: string;
  task_batch_number?: number;
  task_batch_size?: number;
  task_batch_target_size?: number;
  task_batch_total?: number;
  task_batch_index?: number;
  sequence_id?: string;
  sequence_index?: number;
  sequence_length?: number;
  min_sequence_size?: number;
  validation_ready?: boolean;
  asset_id?: string;
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
  queue_position?: number;
  instructions: string;
  label_schema: ProjectLabel[];
  workflow_meta?: AssignmentWorkflowMeta;
  draft: { boxes: BoundingBox[] };
  pre_annotations?: { boxes?: BoundingBox[]; [key: string]: unknown };
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
  evaluation?: {
    state: "accepted" | "requeued";
    metrics: Record<string, unknown>;
    review_id?: string;
    requeued_assignments?: number;
  } | null;
}

export interface ReviewQueueItem {
  review_id: string;
  project_id: string;
  project_title: string;
  work_item_id: string;
  frame_url: string;
  agreement_score: number;
  metrics: Record<string, unknown>;
  golden_total?: number;
  golden_errors?: number;
  golden_score?: number;
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
  quality_report: Record<string, unknown>;
  manifest?: Array<Record<string, unknown>>;
  coco?: {
    images: Array<Record<string, unknown>>;
    annotations: Array<Record<string, unknown>>;
    categories: Array<Record<string, unknown>>;
  };
  yolo?: {
    labels: string[];
    data_yaml: Record<string, unknown>;
    records: Array<{
      frame_uri: string;
      label_file: string;
      lines: string[];
    }>;
  };
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
