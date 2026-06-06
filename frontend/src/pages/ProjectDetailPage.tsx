import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { projectsAPI, workflowAPI } from "../services/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuthStore } from "../store";
import { getTaskFlowCopy, getTaskGroupLabel } from "../lib/taskFlowCopy";
import { AnnotatedFramesGallery } from "../components/AnnotatedFramesGallery";
import { isCustomerRole } from "../utils/roles";
import type { GoldenSourceFrame, ProjectExportArtifact, ProjectExportArtifactName, ProjectExportFormat } from "../types";

const EMPTY_GOLDEN_BOX = { x: 0, y: 0, width: 100, height: 100, label: "drone" };
type GoldenBox = { x: number; y: number; width: number; height: number; label: string };

type ReadinessItem = { label: string; ready: boolean; detail?: string };

function StatusDot({ ready }: { ready: boolean }) {
  return <span className={`mt-1 h-2.5 w-2.5 rounded-full ${ready ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-700"}`} />;
}

function ProductReadinessChecklist({ items }: { items: ReadinessItem[] }) {
  const readyCount = items.filter((item) => item.ready).length;
  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Готовность проекта</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Минимальная настройка, чтобы исполнители могли работать без ручной поддержки.
          </p>
        </div>
        <div className="rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 dark:bg-gray-900 dark:text-gray-200">
          {readyCount}/{items.length} готово
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="flex gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <StatusDot ready={item.ready} />
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</div>
              {item.detail ? <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.detail}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QualityMetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{value}</div>
      {hint ? <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</div> : null}
    </div>
  );
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<"overview" | "annotated">("overview");
  const canViewAnnotated = isCustomerRole(user?.role);
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const [validationAnnotationFile, setValidationAnnotationFile] = useState<File | null>(null);
  const [activeImportId, setActiveImportId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [exportPayload, setExportPayload] = useState<string | null>(null);
  const [instructionFile, setInstructionFile] = useState<File | null>(null);
  const [instructionUploadError, setInstructionUploadError] = useState<string | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<ProjectExportFormat>("both");
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [genericTasksInput, setGenericTasksInput] = useState("");
  const [genericTasksFile, setGenericTasksFile] = useState<File | null>(null);
  const [genericTasksError, setGenericTasksError] = useState<string | null>(null);
  const [goldenFrameId, setGoldenFrameId] = useState("");
  const [goldenCaseType, setGoldenCaseType] = useState<"positive" | "negative">("positive");
  const [goldenIssueType, setGoldenIssueType] = useState("manual_positive");
  const [goldenStatus, setGoldenStatus] = useState<"candidate" | "active">("candidate");
  const [goldenAnnotationJson, setGoldenAnnotationJson] = useState(JSON.stringify({ boxes: [EMPTY_GOLDEN_BOX] }, null, 2));
  const [goldenProbeJson, setGoldenProbeJson] = useState(JSON.stringify({ boxes: [] }, null, 2));
  const [goldenCreateError, setGoldenCreateError] = useState<string | null>(null);
  const [goldenFrameSearch, setGoldenFrameSearch] = useState("");
  const [selectedGoldenFrame, setSelectedGoldenFrame] = useState<GoldenSourceFrame | null>(null);
  const [goldenBoxes, setGoldenBoxes] = useState<GoldenBox[]>([]);

  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectsAPI.get(projectId!),
    enabled: !!projectId,
  });

  const overviewQuery = useQuery({
    queryKey: ["project-overview", projectId],
    queryFn: () => workflowAPI.overview(projectId!),
    enabled: !!projectId,
  });
  const goldenCandidatesQuery = useQuery({
    queryKey: ["project-golden-candidates", projectId],
    queryFn: () => workflowAPI.goldenCandidates(projectId!),
    enabled: !!projectId,
  });
  const goldenSourceFramesQuery = useQuery({
    queryKey: ["project-golden-source-frames", projectId, goldenFrameSearch],
    queryFn: () => workflowAPI.goldenSourceFrames(projectId!, { search: goldenFrameSearch || undefined, limit: 80 }),
    enabled: !!projectId,
  });
  const securityEventsQuery = useQuery({
    queryKey: ["project-security-events", projectId],
    queryFn: () => workflowAPI.securityEvents(projectId!),
    enabled: !!projectId,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!projectId || uploadQueue.length === 0) {
        return null;
      }
      let currentImportId = activeImportId;
      let latest = null;
      for (let index = 0; index < uploadQueue.length; index += 1) {
        const file = uploadQueue[index];
        latest = await workflowAPI.upload(projectId, file, currentImportId, index === 0 ? validationAnnotationFile : null);
        currentImportId = latest.import_id;
      }
      return latest;
    },
    onSuccess: (result) => {
      if (result?.import_id) {
        setActiveImportId(result.import_id);
      }
      setUploadQueue([]);
      setValidationAnnotationFile(null);
      setUploadError(result?.asset_status === "failed" ? result.error_message || "Видео загружено, но обработка завершилась с ошибкой." : null);
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
    onError: (err: any) => {
      setUploadError(err.response?.data?.detail || err.response?.data?.error || err.message || "Загрузка не удалась");
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const importId = activeImportId || String(overviewQuery.data?.imports?.latest_ready_import_id || "");
      if (!projectId || !importId) {
        throw new Error("Нет импорта для финализации");
      }
      return workflowAPI.finalize(projectId, importId);
    },
    onSuccess: () => {
      setFinalizeError(null);
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
    onError: (err: any) => {
      setFinalizeError(err?.response?.data?.detail || err?.response?.data?.error || "Не удалось финализировать импорт");
    },
  });

  const exportMutation = useMutation({
    mutationFn: async ({ artifact, format }: { artifact: ProjectExportArtifactName | string; format: ProjectExportFormat }) =>
      workflowAPI.export(projectId!, format, artifact),
    onSuccess: (payload) => {
      setExportPayload(JSON.stringify(payload, null, 2));
    },
    onError: (err: any) => {
      setArchiveError(err?.response?.data?.detail || err?.message || "Не удалось подготовить экспорт");
    },
  });

  const exportArchiveMutation = useMutation({
    mutationFn: async ({ artifact, format }: { artifact: ProjectExportArtifactName | string; format: ProjectExportFormat }) => {
      const blob = await workflowAPI.exportArchive(projectId!, format, artifact);
      return { blob, artifact, format };
    },
    onSuccess: ({ blob, artifact, format }) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `project-${projectId}-${artifact}-${format}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
      setArchiveError(null);
    },
    onError: (err: any) => {
      setArchiveError(err?.response?.data?.detail || err?.message || "Не удалось экспортировать архив");
    },
  });

  const approvePendingMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Project id missing");
      if (!confirm("Одобрить все завершённые кадры, ожидающие валидации? Они появятся во вкладке «Размеченные кадры».")) {
        throw new Error("cancelled");
      }
      return projectsAPI.approveAllPending(projectId);
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["annotated-frames", projectId] });
      alert(`Одобрено кадров: ${data.updated}`);
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.message === "cancelled") return;
      const detail = isAxiosError(err) ? err.response?.data?.detail : undefined;
      alert(`Ошибка: ${detail || (err instanceof Error ? err.message : "Неизвестная ошибка")}`);
    },
  });

  const syncWorkflowMutation = useMutation({
    mutationFn: async () => workflowAPI.sync(projectId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-golden-candidates", projectId] });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Project id missing");
      await projectsAPI.delete(projectId);
    },
    onSuccess: async () => {
      setDeleteError(null);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate("/projects");
    },
    onError: async (err: any) => {
      if (isAxiosError(err) && err.response?.status === 404) {
        await queryClient.invalidateQueries({ queryKey: ["projects"] });
        navigate("/projects");
        return;
      }
      setDeleteError(err?.response?.data?.detail || err?.message || "Не удалось удалить проект");
    },
  });

  const promoteGoldenMutation = useMutation({
    mutationFn: async ({ goldenFrameId, reviewNotes }: { goldenFrameId: string; reviewNotes?: string }) =>
      workflowAPI.promoteGoldenCandidate(projectId!, goldenFrameId, reviewNotes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-golden-candidates", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });
  const genericTasksQuery = useQuery({
    queryKey: ["project-generic-tasks", projectId],
    queryFn: () => projectsAPI.genericTasks(projectId!),
    enabled: !!projectId && ["text_annotation", "image_annotation", "classification", "comparison"].includes(String(projectQuery.data?.task_type || "")),
  });

  const retireGoldenMutation = useMutation({
    mutationFn: async ({ goldenFrameId, reviewNotes }: { goldenFrameId: string; reviewNotes?: string }) =>
      workflowAPI.retireGoldenCandidate(projectId!, goldenFrameId, reviewNotes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-golden-candidates", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });

  const pauseProjectMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Project id missing");
      const project = projectQuery.data;
      return project?.status === "paused" ? projectsAPI.resume(projectId) : projectsAPI.pause(projectId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["annotator-projects"] });
    },
  });

  const createGoldenMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Project id missing");
      const reference = JSON.parse(goldenAnnotationJson || "{}");
      const probe = goldenCaseType === "negative" ? JSON.parse(goldenProbeJson || "{}") : reference;
      return workflowAPI.createGoldenCandidate(projectId, {
        frame_id: goldenFrameId.trim(),
        case_type: goldenCaseType,
        usage: "both",
        expected_decision: goldenCaseType === "negative" ? "needs_changes" : "approve",
        issue_type: goldenIssueType || (goldenCaseType === "negative" ? "manual_negative" : "manual_positive"),
        status: goldenStatus,
        reference_annotation: reference,
        probe_annotation: probe,
        review_notes: "manual golden case",
      });
    },
    onSuccess: async () => {
      setGoldenCreateError(null);
      setGoldenFrameId("");
      await queryClient.invalidateQueries({ queryKey: ["project-golden-candidates", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
    onError: (err: any) => {
      setGoldenCreateError(err?.response?.data?.detail || err?.message || "Не удалось создать golden-кейс. Проверьте frame_id и JSON разметки.");
    },
  });

  const createVisualGoldenMutation = useMutation({
    mutationFn: async () => {
      if (!projectId || !selectedGoldenFrame) throw new Error("Сначала выберите кадр");
      const reference = { boxes: goldenBoxes };
      return workflowAPI.createGoldenCandidate(projectId, {
        frame_id: selectedGoldenFrame.frame_id,
        case_type: goldenCaseType,
        usage: "both",
        expected_decision: goldenCaseType === "negative" ? "needs_changes" : "approve",
        issue_type: goldenIssueType || (goldenCaseType === "negative" ? "manual_negative" : "manual_positive"),
        status: goldenStatus,
        reference_annotation: reference,
        probe_annotation: goldenCaseType === "negative" ? { boxes: [] } : reference,
        review_notes: "visual golden case",
      });
    },
    onSuccess: async () => {
      setGoldenCreateError(null);
      await queryClient.invalidateQueries({ queryKey: ["project-golden-candidates", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-golden-source-frames", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
    onError: (err: any) => {
      setGoldenCreateError(err?.response?.data?.detail || err?.message || "Не удалось сохранить golden case.");
    },
  });

  const selectGoldenFrame = (frame: GoldenSourceFrame) => {
    setSelectedGoldenFrame(frame);
    const boxes = ((frame.reference_annotation as any)?.boxes ?? []) as GoldenBox[];
    setGoldenBoxes(boxes.length ? boxes.map((box) => ({
      x: Number(box.x || 0),
      y: Number(box.y || 0),
      width: Number(box.width || 0),
      height: Number(box.height || 0),
      label: String(box.label || projectQuery.data?.label_schema?.[0]?.name || "object"),
    })) : []);
    setGoldenFrameId(frame.frame_id);
  };

  const updateGoldenBox = (index: number, patch: Partial<GoldenBox>) => {
    setGoldenBoxes((current) => current.map((box, boxIndex) => boxIndex === index ? { ...box, ...patch } : box));
  };

  const addGoldenBox = () => {
    setGoldenBoxes((current) => [
      ...current,
      { x: 0, y: 0, width: 100, height: 100, label: projectQuery.data?.label_schema?.[0]?.name || "object" },
    ]);
  };

  const instructionUploadMutation = useMutation({
    mutationFn: async () => {
      if (!projectId || !instructionFile) {
        throw new Error("Выберите файл инструкции");
      }
      return projectsAPI.uploadInstructions(projectId, instructionFile);
    },
    onSuccess: async () => {
      setInstructionFile(null);
      setInstructionUploadError(null);
      await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (err: any) => {
      setInstructionUploadError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || "Не удалось загрузить инструкцию");
    },
  });

  const createGenericTasksMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Project id missing");
      if (genericTasksFile) {
        const formData = new FormData();
        formData.append("file", genericTasksFile);
        return projectsAPI.createGenericTasks(projectId, formData);
      }
      return projectsAPI.createGenericTasks(projectId, { items: genericTasksInput });
    },
    onSuccess: async () => {
      setGenericTasksInput("");
      setGenericTasksFile(null);
      setGenericTasksError(null);
      await queryClient.invalidateQueries({ queryKey: ["project-generic-tasks", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
    onError: (err: any) => {
      setGenericTasksError(err?.response?.data?.detail || err?.message || "Не удалось создать generic-задачи");
    },
  });

  const overview = overviewQuery.data;
  const taskType = String(projectQuery.data?.task_type || "bbox_annotation");
  const taskCopy = getTaskFlowCopy(taskType);
  const isGenericTask = ["text_annotation", "image_annotation", "classification", "comparison"].includes(taskType);
  const isIntervalProject = taskType.includes("interval");
  const isBBoxProject = taskType.includes("bbox");
  const isValidationTask = ["video_interval_validation", "bbox_validation"].includes(taskType);
  const validationInputMode = String(projectQuery.data?.participant_rules?.validation_input_mode || "source_project");
  const isValidationUpload = isValidationTask && validationInputMode === "upload";
  const canUploadMedia = ["bbox_annotation", "video_annotation", "image_annotation"].includes(taskType) || isValidationUpload;
  const lastUploadPreview = uploadMutation.data?.preview;
  const readyImportId = activeImportId || String(overview?.imports?.latest_ready_import_id || "");
  const hasVideoAssets = Array.isArray(overview?.imports?.video_asset_ids) && overview.imports.video_asset_ids.length > 0;
  const overviewAny = overview as any;
  const genericTotal = Number(overviewAny?.generic_tasks?.total || genericTasksQuery.data?.summary?.total || 0);
  const genericCompleted = Number(overviewAny?.generic_tasks?.completed || genericTasksQuery.data?.summary?.completed || 0);
  const totalWorkItems = Number(overview?.work_items?.total || 0);
  const completedWorkItems = Number(overview?.work_items?.completed || 0);
  const approvedExportItems = isGenericTask ? genericCompleted : Number((overview?.work_items as any)?.validation_approved || 0);
  const validationPendingItems = Number((overview?.work_items as any)?.validation_pending || 0);
  const publishablePendingItems = Number(
    (overview?.work_items as any)?.publishable_pending ?? validationPendingItems
  );
  const customerGalleryTotal = Number((overview?.work_items as any)?.customer_gallery_total ?? 0);
  const validationDisputedItems = Number((overview?.work_items as any)?.validation_disputed || 0);
  const insufficientAnnotatorItems = Number((overview?.work_items as any)?.insufficient_annotators || 0);
  const insufficientValidatorItems = Number((overview?.work_items as any)?.insufficient_validators || 0);
  const exportTotalItems = isGenericTask ? genericTotal : totalWorkItems;
  const exportBlockedItems = Math.max(0, exportTotalItems - approvedExportItems);
  const exportReadyPercent = exportTotalItems > 0 ? Math.round((approvedExportItems / exportTotalItems) * 100) : 0;
  const exportReady = approvedExportItems > 0;
  const backendExportArtifacts = Array.isArray(overview?.export?.artifacts) ? overview.export.artifacts : [];
  const exportArtifacts: ProjectExportArtifact[] = isGenericTask
    ? [
        {
          artifact: "validated_dataset",
          title: "Ответы проекта",
          ready: genericCompleted > 0,
          items_count: genericCompleted,
          quality_level: "project_result",
          validated: false,
          message: genericCompleted > 0 ? "" : "Экспорт станет содержательным после появления хотя бы одного завершенного задания.",
          formats: ["json", "jsonl", "csv", "both"],
        },
      ]
    : backendExportArtifacts;
  const exportArtifactFormat = (artifact: ProjectExportArtifact): ProjectExportFormat => {
    const formats = (artifact.formats || []) as string[];
    if (formats.includes(exportFormat)) return exportFormat;
    return "both";
  };
  const previewArtifact = (artifact: ProjectExportArtifact) => {
    setArchiveError(null);
    exportMutation.mutate({ artifact: artifact.artifact, format: exportArtifactFormat(artifact) });
  };
  const downloadArtifact = (artifact: ProjectExportArtifact) => {
    setArchiveError(null);
    exportArchiveMutation.mutate({ artifact: artifact.artifact, format: exportArtifactFormat(artifact) });
  };
  const goldenCandidates = goldenCandidatesQuery.data?.items ?? [];
  const goldenActiveCount = Number(goldenCandidatesQuery.data?.active_count ?? 0);
  const goldenCandidateCount = Number(goldenCandidatesQuery.data?.candidate_count ?? 0);
  const goldenRetiredCount = Number(goldenCandidatesQuery.data?.retired_count ?? 0);
  const activeGolden = goldenCandidates.filter((item) => item.status === "active");
  const activePositiveGolden = activeGolden.filter((item) => (item.case_type || "positive") === "positive").length;
  const activeNegativeGolden = activeGolden.filter((item) => item.case_type === "negative").length;
  const diversityBucketCount = new Set(activeGolden.map((item) => item.diversity_bucket || `${item.asset_id || ""}:${Math.floor(Number(item.timestamp_sec || 0) / 30)}`)).size;
  const goldenNeedsActivation = goldenActiveCount === 0 && goldenCandidateCount > 0;
  const goldenBalanceWarning = goldenActiveCount > 0 && activeNegativeGolden === 0;
  const bboxValidationAssigned = Number(overviewAny?.bbox_validation?.assigned || 0);
  const canDeleteProject = user?.role === "admin" || (user?.role === "customer" && projectQuery.data?.owner_id === user.id);
  const headerActionClass = "btn-secondary inline-flex min-h-[48px] items-center justify-center whitespace-nowrap";
  const sourceSync = overview?.source_sync;
  const fallbackReadinessGates = [
    { label: "Импорт готов", ready: Number(overview?.imports?.ready || 0) > 0 || Number(overview?.imports?.finalized || 0) > 0 },
    { label: "Интервалы назначены", ready: Number(overviewAny?.intervals?.total || 0) > 0 || Number(overviewAny?.intervals?.validation_assigned || 0) > 0 },
    { label: "Интервалы проверены", ready: Number(overviewAny?.intervals?.validation_assigned || 0) > 0 || Number(overviewAny?.intervals?.approved || 0) > 0 },
    { label: "BBox-разметка доступна", ready: Number(overview?.work_items?.total || 0) > 0 },
    { label: "BBox-валидация запущена", ready: Number(overviewAny?.bbox_validation?.assigned || 0) > 0 || Number((overview?.work_items as any)?.validation_pending || 0) > 0 },
    { label: "Экспорт доступен", ready: exportReady },
  ];
  const readinessGates = overview?.readiness_gates?.length ? overview.readiness_gates : fallbackReadinessGates;
  const nextAction = overview?.next_action;
  const requeuedItems = Number(overview?.assignments?.disputed || overviewAny?.work_items?.requeued || validationDisputedItems || 0);
  const validationReadyItems = Number(overviewAny?.work_items?.validation_ready_items || overviewAny?.work_items?.validation_ready || 0);
  const goldenStats = goldenCandidates.reduce(
    (acc, item) => {
      acc.seen += Number(item.stats?.annotation_seen || 0) + Number(item.stats?.validation_seen || 0);
      acc.passed += Number(item.stats?.annotation_passed || 0) + Number(item.stats?.validation_passed || 0);
      return acc;
    },
    { seen: 0, passed: 0 },
  );
  const goldenAccuracy = goldenStats.seen > 0 ? Math.round((goldenStats.passed / goldenStats.seen) * 100) : null;
  const consensusRate = totalWorkItems > 0 ? Math.round((completedWorkItems / totalWorkItems) * 100) : 0;
  const requeueRate = exportTotalItems > 0 ? Math.round((requeuedItems / exportTotalItems) * 100) : 0;
  const projectReadinessItems: ReadinessItem[] = [
    {
      label: "Схема меток",
      ready: !isBBoxProject || (projectQuery.data?.label_schema.length || 0) > 0,
      detail: `${projectQuery.data?.label_schema.length || 0} меток`,
    },
    {
      label: "Инструкция",
      ready: Boolean(projectQuery.data?.instructions?.trim() || projectQuery.data?.instructions_file_uri),
      detail: projectQuery.data?.instructions_file_uri ? "Файл прикреплен" : "Текстовая инструкция",
    },
    {
      label: "Пул исполнителей",
      ready: (projectQuery.data?.allowed_annotator_ids.length || 0) > 0 || projectQuery.data?.participant_rules?.assignment_scope === "all",
      detail: `${projectQuery.data?.allowed_annotator_ids.length || 0} выбрано`,
    },
    {
      label: "Импортированные данные",
      ready: Number(overview?.imports?.frames_total || 0) > 0 || totalWorkItems > 0 || genericTotal > 0,
      detail: `${Number(overview?.imports?.frames_total || 0)} кадров найдено`,
    },
    {
      label: "Golden-контроль",
      ready: projectQuery.data?.project_type !== "cv" || goldenActiveCount > 0,
      detail: `${goldenActiveCount} активных, ${goldenCandidateCount} кандидатов`,
    },
    {
      label: "Настройки workflow",
      ready: Number(projectQuery.data?.assignments_per_task || 0) > 0 && Number(projectQuery.data?.agreement_threshold || 0) > 0,
      detail: `${projectQuery.data?.assignments_per_task || 0} ответов на элемент`,
    },
  ];

  const completion = useMemo(() => {
    if (isGenericTask) return genericTotal > 0 ? Math.round((genericCompleted / genericTotal) * 100) : 0;
    return totalWorkItems > 0 ? Math.round((completedWorkItems / totalWorkItems) * 100) : 0;
  }, [completedWorkItems, genericCompleted, genericTotal, isGenericTask, totalWorkItems]);

  if (projectQuery.isLoading) {
    return <LoadingSpinner size="lg" />;
  }

  if (!projectQuery.data) {
    const canTryDeleteMissingProject = user?.role === "customer" || user?.role === "admin";
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Проект не найден.
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/projects" className="btn-secondary">
            К проектам
          </Link>
          {canTryDeleteMissingProject && projectId ? (
            <button
              type="button"
              className="btn-secondary border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
              disabled={deleteProjectMutation.isPending}
              onClick={() => {
                if (window.confirm("Удалить недоступный проект из рабочего пространства?")) {
                  deleteProjectMutation.mutate();
                }
              }}
            >
              {deleteProjectMutation.isPending ? "Удаляем..." : "Удалить проект"}
            </button>
          ) : null}
        </div>
        {deleteError ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{deleteError}</div> : null}
      </div>
    );
  }

  const projectOverviewContent = (
    <>
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {projectQuery.data.project_type} / {getTaskGroupLabel(taskType)} / {taskCopy.projectTitle}
          </div>
          <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{projectQuery.data.title}</h1>
          <p className="mt-3 max-w-3xl text-sm text-gray-600 dark:text-gray-400">{projectQuery.data.description}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link to={`/projects/${projectId}/workflow`} className={headerActionClass}>
            Настройка разметки
          </Link>
          {["video_annotation", "video_interval_validation"].includes(taskType) ? (
            <Link to={`/projects/${projectId}/intervals`} className={headerActionClass}>
              Интервалы
            </Link>
          ) : null}
          {projectQuery.data.project_type === "cv" ? (
            <Link to={`/projects/${projectId}/golden`} className={headerActionClass}>
              Golden dataset
            </Link>
          ) : null}
          <button className={headerActionClass} onClick={() => syncWorkflowMutation.mutate()} disabled={syncWorkflowMutation.isPending}>
            {syncWorkflowMutation.isPending ? "Синхронизируем..." : "Синхронизировать"}
          </button>
          <button className={headerActionClass} onClick={() => pauseProjectMutation.mutate()} disabled={pauseProjectMutation.isPending}>
            {projectQuery.data.status === "paused" ? "Возобновить проект" : "Поставить на паузу"}
          </button>
          {canDeleteProject ? (
            <button
              className={`${headerActionClass} border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950`}
              onClick={() => {
                if (window.confirm("Удалить проект и все связанные задания/разметки? Это действие нельзя отменить.")) {
                  deleteProjectMutation.mutate();
                }
              }}
              disabled={deleteProjectMutation.isPending}
            >
              {deleteProjectMutation.isPending ? "Удаляем..." : "Удалить проект"}
            </button>
          ) : null}
        </div>
      </div>
      {deleteError ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{deleteError}</div> : null}

      {projectQuery.data.status === "paused" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Проект на паузе. Исполнители не могут получать и отправлять задания, пока проект не будет возобновлен.
        </div>
      ) : null}

      {nextAction ? (
        <div className={`rounded-lg border p-4 text-sm ${nextAction.severity === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : nextAction.severity === "warning" ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" : "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100"}`}>
          Следующий шаг: {nextAction.route ? <Link className="font-semibold underline" to={nextAction.route}>{nextAction.label}</Link> : <span className="font-semibold">{nextAction.label}</span>}
        </div>
      ) : null}

      {projectQuery.data.source_project_id ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
          Источник данных: {projectQuery.data.source_project_title || projectQuery.data.source_project_id}. Нажмите «Синхронизировать», чтобы создать задания валидации из исходного проекта.
        </div>
      ) : null}

      <div className={`rounded-lg border p-4 ${taskCopy.group === "video" ? "border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100" : taskCopy.group === "bbox" ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "border-gray-200 bg-gray-50 text-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{getTaskGroupLabel(taskType)}</div>
            <h2 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{taskCopy.projectTitle}</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{taskCopy.projectDescription}</p>
          </div>
        </div>
      </div>

      {isGenericTask ? (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Задания для этого проекта</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Добавьте задания вручную или загрузите CSV с колонками title, prompt, input_ref, option_a, option_b.
              </p>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Всего: {Number(genericTasksQuery.data?.summary?.total || 0)} · Ожидают: {Number(genericTasksQuery.data?.summary?.pending || 0)} · На проверке: {Number(genericTasksQuery.data?.summary?.review || 0)}
            </div>
          </div>
          <textarea
            className="input-field min-h-[120px]"
            value={genericTasksInput}
            onChange={(event) => setGenericTasksInput(event.target.value)}
            placeholder={taskType === "comparison" ? "Задание 1\nЗадание 2" : "Одна строка = одно задание"}
            disabled={!!genericTasksFile}
          />
          <input
            type="file"
            accept=".csv,.txt"
            onChange={(event) => setGenericTasksFile((event.target.files?.[0] as File | undefined) ?? null)}
            className="block w-full text-sm text-gray-600 dark:text-gray-300"
          />
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary"
              disabled={createGenericTasksMutation.isPending || (!genericTasksInput.trim() && !genericTasksFile)}
              onClick={() => createGenericTasksMutation.mutate()}
            >
              {createGenericTasksMutation.isPending ? "Создаём..." : "Создать задания"}
            </button>
          </div>
          {genericTasksError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{genericTasksError}</div> : null}
          {createGenericTasksMutation.data ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              Создано: {createGenericTasksMutation.data.created}, пропущено дублей: {createGenericTasksMutation.data.skipped}, всего: {createGenericTasksMutation.data.total}.
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="card">
          <div className="text-sm text-gray-500 dark:text-gray-400">Кадры</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{Number(overview?.imports?.frames_total ?? 0)}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 dark:text-gray-400">{isGenericTask ? "Задания" : "Рабочие элементы"}</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{isGenericTask ? genericTotal : totalWorkItems}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 dark:text-gray-400">Готово к экспорту</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{approvedExportItems}/{exportTotalItems}</div>
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{exportReadyPercent}% готово</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 dark:text-gray-400">Повторная разметка</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{Number(overview?.assignments?.disputed ?? 0)}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 dark:text-gray-400">Завершение</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{completion}%</div>
        </div>
      </div>

      <ProductReadinessChecklist items={projectReadinessItems} />

      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Панель качества</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Качество считается по консенсусу, IoU, golden-контролю, пакетам валидации и возвратам на повторную разметку.
            </p>
          </div>
          <Link to={`/projects/${projectId}/golden`} className="btn-secondary">
            Управлять golden
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <QualityMetricCard label="Консенсус" value={`${consensusRate}%`} hint={`${completedWorkItems}/${totalWorkItems} рабочих элементов завершено`} />
          <QualityMetricCard label="Golden-точность" value={goldenAccuracy === null ? "Нет попыток" : `${goldenAccuracy}%`} hint={`${goldenStats.seen} контрольных попыток`} />
          <QualityMetricCard label="Возврат на доработку" value={`${requeueRate}%`} hint={`${requeuedItems} элементов возвращено исполнителям`} />
          <QualityMetricCard label="Готово к валидации" value={validationReadyItems} hint={`${bboxValidationAssigned} пакетов валидации назначено`} />
          <QualityMetricCard label="Готово к экспорту" value={`${approvedExportItems}/${exportTotalItems}`} hint={`${exportBlockedItems} заблокировано или не готово`} />
        </div>
        {(insufficientAnnotatorItems > 0 || insufficientValidatorItems > 0) ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            Предупреждение по исполнителям: {insufficientAnnotatorItems} элементов требуют больше разметчиков, {insufficientValidatorItems} элементов требуют больше валидаторов.
          </div>
        ) : null}
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Результаты проекта</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Каждый проект экспортирует собственный результат. Только проверенный датасет считается финальной выгрузкой для обучения модели.
            </p>
          </div>
          <select
            className="input-field w-auto"
            value={exportFormat}
            onChange={(event) => setExportFormat(event.target.value as ProjectExportFormat)}
          >
            <option value="both">Формат: все доступные</option>
            <option value="json">JSON</option>
            <option value="jsonl">JSONL</option>
            <option value="csv">CSV</option>
            {!isGenericTask ? <option value="coco">COCO</option> : null}
            {!isGenericTask ? <option value="yolo">YOLO</option> : null}
            {!isGenericTask ? <option value="voc">Pascal VOC</option> : null}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
          {exportArtifacts.map((artifact) => {
            const isValidatedDataset = artifact.artifact === "validated_dataset";
            const effectiveFormat = exportArtifactFormat(artifact);
            return (
              <div
                key={artifact.artifact}
                className={`rounded-lg border p-4 ${
                  artifact.ready
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"
                    : "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">{artifact.title}</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {artifact.items_count} элементов · {artifact.quality_level}
                    </div>
                  </div>
                  <span className={`rounded px-2 py-1 text-xs font-medium ${artifact.ready ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-100" : "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
                    {artifact.ready ? "Доступно" : "Ожидает"}
                  </span>
                </div>
                {!isValidatedDataset ? (
                  <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                    Этот экспорт не является финальным проверенным датасетом.
                  </div>
                ) : null}
                {!artifact.ready && artifact.message ? (
                  <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">{artifact.message}</div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={exportMutation.isPending}
                    onClick={() => previewArtifact(artifact)}
                  >
              {exportMutation.isPending ? "Готовим..." : `Предпросмотр ${effectiveFormat}`}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={exportArchiveMutation.isPending}
                    onClick={() => downloadArtifact(artifact)}
                  >
                    {exportArchiveMutation.isPending ? "ZIP..." : "Скачать ZIP"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {archiveError ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{archiveError}</div> : null}
      </div>

      <div className="card space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Готовность workflow</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Пользователь всегда видит, какой этап готов и что нужно сделать дальше.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {readinessGates.map((gate) => (
            <div key={gate.label} className={`rounded-lg border p-3 text-sm ${gate.ready ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400"}`}>
              <div className="font-medium">{gate.label}</div>
              <div className="mt-1 text-xs">{gate.ready ? "Готово" : "Ожидает"}</div>
            </div>
          ))}
        </div>
        {!exportReady ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            {isGenericTask ? "Экспорт станет содержательным после появления хотя бы одного завершённого задания." : "Экспорт станет доступен после появления хотя бы одного подтверждённого кадра."}
            <div className="mt-2">
              Сейчас: ожидает bbox-валидации {validationPendingItems}, назначено пакетов валидации {bboxValidationAssigned}, спорных {validationDisputedItems}, нехватка исполнителей {insufficientAnnotatorItems}, нехватка валидаторов {insufficientValidatorItems}.
            </div>
            <div className="mt-2">
              Если это старый проект, нажмите Sync workflow: система попробует пересобрать очередь валидации по уже готовой разметке.
            </div>
          </div>
        ) : null}
        {syncWorkflowMutation.data?.sync ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
            Синхронизация завершена: bbox assignments {syncWorkflowMutation.data.sync.bbox_annotation_created ?? 0}, interval assignments {syncWorkflowMutation.data.sync.interval_annotation_created ?? 0}, evaluated {syncWorkflowMutation.data.sync.evaluated_items ?? 0}, bbox validation batches {syncWorkflowMutation.data.sync.bbox_validation_created ?? 0}.
          </div>
        ) : null}
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Golden dataset</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Скрытые контрольные примеры для проверки качества разметки. Откройте отдельный workspace, чтобы визуально разметить кадры и управлять кандидатами.
            </p>
          </div>
          <Link to={`/projects/${projectId}/golden`} className="btn-primary">
            Управлять golden
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">Активные</div>
            <div className="mt-1 font-semibold text-gray-900 dark:text-white">{goldenActiveCount}</div>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">Кандидаты</div>
            <div className="mt-1 font-semibold text-gray-900 dark:text-white">{goldenCandidateCount}</div>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">Удаленные</div>
            <div className="mt-1 font-semibold text-gray-900 dark:text-white">{goldenRetiredCount}</div>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">Хорошие / плохие</div>
            <div className="mt-1 font-semibold text-gray-900 dark:text-white">{activePositiveGolden}/{activeNegativeGolden}</div>
          </div>
        </div>
      </div>

      <div className="hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Golden pool</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Контрольный набор для проверки честности. Если active golden есть, часть задач подмешивается исполнителям без видимой пометки.
            </p>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Active: {goldenActiveCount} · Candidates: {goldenCandidateCount} · Retired: {goldenRetiredCount}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">Good / bad active</div>
            <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{activePositiveGolden}/{activeNegativeGolden}</div>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">Diversity buckets</div>
            <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{diversityBucketCount}</div>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">Автосбор</div>
            <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{goldenCandidateCount ? "Есть кандидаты" : "Ожидает consensus"}</div>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400">Контроль</div>
            <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{goldenActiveCount ? "Активен" : "Bootstrap"}</div>
          </div>
        </div>
        {goldenNeedsActivation ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            Golden dataset еще не активен: система нашла {goldenCandidateCount} кандидатов с высоким согласием. Примите подходящие кейсы, чтобы включить скрытый контроль.
          </div>
        ) : null}
        {goldenBalanceWarning ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
            В active golden pool пока нет negative-кейсов. Для validation/control добавьте плохие примеры вручную, чтобы проверять не только принятие правильной разметки.
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr,1.1fr]">
          <div className="space-y-3">
            <input className="input-field" value={goldenFrameSearch} onChange={(event) => setGoldenFrameSearch(event.target.value)} placeholder="Search frames" />
            <div className="max-h-[520px] overflow-auto rounded-lg border border-gray-200 dark:border-gray-800">
              {(goldenSourceFramesQuery.data?.items ?? []).map((frame) => {
                const active = selectedGoldenFrame?.frame_id === frame.frame_id;
                return (
                  <button
                    key={frame.frame_id}
                    type="button"
                    className={`flex w-full gap-3 border-b border-gray-100 p-3 text-left text-sm last:border-b-0 dark:border-gray-800 ${active ? "bg-blue-50 dark:bg-blue-950" : "bg-white hover:bg-gray-50 dark:bg-gray-950 dark:hover:bg-gray-900"}`}
                    onClick={() => selectGoldenFrame(frame)}
                  >
                    <img src={frame.frame_url} alt={`Frame ${frame.frame_number}`} className="h-16 w-24 rounded object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">Frame {frame.frame_number}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{frame.golden_status || "none"} {frame.case_type ? `/${frame.case_type}` : ""}</div>
                    </div>
                  </button>
                );
              })}
              {goldenSourceFramesQuery.isLoading ? <div className="p-4"><LoadingSpinner size="sm" /></div> : null}
              {!goldenSourceFramesQuery.isLoading && (goldenSourceFramesQuery.data?.items ?? []).length === 0 ? (
                <div className="p-4 text-sm text-gray-500">No frames found.</div>
              ) : null}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="font-semibold text-gray-900 dark:text-white">Visual golden case</div>
            {selectedGoldenFrame ? (
              <div className="mt-3 space-y-3">
                <div className="overflow-hidden rounded bg-black">
                  <div className="relative">
                    <img src={selectedGoldenFrame.frame_url} alt={`Frame ${selectedGoldenFrame.frame_number}`} className="block h-auto w-full" />
                    {goldenBoxes.map((box, index) => (
                      <div
                        key={`${index}-${box.label}`}
                        className="absolute border-2 border-emerald-400"
                        style={{
                          left: `${(Number(box.x || 0) / Math.max(Number(selectedGoldenFrame.width || 1), 1)) * 100}%`,
                          top: `${(Number(box.y || 0) / Math.max(Number(selectedGoldenFrame.height || 1), 1)) * 100}%`,
                          width: `${(Number(box.width || 0) / Math.max(Number(selectedGoldenFrame.width || 1), 1)) * 100}%`,
                          height: `${(Number(box.height || 0) / Math.max(Number(selectedGoldenFrame.height || 1), 1)) * 100}%`,
                        }}
                      >
                        <span className="absolute -top-5 left-0 rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-white">{box.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <select className="input-field" value={goldenCaseType} onChange={(event) => setGoldenCaseType(event.target.value as "positive" | "negative")}>
                    <option value="positive">Good annotation</option>
                    <option value="negative">Bad annotation</option>
                  </select>
                  <select className="input-field" value={goldenIssueType} onChange={(event) => setGoldenIssueType(event.target.value)}>
                    <option value="manual_positive">manual_positive</option>
                    <option value="missing_box">missing_box</option>
                    <option value="bad_geometry">bad_geometry</option>
                    <option value="wrong_label">wrong_label</option>
                    <option value="extra_box">extra_box</option>
                    <option value="false_positive">false_positive</option>
                  </select>
                  <select className="input-field" value={goldenStatus} onChange={(event) => setGoldenStatus(event.target.value as "candidate" | "active")}>
                    <option value="candidate">Candidate</option>
                    <option value="active">Active</option>
                  </select>
                </div>
                <div className="space-y-2">
                  {goldenBoxes.map((box, index) => (
                    <div key={index} className="grid grid-cols-2 gap-2 md:grid-cols-6">
                      <input className="input-field" value={box.label} onChange={(event) => updateGoldenBox(index, { label: event.target.value })} placeholder="label" />
                      {(["x", "y", "width", "height"] as const).map((field) => (
                        <input key={field} className="input-field" type="number" value={box[field]} onChange={(event) => updateGoldenBox(index, { [field]: Number(event.target.value) } as Partial<GoldenBox>)} placeholder={field} />
                      ))}
                      <button type="button" className="btn-secondary" onClick={() => setGoldenBoxes((current) => current.filter((_, boxIndex) => boxIndex !== index))}>Remove</button>
                    </div>
                  ))}
                  <button type="button" className="btn-secondary" onClick={addGoldenBox}>Add box</button>
                </div>
                <div className="flex justify-end">
                  <button className="btn-primary" type="button" onClick={() => createVisualGoldenMutation.mutate()} disabled={createVisualGoldenMutation.isPending || (goldenCaseType === "positive" && goldenBoxes.length === 0)}>
                    {createVisualGoldenMutation.isPending ? "Saving..." : "Save golden case"}
                  </button>
                </div>
                {goldenCreateError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{goldenCreateError}</div> : null}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700">Select a frame to create or edit a golden case.</div>
            )}
          </div>
        </div>
        <div className="hidden">
          <div className="font-semibold text-gray-900 dark:text-white">Создать golden-кейс вручную</div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <input className="input-field" value={goldenFrameId} onChange={(event) => setGoldenFrameId(event.target.value)} placeholder="Frame ID" />
            <select className="input-field" value={goldenCaseType} onChange={(event) => setGoldenCaseType(event.target.value as "positive" | "negative")}>
              <option value="positive">Positive</option>
              <option value="negative">Negative</option>
            </select>
            <select className="input-field" value={goldenIssueType} onChange={(event) => setGoldenIssueType(event.target.value)}>
              <option value="manual_positive">manual_positive</option>
              <option value="missing_box">missing_box</option>
              <option value="bad_geometry">bad_geometry</option>
              <option value="wrong_label">wrong_label</option>
              <option value="extra_box">extra_box</option>
              <option value="false_positive">false_positive</option>
            </select>
            <select className="input-field" value={goldenStatus} onChange={(event) => setGoldenStatus(event.target.value as "candidate" | "active")}>
              <option value="candidate">Candidate</option>
              <option value="active">Active</option>
            </select>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <textarea className="input-field min-h-[120px] font-mono text-xs" value={goldenAnnotationJson} onChange={(event) => setGoldenAnnotationJson(event.target.value)} />
            <textarea className="input-field min-h-[120px] font-mono text-xs" value={goldenProbeJson} onChange={(event) => setGoldenProbeJson(event.target.value)} disabled={goldenCaseType === "positive"} />
          </div>
          <div className="mt-3 flex justify-end">
            <button className="btn-primary" type="button" onClick={() => createGoldenMutation.mutate()} disabled={createGoldenMutation.isPending || !goldenFrameId.trim()}>
              {createGoldenMutation.isPending ? "Создаем..." : "Создать golden-кейс"}
            </button>
          </div>
          {goldenCreateError ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{goldenCreateError}</div> : null}
        </div>
        {goldenCandidatesQuery.isLoading ? (
          <LoadingSpinner size="sm" />
        ) : goldenCandidates.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {goldenCandidates.slice(0, 8).map((candidate) => {
              const boxes = ((candidate.reference_annotation as any)?.boxes ?? []) as Array<{ x: number; y: number; width: number; height: number; label: string }>;
              const width = Math.max(Number(candidate.width || 1), 1);
              const height = Math.max(Number(candidate.height || 1), 1);
              const statusTone =
                candidate.status === "active"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                  : candidate.status === "retired"
                    ? "bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200";
              return (
                <div key={candidate.golden_frame_id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-gray-950">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">Frame {candidate.frame_number}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className={`rounded px-2 py-0.5 ${statusTone}`}>{candidate.status || (candidate.is_active ? "active" : "candidate")}</span>
                        <span>{candidate.case_type || "positive"}</span>
                        <span>{candidate.issue_type || "auto_consensus"}</span>
                        <span>score {Number(candidate.candidate_score || 0).toFixed(3)}</span>
                        <span>{candidate.candidate_source || "manual"}</span>
                      </div>
                    </div>
                    <a href={candidate.frame_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                      Open
                    </a>
                  </div>

                  <div className="mt-3 overflow-hidden rounded bg-black">
                    <div className="relative">
                      <img src={candidate.frame_url} alt={`Golden frame ${candidate.frame_number}`} className="block h-auto w-full" />
                      {boxes.map((box, index) => (
                        <div
                          key={`${candidate.golden_frame_id}-${index}`}
                          className="absolute border-2 border-emerald-400"
                          style={{
                            left: `${(Number(box.x || 0) / width) * 100}%`,
                            top: `${(Number(box.y || 0) / height) * 100}%`,
                            width: `${(Number(box.width || 0) / width) * 100}%`,
                            height: `${(Number(box.height || 0) / height) * 100}%`,
                          }}
                        >
                          <span className="absolute -top-5 left-0 rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-white">{box.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <div>Annotation pass: {Math.round(Number(candidate.stats?.annotation_pass_rate || 0) * 100)}% ({candidate.stats?.annotation_seen ?? 0})</div>
                    <div>Validation pass: {Math.round(Number(candidate.stats?.validation_pass_rate || 0) * 100)}% ({candidate.stats?.validation_seen ?? 0})</div>
                    <div>Expected: {candidate.expected_decision || "approve"}</div>
                    <div>Bucket: {candidate.diversity_bucket || "n/a"}</div>
                  </div>
                  {candidate.auto_candidate_reason ? <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{candidate.auto_candidate_reason}</div> : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={promoteGoldenMutation.isPending || candidate.status === "active"}
                      onClick={() => {
                        const notes = window.prompt("Notes for promotion", candidate.review_notes || "");
                        if (notes === null) return;
                        promoteGoldenMutation.mutate({ goldenFrameId: candidate.golden_frame_id, reviewNotes: notes });
                      }}
                    >
                      {candidate.status === "active" ? "Active" : "Promote"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={retireGoldenMutation.isPending || candidate.status === "retired"}
                      onClick={() => {
                        const notes = window.prompt("Why retire this golden item?", candidate.review_notes || "");
                        if (notes === null) return;
                        retireGoldenMutation.mutate({ goldenFrameId: candidate.golden_frame_id, reviewNotes: notes });
                      }}
                    >
                      {candidate.status === "retired" ? "Retired" : "Retire"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700">
            No golden candidates yet.
          </div>
        )}
      </div>

      {isValidationTask && !isValidationUpload ? (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Синхронизация исходного проекта</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Этот проект валидации создает задания из выбранного исходного проекта. Повторная синхронизация безопасна и пропускает уже импортированные элементы.
              </p>
            </div>
            <button className="btn-primary" type="button" onClick={() => syncWorkflowMutation.mutate()} disabled={syncWorkflowMutation.isPending}>
              {syncWorkflowMutation.isPending ? "Синхронизация..." : "Синхронизировать источник"}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <div className="text-xs text-gray-500 dark:text-gray-400">Статус</div>
              <div className="mt-1 font-semibold text-gray-900 dark:text-white">{sourceSync?.status || "not_synced"}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <div className="text-xs text-gray-500 dark:text-gray-400">Создано</div>
              <div className="mt-1 font-semibold text-gray-900 dark:text-white">{sourceSync?.created ?? 0}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <div className="text-xs text-gray-500 dark:text-gray-400">Пропущено</div>
              <div className="mt-1 font-semibold text-gray-900 dark:text-white">{sourceSync?.skipped ?? 0}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <div className="text-xs text-gray-500 dark:text-gray-400">Назначено</div>
              <div className="mt-1 font-semibold text-gray-900 dark:text-white">{taskType === "bbox_validation" ? bboxValidationAssigned : Number(overviewAny?.intervals?.validation_assigned || 0)}</div>
            </div>
          </div>
          {sourceSync?.errors?.length ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{sourceSync.errors.join("; ")}</div> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        {canUploadMedia ? <div className="card space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{taskCopy.importTitle}</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {taskCopy.importDescription}
            </p>
          </div>
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={(event) => setUploadQueue(Array.from(event.target.files ?? []))}
            disabled={!canUploadMedia}
            className="block w-full text-sm text-gray-600 dark:text-gray-300"
          />
          {isValidationUpload ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Файл разметки для валидации</label>
              <input
                type="file"
                accept=".json,.csv,application/json,text/csv"
                onChange={(event) => setValidationAnnotationFile(event.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-600 dark:text-gray-300"
              />
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Загрузите JSON или CSV с file_name/frame_uri и boxes; после финализации система создаст задания валидации из этой разметки.
              </div>
            </div>
          ) : null}
          {uploadQueue.length > 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-800 dark:bg-gray-950">
              {uploadQueue.map((file) => (
                <div key={file.name} className="flex items-center justify-between py-1">
                  <span>{file.name}</span>
                  <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" type="button" onClick={() => uploadMutation.mutate()} disabled={!canUploadMedia || uploadMutation.isPending || uploadQueue.length === 0 || (isValidationUpload && !validationAnnotationFile && !readyImportId)}>
              {uploadMutation.isPending ? "Загружаем..." : "Загрузить для предпросмотра"}
            </button>
            <button className="btn-secondary" type="button" onClick={() => finalizeMutation.mutate()} disabled={!canUploadMedia || !readyImportId || finalizeMutation.isPending}>
              {finalizeMutation.isPending ? "Финализируем..." : "Финализировать импорт"}
            </button>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              {hasVideoAssets
              ? "Для видео первый этап стартует сразу после успешной загрузки: выбранные исполнители получают задачи на интервалы. «Финализировать импорт» нужно позже для импортов только изображений или ручной догенерации bbox-задач по уже утвержденным интервалам."
              : taskType === "image_annotation"
                  ? "Для разметки изображений после предпросмотра нажмите «Финализировать импорт», чтобы создать задания."
                  : isValidationUpload
                    ? "Для загрузочной валидации загрузите медиа вместе с файлом разметки, проверьте предпросмотр и финализируйте импорт."
                  : canUploadMedia
                  ? "Для изображений после предпросмотра финализируйте импорт, чтобы создать bbox-задания для выбранных исполнителей."
                  : "Для этого типа проекта импорт медиа не используется."}
          </div>
          {uploadError ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{uploadError}</div> : null}
          {finalizeError ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{finalizeError}</div> : null}
          {lastUploadPreview ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
              <div>Обработано файлов: {lastUploadPreview.assets_processed}</div>
              <div>Ошибок обработки: {lastUploadPreview.assets_failed}</div>
              <div>Найдено кадров: {lastUploadPreview.frames_total}</div>
              {lastUploadPreview.cleanup ? (
                <div className="mt-2">
                  Очистка: удалено дублей {lastUploadPreview.cleanup.duplicates_removed ?? 0}, удалено некорректных кадров {lastUploadPreview.cleanup.invalid_frames_removed ?? 0}
                </div>
              ) : null}
              {lastUploadPreview.validation_annotations ? (
                <div className="mt-2">
                  Разметка для валидации: {lastUploadPreview.validation_annotations.items_total} элементов, {lastUploadPreview.validation_annotations.boxes_total} рамок, {lastUploadPreview.validation_annotations.intervals_total} интервалов
                </div>
              ) : null}
              {lastUploadPreview.ffmpeg ? (
                <div className={`mt-2 ${lastUploadPreview.ffmpeg.available ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                  ffmpeg: {String(lastUploadPreview.ffmpeg.message || "")}
                </div>
              ) : null}
              {lastUploadPreview.errors.length > 0 ? <div className="mt-2">Ошибки: {lastUploadPreview.errors.join("; ")}</div> : null}
            </div>
          ) : null}
        </div> : null}

        <div className="card space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Конфигурация workflow</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Актуальные настройки и отчетность зависят от типа задачи.</p>
          </div>
          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <div>Метки: {projectQuery.data.label_schema.map((item) => item.name).join(", ") || "—"}</div>
            <div>Синхронизация источника: {sourceSync?.status || "not_required"}</div>
            {sourceSync?.required ? (
              <div>
                Элементы источника: создано {sourceSync.created}, пропущено {sourceSync.skipped}
                {sourceSync.errors.length ? `, ошибки ${sourceSync.errors.join("; ")}` : ""}
              </div>
            ) : null}
            {isIntervalProject ? <div>Всего интервалов: {Number(overviewAny?.intervals?.total || 0)}</div> : <div>Интервал кадров: {projectQuery.data.frame_interval_sec}с</div>}
            {isIntervalProject ? <div>Принятые интервалы: {Number(overviewAny?.intervals?.approved || 0)}</div> : <div>Исполнителей на задание: {projectQuery.data.assignments_per_task}</div>}
            {isIntervalProject ? <div>Назначено на валидацию: {Number(overviewAny?.intervals?.validation_assigned || 0)}</div> : <div>Порог согласия: {projectQuery.data.agreement_threshold}</div>}
            {isIntervalProject ? <div>Отправлено на валидацию: {Number(overviewAny?.intervals?.validation_submitted || 0)}</div> : <div>Порог IoU: {projectQuery.data.iou_threshold}</div>}
            {isIntervalProject ? <div>Согласие: {String(overviewAny?.intervals?.average_validation_agreement ?? 0)}</div> : null}
            <div>Область назначений: {String(projectQuery.data.participant_rules?.assignment_scope || "selected_only")}</div>
            <div>AI предразметка: {projectQuery.data.participant_rules?.ai_prelabel_enabled === false ? "выключена" : "включена"}</div>
            <div>AI модель: {String(projectQuery.data.participant_rules?.ai_model || "baseline-box-v1")}</div>
            <div>AI уверенность: {String(projectQuery.data.participant_rules?.ai_confidence_threshold ?? 0.7)}</div>
            <div>Интервал ключевых кадров: {String(projectQuery.data.participant_rules?.video_keyframe_interval ?? 1)}</div>
            <div>Трекинг (baseline): {String(projectQuery.data.participant_rules?.tracking_algorithm || "CSRT")}</div>
            <div>Размер пакета заданий: {String(projectQuery.data.participant_rules?.task_batch_size ?? 10)}</div>
            <div>Минимум последовательных кадров: {String(projectQuery.data.participant_rules?.min_sequence_size ?? 3)}</div>
            <div>Размер пула исполнителей: {projectQuery.data.allowed_annotator_ids.length}</div>
            {isBBoxProject ? <div>Создано workflow-пакетов: {String(overview?.work_items?.workflow_batches_total ?? 0)}</div> : null}
            {isBBoxProject ? <div>Кадры готовы к валидации: {String(overview?.work_items?.validation_ready_items ?? 0)}</div> : null}
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-800 dark:bg-gray-950">
            <div className="font-medium text-gray-900 dark:text-white">Инструкция</div>
            <div className="mt-2 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{projectQuery.data.instructions || "Инструкция пока не добавлена."}</div>
            {projectQuery.data.instructions_file_uri ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white p-3 text-xs dark:border-gray-800 dark:bg-gray-950">
                <div className="text-gray-600 dark:text-gray-400">
                  Файл: <Link className="text-blue-600 hover:underline dark:text-blue-400" to={`/projects/${projectId}/instructions`}>{projectQuery.data.instructions_file_name || "instruction"}</Link>
                </div>
                <div className="text-gray-500 dark:text-gray-400">
                  v{projectQuery.data.instructions_version ?? 0}{projectQuery.data.instructions_updated_at ? ` · ${new Date(projectQuery.data.instructions_updated_at).toLocaleString()}` : ""}
                </div>
              </div>
            ) : null}
            {(user?.role === "customer" || user?.role === "admin") ? (
              <div className="mt-3 space-y-2">
                <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Загрузить файл инструкции (HTML/PDF/DOCX/MD/TXT)</div>
                <input
                  type="file"
                  accept=".html,.htm,.pdf,.docx,.md,.txt"
                  onChange={(event) => setInstructionFile((event.target.files?.[0] as File | undefined) ?? null)}
                  className="block w-full text-sm text-gray-600 dark:text-gray-300"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!instructionFile || instructionUploadMutation.isPending}
                    onClick={() => instructionUploadMutation.mutate()}
                  >
                    {instructionUploadMutation.isPending ? "Загрузка..." : "Загрузить новую версию"}
                  </button>
                </div>
                {instructionUploadError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{instructionUploadError}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Качество исполнителей</h2>
          {overviewQuery.isFetching ? <span className="text-sm text-gray-500">Обновляем...</span> : null}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="table min-w-full text-sm">
            <thead>
              <tr>
                <th className="py-2 pr-3 text-left">Исполнитель</th>
                <th className="py-2 pr-3 text-left">Рейтинг</th>
                <th className="py-2 pr-3 text-left">Открыто</th>
                <th className="py-2 pr-3 text-left">Отправлено</th>
                <th className="py-2 pr-3 text-left">Конфликты</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.annotators ?? []).map((annotator) => (
                <tr key={annotator.user_id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-3">{annotator.username}</td>
                  <td className="py-2 pr-3">{annotator.rating?.toFixed(2) ?? "0.00"}</td>
                  <td className="py-2 pr-3">{annotator.open_assignments}</td>
                  <td className="py-2 pr-3">{annotator.submitted_assignments}</td>
                  <td className="py-2 pr-3">{annotator.conflict_rate?.toFixed(2) ?? "0.00"}</td>
                </tr>
              ))}
              {(overview?.annotators ?? []).length === 0 ? (
                <tr>
                  <td className="py-4 text-gray-500" colSpan={5}>Исполнители пока не назначены.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Безопасность и аудит</h2>
          {securityEventsQuery.isFetching ? <span className="text-sm text-gray-500">Обновляем...</span> : null}
        </div>
        <div className="mt-4 space-y-2">
          {(securityEventsQuery.data?.items ?? []).slice(0, 10).map((event) => (
            <div key={event.id} className="rounded-lg border border-gray-200 p-3 text-xs dark:border-gray-800">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900 dark:text-white">{event.event_type}</span>
                <span className="text-gray-500">{new Date(event.created_at).toLocaleString()}</span>
              </div>
              <div className="mt-1 text-gray-500 dark:text-gray-400">важность: {event.severity}</div>
              <pre className="mt-2 max-h-24 overflow-auto rounded bg-gray-950 p-2 text-[11px] text-green-200">{JSON.stringify(event.payload, null, 2)}</pre>
            </div>
          ))}
          {(securityEventsQuery.data?.items ?? []).length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Событий пока нет.</div>
          ) : null}
        </div>
      </div>

      {exportPayload ? (
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Предпросмотр экспорта</h2>
          <pre className="mt-4 max-h-[420px] overflow-auto rounded-lg bg-gray-950 p-4 text-xs text-green-200">{exportPayload}</pre>
        </div>
      ) : null}
    </>
  );

  return (
    <div className="space-y-6">
      {canViewAnnotated ? (
        <>
          <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
            <nav className="-mb-px flex space-x-8">
              <button
                type="button"
                onClick={() => setActiveTab("overview")}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === "overview"
                  ? "border-primary-500 text-primary-600 dark:text-primary-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}
              >
                Обзор проекта
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("annotated")}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === "annotated"
                  ? "border-primary-500 text-primary-600 dark:text-primary-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}
              >
                Размеченные кадры
              </button>
            </nav>
          </div>

          {activeTab === "overview" && projectOverviewContent}
          {activeTab === "annotated" && (
            <div className="card">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Размеченные кадры</h2>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Кадры появляются сразу после отправки разметки исполнителем. Всего:{" "}
                    {customerGalleryTotal || "—"}
                    {publishablePendingItems > 0 ? ` · ждут одобрения: ${publishablePendingItems}` : ""}
                    {approvedExportItems > 0 ? ` · одобрено: ${approvedExportItems}` : ""}
                  </p>
                </div>
                {publishablePendingItems > 0 ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => approvePendingMutation.mutate()}
                    disabled={approvePendingMutation.isPending}
                  >
                    {approvePendingMutation.isPending ? "Одобряем..." : "Одобрить ожидающие"}
                  </button>
                ) : null}
              </div>
              <AnnotatedFramesGallery
                projectId={projectId!}
                isActive={activeTab === "annotated"}
                pendingValidationCount={publishablePendingItems}
                onApprovePending={() => approvePendingMutation.mutate()}
                isApproving={approvePendingMutation.isPending}
              />
            </div>
          )}
        </>
      ) : (
        projectOverviewContent
      )}
    </div>
  );
}
