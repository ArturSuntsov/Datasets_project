import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { projectsAPI, workflowAPI, dawidSkeneAPI } from "../services/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuthStore } from "../store";
import { getTaskFlowCopy, getTaskGroupLabel } from "../lib/taskFlowCopy";
// ДОБАВЛЕНО: импорт компонента галереи и проверки роли
import { AnnotatedFramesGallery } from "../components/AnnotatedFramesGallery";
import { isCustomerRole } from "../utils/roles";

function DawidSkeneQuality({ projectId }: { projectId: string }) {
    const qualityQuery = useQuery({
        queryKey: ["dawid-skene-quality", projectId],
        queryFn: () => dawidSkeneAPI.getProjectQuality(projectId),
        enabled: !!projectId,
    });

    if (qualityQuery.isLoading) return <LoadingSpinner />;
    if (qualityQuery.isError || !qualityQuery.data) {
        return (
            <div className="card">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Annotator quality (Dawid-Skene)
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                    Quality metrics will appear after cross-check reviews are created.
                </p>
import type { ProjectExportArtifactName, ProjectExportFormat } from "../types";

function DawidSkeneQuality({ projectId }: { projectId: string }) {
  const qualityQuery = useQuery({
    queryKey: ["dawid-skene-quality", projectId],
    queryFn: () => dawidSkeneAPI.getProjectQuality(projectId),
    enabled: !!projectId,
  });

  if (qualityQuery.isLoading) return <LoadingSpinner />;
  if (qualityQuery.isError || !qualityQuery.data) {
    return (
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">📊 Качество разметки (Dawid‑Skene)</h2>
        <p className="mt-2 text-sm text-gray-500">Метрики появятся после создания проверок качества.</p>
      </div>
    );
  }

  const { annotators } = qualityQuery.data;

  return (
    <div className="card">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">📊 Качество разметки (Dawid‑Skene)</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Вероятностная EM-модель. Точность и матрица ошибок вычисляются на основе консенсуса аннотаторов.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {annotators.map((a) => (
          <div key={a.user_id} className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-gray-900 dark:text-white">{a.username}</div>
              <div className={`text-sm font-bold ${a.accuracy >= 0.7 ? "text-green-600" : a.accuracy >= 0.5 ? "text-yellow-600" : "text-red-600"}`}>
                Точность: {(a.accuracy * 100).toFixed(0)}%
              </div>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <MetricBadge label="F1‑score" value={a.f1?.toFixed(3) ?? "—"} />
              <MetricBadge label="Ошибок" value={`${(a.error_rate * 100).toFixed(1)}%`} />
              <MetricBadge label="Рейтинг" value={a.rating?.toFixed(2) ?? "—"} />
            </div>
        );
    }

    const { annotators } = qualityQuery.data;

    return (
        <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Annotator quality (Dawid-Skene)
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                EM-based probabilistic model. Accuracy and confusion matrix computed
                from cross-check consensus.
            </p>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {annotators.map((a) => (
                    <div
                        key={a.user_id}
                        className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950"
                    >
                        <div className="flex items-center justify-between">
                            <div className="font-semibold text-gray-900 dark:text-white">
                                {a.username}
                            </div>
                            <div
                                className={`text-sm font-bold ${a.accuracy >= 0.7
                                        ? "text-green-600"
                                        : a.accuracy >= 0.5
                                            ? "text-yellow-600"
                                            : "text-red-600"
                                    }`}
                            >
                                Acc: {(a.accuracy * 100).toFixed(0)}%
                            </div>
                        </div>

                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded bg-white p-2 dark:bg-gray-900">
                                <div className="text-gray-500">F1-score</div>
                                <div className="font-bold text-gray-900 dark:text-white">
                                    {a.f1?.toFixed(3) ?? "—"}
                                </div>
                            </div>
                            <div className="rounded bg-white p-2 dark:bg-gray-900">
                                <div className="text-gray-500">Error rate</div>
                                <div className="font-bold text-gray-900 dark:text-white">
                                    {(a.error_rate * 100).toFixed(1)}%
                                </div>
                            </div>
                            <div className="rounded bg-white p-2 dark:bg-gray-900">
                                <div className="text-gray-500">Rating</div>
                                <div className="font-bold text-gray-900 dark:text-white">
                                    {a.rating?.toFixed(2) ?? "—"}
                                </div>
                            </div>
                        </div>

                        {a.confusion_matrix && Object.keys(a.confusion_matrix).length > 0 ? (
                            <div className="mt-3">
                                <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                                    Confusion matrix (true → predicted):
                                </div>
                                <table className="w-full text-[11px]">
                                    <thead>
                                        <tr>
                                            <th className="text-left text-gray-500">True ↓ Pred →</th>
                                            {Object.keys(Object.values(a.confusion_matrix)[0] || {}).map((label) => (
                                                <th key={label} className="text-center text-gray-500">
                                                    {label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(a.confusion_matrix).map(([trueLabel, row]) => (
                                            <tr key={trueLabel}>
                                                <td className="font-medium text-gray-700 dark:text-gray-300">
                                                    {trueLabel}
                                                </td>
                                                {Object.entries(row).map(([predLabel, prob]) => (
                                                    <td
                                                        key={predLabel}
                                                        className={`text-center font-mono ${trueLabel === predLabel
                                                                ? Number(prob) >= 0.7
                                                                    ? "text-green-600"
                                                                    : "text-yellow-600"
                                                                : Number(prob) > 0.3
                                                                    ? "text-red-600"
                                                                    : "text-gray-400"
                                                            }`}
                                                    >
                                                        {((prob as number) * 100).toFixed(0)}%
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}

                        {a.rating_history && a.rating_history.length > 0 ? (
                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                Last {a.rating_history.length} tasks:{" "}
                                {a.rating_history.slice(0, 3).map((h, i) => (
                                    <span key={i} className="ml-1">
                                        {h.rating_delta >= 0 ? "↑" : "↓"}
                                        {Math.abs(h.rating_delta).toFixed(2)}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </div>
                ))}
            </div>
        </div>
    );
            {a.confusion_matrix && Object.keys(a.confusion_matrix).length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-medium text-gray-700 dark:text-gray-300">Матрица ошибок (истина → ответ):</div>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr>
                      <th className="text-left text-gray-500">Истина ↓ Ответ →</th>
                      {Object.keys(Object.values(a.confusion_matrix)[0] || {}).map((label) => (
                        <th key={label} className="text-center text-gray-500">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(a.confusion_matrix).map(([trueLabel, row]) => (
                      <tr key={trueLabel}>
                        <td className="font-medium text-gray-700 dark:text-gray-300">{trueLabel}</td>
                        {Object.entries(row).map(([predLabel, prob]) => (
                          <td
                            key={predLabel}
                            className={`text-center font-mono ${
                              trueLabel === predLabel
                                ? Number(prob) >= 0.7 ? "text-green-600" : "text-yellow-600"
                                : Number(prob) > 0.3 ? "text-red-600" : "text-gray-400"
                            }`}
                          >
                            {((prob as number) * 100).toFixed(0)}%
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {a.rating_history && a.rating_history.length > 0 && (
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Последние {a.rating_history.length} заданий:{" "}
                {a.rating_history.slice(0, 3).map((h, i) => (
                  <span key={i} className="ml-1">
                    {h.rating_delta >= 0 ? "↑" : "↓"}{Math.abs(h.rating_delta).toFixed(2)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-white p-2 dark:bg-gray-900">
      <div className="text-gray-500">{label}</div>
      <div className="font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

function groupLabel(taskType: string) {
  const map: Record<string, string> = {
    video_annotation: "Видео", video_interval_validation: "Видео",
    bbox_annotation: "BBox", bbox_validation: "BBox",
    text_annotation: "Текст", image_annotation: "Изображения",
    classification: "Классификация", comparison: "Сравнение",
  };
  return map[taskType] ?? taskType;
}

function taskTitle(taskType: string) {
  const map: Record<string, string> = {
    video_annotation: "Разметка интервалов", video_interval_validation: "Валидация интервалов",
    bbox_annotation: "BBox-разметка", bbox_validation: "BBox-валидация",
    text_annotation: "Текстовая разметка", image_annotation: "Разметка изображений",
    classification: "Классификация", comparison: "Сравнение",
  };
  return map[taskType] ?? taskType;
}

function taskDescription(taskType: string) {
  const map: Record<string, string> = {
    video_annotation: "Исполнители выделяют интервалы на загруженных видео.",
    video_interval_validation: "Исполнители проверяют интервалы из проекта-источника.",
    bbox_annotation: "Исполнители рисуют ограничивающие рамки на изображениях или кадрах.",
    bbox_validation: "Исполнители проверяют готовые рамки из проекта-источника.",
    text_annotation: "Исполнители вводят произвольный текст.",
    image_annotation: "Исполнители выбирают метки для изображений без рисования рамок.",
    classification: "Исполнители выбирают один класс из схемы меток.",
    comparison: "Исполнители выбирают между вариантом A и B.",
  };
  return map[taskType] ?? "";
}

export default function ProjectDetailPage() {
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const user = useAuthStore((s) => s.user);
    // ДОБАВЛЕНО: состояние активной вкладки и проверка роли
    const [activeTab, setActiveTab] = useState<"overview" | "annotated">("overview");
    const canViewAnnotated = isCustomerRole(user?.role);
    const [uploadQueue, setUploadQueue] = useState<File[]>([]);
    const [activeImportId, setActiveImportId] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [exportPayload, setExportPayload] = useState<string | null>(null);
    const [instructionFile, setInstructionFile] = useState<File | null>(null);
    const [instructionUploadError, setInstructionUploadError] = useState<string | null>(null);
    const [finalizeError, setFinalizeError] = useState<string | null>(null);
    const [exportFormat, setExportFormat] = useState<"coco" | "yolo" | "voc" | "csv" | "json" | "jsonl" | "both">("both");
    const [archiveError, setArchiveError] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [genericTasksInput, setGenericTasksInput] = useState("");
    const [genericTasksFile, setGenericTasksFile] = useState<File | null>(null);
    const [genericTasksError, setGenericTasksError] = useState<string | null>(null);

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
    const securityEventsQuery = useQuery({
        queryKey: ["project-security-events", projectId],
        queryFn: () => workflowAPI.securityEvents(projectId!),
        enabled: !!projectId,
    });
    const goldenCandidatesQuery = useQuery({
        queryKey: ["project-golden-candidates", projectId],
        queryFn: () => workflowAPI.goldenCandidates(projectId!),
        enabled: !!projectId,
    });

    const uploadMutation = useMutation({
        mutationFn: async () => {
            if (!projectId || uploadQueue.length === 0) {
                return null;
            }
            let currentImportId = activeImportId;
            let latest = null;
            for (const file of uploadQueue) {
                latest = await workflowAPI.upload(projectId, file, currentImportId);
                currentImportId = latest.import_id;
            }
            return latest;
        },
        onSuccess: (result) => {
            if (result?.import_id) {
                setActiveImportId(result.import_id);
            }
            setUploadQueue([]);
            setUploadError(result?.asset_status === "failed" ? result.error_message || "Video was uploaded, but processing failed." : null);
            queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
        },
        onError: (err: any) => {
            setUploadError(err.response?.data?.detail || err.response?.data?.error || err.message || "Upload failed");
        },
    });

    const finalizeMutation = useMutation({
        mutationFn: async () => {
            const importId = activeImportId || String(overviewQuery.data?.imports?.latest_ready_import_id || "");
            if (!projectId || !importId) {
                throw new Error("Nothing to finalize");
            }
            return workflowAPI.finalize(projectId, importId);
        },
        onSuccess: () => {
            setFinalizeError(null);
            queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
        },
        onError: (err: any) => {
            setFinalizeError(err?.response?.data?.detail || err?.response?.data?.error || "Finalize failed");
        },
    });

    const exportMutation = useMutation({
        mutationFn: async () => workflowAPI.export(projectId!, exportFormat),
        onSuccess: (payload) => {
            setExportPayload(JSON.stringify(payload, null, 2));
        },
    });

    const exportArchiveMutation = useMutation({
        mutationFn: async () => workflowAPI.exportArchive(projectId!, exportFormat),
        onSuccess: (blob) => {
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `project-${projectId}-${exportFormat}.zip`;
            anchor.click();
            URL.revokeObjectURL(url);
            setArchiveError(null);
        },
        onError: (err: any) => {
            setArchiveError(err?.response?.data?.detail || err?.message || "Archive export failed");
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
            await queryClient.invalidateQueries({ queryKey: ["project-security-events", projectId] });
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
            setDeleteError(err?.response?.data?.detail || err?.message || "Failed to delete project");
        },
    });

    const promoteGoldenMutation = useMutation({
        mutationFn: async ({ goldenFrameId, reviewNotes }: { goldenFrameId: string; reviewNotes?: string }) =>
            workflowAPI.promoteGoldenCandidate(projectId!, goldenFrameId, reviewNotes),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["project-golden-candidates", projectId] });
            await queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
            await queryClient.invalidateQueries({ queryKey: ["project-security-events", projectId] });
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
            await queryClient.invalidateQueries({ queryKey: ["project-security-events", projectId] });
        },
    });

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
    const isValidationTask = ["video_interval_validation", "bbox_validation"].includes(taskType);
    const canUploadMedia = ["bbox_annotation", "video_annotation", "image_annotation"].includes(taskType);
    const lastUploadPreview = uploadMutation.data?.preview;
    const readyImportId = activeImportId || String(overview?.imports?.latest_ready_import_id || "");
    const hasVideoAssets = Array.isArray(overview?.imports?.video_asset_ids) && overview.imports.video_asset_ids.length > 0;
    const totalWorkItems = Number(overview?.work_items?.total || 0);
    const completedWorkItems = Number(overview?.work_items?.completed || 0);
    const approvedExportItems = Number((overview?.work_items as any)?.validation_approved || 0);
    const validationPendingItems = Number((overview?.work_items as any)?.validation_pending || 0);
    const publishablePendingItems = Number(
        (overview?.work_items as any)?.publishable_pending ?? validationPendingItems
    );
    const customerGalleryTotal = Number((overview?.work_items as any)?.customer_gallery_total ?? 0);
    const validationDisputedItems = Number((overview?.work_items as any)?.validation_disputed || 0);
    const insufficientAnnotatorItems = Number((overview?.work_items as any)?.insufficient_annotators || 0);
    const insufficientValidatorItems = Number((overview?.work_items as any)?.insufficient_validators || 0);
    const exportBlockedItems = Math.max(0, totalWorkItems - approvedExportItems);
    const exportReadyPercent = totalWorkItems > 0 ? Math.round((approvedExportItems / totalWorkItems) * 100) : 0;
    const exportReady = approvedExportItems > 0;
    const goldenCandidates = goldenCandidatesQuery.data?.items ?? [];
    const goldenActiveCount = Number(goldenCandidatesQuery.data?.active_count ?? 0);
    const goldenCandidateCount = Number(goldenCandidatesQuery.data?.candidate_count ?? 0);
    const goldenRetiredCount = Number(goldenCandidatesQuery.data?.retired_count ?? 0);
    const overviewAny = overview as any;
    const bboxValidationAssigned = Number(overviewAny?.bbox_validation?.assigned || 0);
    const canDeleteProject = user?.role === "admin" || (user?.role === "customer" && projectQuery.data?.owner_id === user.id);
    const sourceSync = overview?.source_sync;
    const readinessGates = [
        { label: "Импорт готов", ready: Number(overview?.imports?.ready || 0) > 0 || Number(overview?.imports?.finalized || 0) > 0 },
        { label: "Интервалы размечаются", ready: Number(overviewAny?.intervals?.total || 0) > 0 || Number(overviewAny?.intervals?.validation_assigned || 0) > 0 },
        { label: "Интервалы валидируются", ready: Number(overviewAny?.intervals?.validation_assigned || 0) > 0 || Number(overviewAny?.intervals?.approved || 0) > 0 },
        { label: "BBox-разметка доступна", ready: Number(overview?.work_items?.total || 0) > 0 },
        { label: "BBox-валидация идет", ready: Number(overviewAny?.bbox_validation?.assigned || 0) > 0 || Number((overview?.work_items as any)?.validation_pending || 0) > 0 },
        { label: "Экспорт доступен", ready: exportReady },
    ];

    const completion = useMemo(() => {
        return totalWorkItems > 0 ? Math.round((completedWorkItems / totalWorkItems) * 100) : 0;
    }, [completedWorkItems, totalWorkItems]);

    if (projectQuery.isLoading) {
        return <LoadingSpinner size="lg" />;
    }

    if (!projectQuery.data) {
        const canTryDeleteMissingProject = user?.role === "customer" || user?.role === "admin";
        return (
            <div className="space-y-4">
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                    Project not found.
                </div>
                <div className="flex flex-wrap gap-3">
                    <Link to="/projects" className="btn-secondary">
                        Back to projects
                    </Link>
                    {canTryDeleteMissingProject && projectId ? (
                        <button
                            type="button"
                            className="btn-secondary border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                            disabled={deleteProjectMutation.isPending}
                            onClick={() => {
                                if (window.confirm("Remove this unavailable project from your workspace?")) {
                                    deleteProjectMutation.mutate();
                                }
                            }}
                        >
                            {deleteProjectMutation.isPending ? "Deleting..." : "Delete project"}
                        </button>
                    ) : null}
                </div>
                {deleteError ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{deleteError}</div> : null}
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  // Состояния
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const [activeImportId, setActiveImportId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<ProjectExportFormat>("both");
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [instructionFile, setInstructionFile] = useState<File | null>(null);
  const [instructionUploadError, setInstructionUploadError] = useState<string | null>(null);
  const [genericTasksInput, setGenericTasksInput] = useState("");
  const [genericTasksFile, setGenericTasksFile] = useState<File | null>(null);
  const [genericTasksError, setGenericTasksError] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<ProjectExportArtifactName>("validated_dataset");

  // Запросы
  const projectQuery = useQuery({ queryKey: ["project", projectId], queryFn: () => projectsAPI.get(projectId!), enabled: !!projectId });
  const overviewQuery = useQuery({ queryKey: ["project-overview", projectId], queryFn: () => workflowAPI.overview(projectId!), enabled: !!projectId });
  const securityQuery = useQuery({ queryKey: ["project-security-events", projectId], queryFn: () => workflowAPI.securityEvents(projectId!), enabled: !!projectId });
  const goldenQuery = useQuery({ queryKey: ["project-golden-candidates", projectId], queryFn: () => workflowAPI.goldenCandidates(projectId!), enabled: !!projectId });

  const genericTasksQuery = useQuery({
    queryKey: ["project-generic-tasks", projectId],
    queryFn: () => projectsAPI.genericTasks(projectId!),
    enabled: !!projectId && ["text_annotation", "image_annotation", "classification", "comparison"].includes(String(projectQuery.data?.task_type || "")),
  });

  // Мутации
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!projectId || uploadQueue.length === 0) return null;
      let currentImportId = activeImportId;
      let latest = null;
      for (const file of uploadQueue) {
        latest = await workflowAPI.upload(projectId, file, currentImportId);
        currentImportId = latest.import_id;
      }
      return latest;
    },
    onSuccess: (result) => {
      if (result?.import_id) setActiveImportId(result.import_id);
      setUploadQueue([]);
      setUploadError(result?.asset_status === "failed" ? result.error_message || "Ошибка загрузки видео" : null);
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
    onError: (err: any) => setUploadError(err?.response?.data?.detail || err?.message || "Ошибка загрузки"),
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const importId = activeImportId || String(overviewQuery.data?.imports?.latest_ready_import_id || "");
      if (!projectId || !importId) throw new Error("Нечего финализировать");
      return workflowAPI.finalize(projectId, importId);
    },
    onSuccess: () => {
      setFinalizeError(null);
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
    onError: (err: any) => setFinalizeError(err?.response?.data?.detail || err?.message || "Ошибка финализации"),
  });

  const exportMutation = useMutation({
    mutationFn: async () => workflowAPI.export(projectId!, exportFormat, artifact),
    onSuccess: (payload) => {
      const url = URL.createObjectURL(payload as unknown as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `project-${projectId}-${exportFormat}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const exportArchiveMutation = useMutation({
    mutationFn: async () => workflowAPI.exportArchive(projectId!, exportFormat, artifact),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `project-${projectId}-${exportFormat}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setArchiveError(null);
    },
    onError: (err: any) => setArchiveError(err?.message || "Ошибка экспорта"),
  });

  const syncMutation = useMutation({
    mutationFn: async () => workflowAPI.sync(projectId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-golden-candidates", projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => { if (!projectId) throw new Error("Нет ID проекта"); await projectsAPI.delete(projectId); },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["projects"] }); navigate("/projects"); },
    onError: async (err: any) => {
      if (isAxiosError(err) && err.response?.status === 404) { navigate("/projects"); return; }
      setDeleteError(err?.message || "Ошибка удаления");
    },
  });

  const instructionMutation = useMutation({
    mutationFn: async () => {
      if (!projectId || !instructionFile) throw new Error("Выберите файл");
      return projectsAPI.uploadInstructions(projectId, instructionFile);
    },
    onSuccess: async () => { setInstructionFile(null); setInstructionUploadError(null); await queryClient.invalidateQueries({ queryKey: ["project", projectId] }); },
    onError: (err: any) => setInstructionUploadError(err?.message || "Ошибка загрузки инструкции"),
  });

  const genericMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Нет ID проекта");
      if (genericTasksFile) { const fd = new FormData(); fd.append("file", genericTasksFile); return projectsAPI.createGenericTasks(projectId, fd); }
      return projectsAPI.createGenericTasks(projectId, { items: genericTasksInput });
    },
    onSuccess: async () => { setGenericTasksInput(""); setGenericTasksFile(null); setGenericTasksError(null); await queryClient.invalidateQueries({ queryKey: ["project-generic-tasks", projectId] }); },
    onError: (err: any) => setGenericTasksError(err?.message || "Ошибка создания заданий"),
  });

  // Вычисляемые значения
  const overview = overviewQuery.data;
  const taskType = String(projectQuery.data?.task_type || "bbox_annotation");
  const taskCopy = getTaskFlowCopy(taskType);
  const isGenericTask = ["text_annotation", "image_annotation", "classification", "comparison"].includes(taskType);
  const isGeneric = isGenericTask;
  const canUpload = ["bbox_annotation", "video_annotation", "image_annotation"].includes(taskType);
  const totalWI = Number(overview?.work_items?.total || 0);
  const totalWorkItems = totalWI;
  const completedWI = Number(overview?.work_items?.completed || 0);
  const completedWorkItems = completedWI;
  const approvedExport = Number((overview?.work_items as any)?.validation_approved || 0);
  const approvedExportItems = approvedExport;
  const validationPending = Number((overview?.work_items as any)?.validation_pending || 0);
  const validationPendingItems = validationPending;
  const validationDisputed = Number((overview?.work_items as any)?.validation_disputed || 0);
  const validationDisputedItems = validationDisputed;
  const insufficientAnnotators = Number((overview?.work_items as any)?.insufficient_annotators || 0);
  const insufficientAnnotatorItems = insufficientAnnotators;
  const insufficientValidators = Number((overview?.work_items as any)?.insufficient_validators || 0);
  const insufficientValidatorItems = insufficientValidators;
  const exportBlocked = Math.max(0, totalWI - approvedExport);
  const exportBlockedItems = exportBlocked;
  const exportReadyPercent = totalWI > 0 ? Math.round((approvedExport / totalWI) * 100) : 0;
  const exportReady = approvedExport > 0;
  const completion = totalWI > 0 ? Math.round((completedWI / totalWI) * 100) : 0;
  const canDelete = user?.role === "admin" || (user?.role === "customer" && projectQuery.data?.owner_id === user.id);
  const sourceSync = overview?.source_sync;
  const lastPreview = uploadMutation.data?.preview;
  const readyImportId = activeImportId || String(overview?.imports?.latest_ready_import_id || "");
  const hasVideoAssets = Array.isArray(overview?.imports?.video_asset_ids) && overview.imports.video_asset_ids.length > 0;
  const goldenCandidates = goldenQuery.data?.items ?? [];
  const goldenActiveCount = Number(goldenQuery.data?.active_count ?? 0);
  const goldenCandidateCount = Number(goldenQuery.data?.candidate_count ?? 0);
  const goldenRetiredCount = Number(goldenQuery.data?.retired_count ?? 0);
  const overviewAny = overview as any;
  const bboxValidationAssigned = Number(overviewAny?.bbox_validation?.assigned || 0);
  const canUploadMedia = canUpload;
  
  const fallbackReadinessGates = [
    { label: "Импорт готов", ready: Number(overview?.imports?.ready || 0) > 0 || Number(overview?.imports?.finalized || 0) > 0 },
    { label: "Интервалы размечаются", ready: Number((overview as any)?.intervals?.total || 0) > 0 },
    { label: "Интервалы валидируются", ready: Number((overview as any)?.intervals?.validation_assigned || 0) > 0 },
    { label: "BBox‑разметка доступна", ready: totalWI > 0 },
    { label: "BBox‑валидация идёт", ready: bboxValidationAssigned > 0 || validationPending > 0 },
    { label: "Экспорт доступен", ready: exportReady },
  ];
  
  const readinessGates = overview?.readiness_gates?.length ? overview.readiness_gates : fallbackReadinessGates;
  const nextAction = overview?.next_action;

  if (projectQuery.isLoading) return <LoadingSpinner size="lg" />;

  if (!projectQuery.data) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">Проект не найден.</div>
        <div className="flex flex-wrap gap-3">
          <Link to="/projects" className="btn-secondary">← К проектам</Link>
        </div>
        {deleteError ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{deleteError}</div> : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {projectQuery.data.project_type} / {groupLabel(taskType)} / {taskTitle(taskType)}
          </div>
          <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{projectQuery.data.title}</h1>
          <p className="mt-3 max-w-3xl text-sm text-gray-600 dark:text-gray-400">{projectQuery.data.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/projects/${projectId}/workflow`} className="btn-secondary">Настройка разметки</Link>
          {!isGenericTask && (
            <>
              <button className="btn-secondary" onClick={() => exportArchiveMutation.mutate()} disabled={exportArchiveMutation.isPending}>
                {exportArchiveMutation.isPending ? "Подготовка..." : exportReady ? "📥 Скачать датасет" : "📄 Отчёт"}
              </button>
            </>
          )}
          <button className="btn-secondary" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            {syncMutation.isPending ? "Синхронизация..." : "🔄 Синхронизировать"}
          </button>
          {canDelete && (
            <button
              className="btn-secondary border-red-200 text-red-700 hover:bg-red-50"
              onClick={() => { if (window.confirm("Удалить проект? Это действие необратимо.")) deleteMutation.mutate(); }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Удаление..." : "🗑️ Удалить"}
            </button>
          )}
        </div>
      </div>
      {deleteError && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{deleteError}</div>}

      {/* Источник данных */}
      {projectQuery.data.source_project_id && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
          📌 Источник данных: {projectQuery.data.source_project_title || projectQuery.data.source_project_id}. Нажмите «Синхронизировать», чтобы создать задания валидации.
        </div>
      )}

      {/* Карточка типа задания */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{groupLabel(taskType)} / {taskTitle(taskType)}</div>
            <h2 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{taskTitle(taskType)}</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{taskDescription(taskType)}</p>
          </div>
          {!isGeneric && (
            <Link to={`/labeling/projects/${projectId}`} className="btn-primary">Открыть разметку</Link>
          )}
        </div>
      </div>

      {/* Generic task setup */}
      {isGenericTask ? (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Generic task setup</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Создайте legacy Task-задания для этого проекта. Можно вставить строки вручную или загрузить CSV с колонками title, prompt, input_ref, option_a, option_b.
              </p>
            </div>
        );
    }

    // Весь оригинальный контент страницы (кроме внешнего <div className="space-y-6">) вынесен в переменную для повторного использования
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
                <div className="flex items-center gap-3">
                    <Link to={`/projects/${projectId}/workflow`} className="btn-secondary">
                        Настройка разметки
                    </Link>
                    {["video_annotation", "video_interval_validation"].includes(taskType) ? (
                        <Link to={`/projects/${projectId}/intervals`} className="btn-secondary">
                            Интервалы
                        </Link>
                    ) : null}
                    {!isGenericTask ? (
                        <>
                            <button className="btn-secondary" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
                                {exportMutation.isPending ? "Exporting..." : exportReady ? "Export dataset" : "Export report"}
                            </button>
                            <button className="btn-secondary" onClick={() => exportArchiveMutation.mutate()} disabled={exportArchiveMutation.isPending}>
                                {exportArchiveMutation.isPending ? "Preparing zip..." : exportReady ? "Download zip" : "Download report zip"}
                            </button>
                        </>
                    ) : null}
                    <button className="btn-secondary" onClick={() => syncWorkflowMutation.mutate()} disabled={syncWorkflowMutation.isPending}>
                        {syncWorkflowMutation.isPending ? "Syncing..." : "Sync workflow"}
                    </button>
                    {canDeleteProject ? (
                        <button
                            className="btn-secondary border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                            onClick={() => {
                                if (window.confirm("Удалить проект и все связанные задания/разметки? Это действие нельзя отменить.")) {
                                    deleteProjectMutation.mutate();
                                }
                            }}
                            disabled={deleteProjectMutation.isPending}
                        >
                            {deleteProjectMutation.isPending ? "Deleting..." : "Delete project"}
                        </button>
                    ) : null}
                </div>
            </div>
            {deleteError ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{deleteError}</div> : null}

            {projectQuery.data.source_project_id ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
                    Источник данных: {projectQuery.data.source_project_title || projectQuery.data.source_project_id}. Нажмите Sync workflow, чтобы материализовать задания валидации из source-проекта.
                </div>
            ) : null}

            <div className={`rounded-lg border p-4 ${taskCopy.group === "video" ? "border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100" : taskCopy.group === "bbox" ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "border-gray-200 bg-gray-50 text-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{getTaskGroupLabel(taskType)}</div>
                        <h2 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{taskCopy.projectTitle}</h2>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{taskCopy.projectDescription}</p>
                    </div>
                    {taskCopy.annotatorRoute ? (
                        <Link to={taskCopy.annotatorRoute(projectId!)} className="btn-primary">
                            {taskCopy.annotatorTitle}
                        </Link>
                    ) : null}
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
              disabled={genericMutation.isPending || (!genericTasksInput.trim() && !genericTasksFile)}
              onClick={() => genericMutation.mutate()}
            >
              {genericMutation.isPending ? "Creating..." : "Create generic tasks"}
            </button>
          </div>
          {genericTasksError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{genericTasksError}</div> : null}
          {genericMutation.data ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              Created {genericMutation.data.created}, skipped {genericMutation.data.skipped}, total {genericMutation.data.total}.
            </div>

            {isGenericTask ? (
                <div className="card space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Generic task setup</h2>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                Создайте legacy Task-задания для этого проекта. Можно вставить строки вручную или загрузить CSV с колонками title, prompt, input_ref, option_a, option_b.
                            </p>
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            Total: {Number(genericTasksQuery.data?.summary?.total || 0)} · Pending: {Number(genericTasksQuery.data?.summary?.pending || 0)} · Review: {Number(genericTasksQuery.data?.summary?.review || 0)}
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
                            {createGenericTasksMutation.isPending ? "Creating..." : "Create generic tasks"}
                        </button>
                    </div>
                    {genericTasksError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{genericTasksError}</div> : null}
                    {createGenericTasksMutation.data ? (
                        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                            Created {createGenericTasksMutation.data.created}, skipped {createGenericTasksMutation.data.skipped}, total {createGenericTasksMutation.data.total}.
                        </div>
                    ) : null}
                </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                <div className="card">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Frames</div>
                    <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{Number(overview?.imports?.frames_total ?? 0)}</div>
                </div>
                <div className="card">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Work items</div>
                    <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{totalWorkItems}</div>
                </div>
                <div className="card">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Export ready</div>
                    <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{approvedExportItems}/{totalWorkItems}</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{exportReadyPercent}% validated</div>
                </div>
                <div className="card">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Low-agreement requeue</div>
                    <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{Number(overview?.assignments?.disputed ?? 0)}</div>
                </div>
                <div className="card">
                    <div className="text-sm text-gray-500 dark:text-gray-400">Completion</div>
                    <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{completion}%</div>
                </div>
            </div>

            <div className={`rounded-lg border p-4 ${exportReadyPercent >= 80 ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold">Dataset export readiness</div>
                        <div className="mt-1 text-xs">
                            Export includes only approved bbox validation items. Annotation completion is {completion}%, but validated export readiness is {exportReadyPercent}%.
                        </div>
                    </div>
                    <div className="text-right text-sm">
                        <div className="font-semibold">{approvedExportItems} included / {exportBlockedItems} excluded</div>
                        <div className="text-xs opacity-80">pending {validationPendingItems}, disputed {validationDisputedItems}, insufficient {insufficientAnnotatorItems + insufficientValidatorItems}</div>
                    </div>
                </div>
            </div>

            <div className="card space-y-4">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Готовность workflow</h2>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        Выгрузка включает только кадры с завершенной bbox-разметкой и подтвержденной bbox-валидацией.
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
                        Экспорт станет доступен после появления хотя бы одного `validation_approved` кадра.
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
                        Sync complete: bbox assignments created {syncWorkflowMutation.data.sync.bbox_annotation_created}, interval assignments created {syncWorkflowMutation.data.sync.interval_annotation_created}, evaluated {syncWorkflowMutation.data.sync.evaluated_items}, bbox validation batches created {syncWorkflowMutation.data.sync.bbox_validation_created}.
                    </div>
                ) : null}
            </div>

            <div className="card space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Golden pool</h2>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                            Hidden quality-control set for annotation and validation. Active items are mixed into executor queues without visible labels.
                        </p>
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                        Active: {goldenActiveCount} · Candidates: {goldenCandidateCount} · Retired: {goldenRetiredCount}
                    </div>
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
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            disabled={promoteGoldenMutation.isPending || candidate.status === "active"}
                                            onClick={() => {
                                                const notes = window.prompt("Review notes for promotion", candidate.review_notes || "");
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

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr,0.8fr]">
                <div className="card space-y-4">
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
                        <button className="btn-primary" type="button" onClick={() => uploadMutation.mutate()} disabled={!canUploadMedia || uploadMutation.isPending || uploadQueue.length === 0}>
                            {uploadMutation.isPending ? "Uploading..." : "Upload to preview"}
                        </button>
                        <button className="btn-secondary" type="button" onClick={() => finalizeMutation.mutate()} disabled={!canUploadMedia || !readyImportId || finalizeMutation.isPending}>
                            {finalizeMutation.isPending ? "Finalizing..." : "Finalize import"}
                        </button>
                        <select
                            className="input-field w-auto"
                            value={exportFormat}
                            onChange={(event) => setExportFormat(event.target.value as "coco" | "yolo" | "voc" | "csv" | "json" | "jsonl" | "both")}
                        >
                            {isGenericTask ? <option value="both">Export: JSON + JSONL + CSV</option> : <option value="both">Export: COCO + YOLO + VOC + CSV</option>}
                            {isGenericTask ? <option value="json">Export: JSON</option> : null}
                            {isGenericTask ? <option value="jsonl">Export: JSONL</option> : null}
                            {!isGenericTask ? <option value="coco">Export: COCO</option> : null}
                            {!isGenericTask ? <option value="yolo">Export: YOLO</option> : null}
                            {!isGenericTask ? <option value="voc">Export: VOC</option> : null}
                            <option value="csv">Export: CSV</option>
                        </select>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                        {hasVideoAssets
                            ? "Для видео первый этап стартует сразу после успешной загрузки: выбранные исполнители получают задачи на интервалы. Finalize import нужен позже для image-only импортов или ручной догенерации bbox-задач по уже утвержденным интервалам."
                            : taskType === "image_annotation"
                                ? "Для image annotation нажмите Finalize import после preview, чтобы создать legacy Task-задания по загруженным изображениям."
                                : canUploadMedia
                                    ? "Для изображений нажмите Finalize import после preview, чтобы создать bbox-задачи для выбранных исполнителей."
                                    : "Для этого типа проекта импорт медиа не используется."}
                    </div>
                    {uploadError ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{uploadError}</div> : null}
                    {finalizeError ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{finalizeError}</div> : null}
                    {lastUploadPreview ? (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
                            <div>Processed assets: {lastUploadPreview.assets_processed}</div>
                            <div>Failed assets: {lastUploadPreview.assets_failed}</div>
                            <div>Frames detected: {lastUploadPreview.frames_total}</div>
                            {lastUploadPreview.cleanup ? (
                                <div className="mt-2">
                                    Cleanup: duplicates removed {lastUploadPreview.cleanup.duplicates_removed ?? 0}, invalid frames removed {lastUploadPreview.cleanup.invalid_frames_removed ?? 0}
                                </div>
                            ) : null}
                            {lastUploadPreview.ffmpeg ? (
                                <div className={`mt-2 ${lastUploadPreview.ffmpeg.available ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                                    ffmpeg: {String(lastUploadPreview.ffmpeg.message || "")}
                                </div>
                            ) : null}
                            {lastUploadPreview.errors.length > 0 ? <div className="mt-2">Errors: {lastUploadPreview.errors.join("; ")}</div> : null}
                        </div>
                    ) : null}
                    {archiveError ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{archiveError}</div> : null}
                </div>

                <div className="card space-y-4">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Workflow configuration</h2>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Live settings for import, routing, AI suggestions, and review quality control.</p>
                    </div>
                    <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                        <div>Labels: {projectQuery.data.label_schema.map((item) => item.name).join(", ") || "—"}</div>
                        <div>Source sync: {sourceSync?.status || "not_required"}</div>
                        {sourceSync?.required ? (
                            <div>
                                Source items: created {sourceSync.created}, skipped {sourceSync.skipped}
                                {sourceSync.errors.length ? `, errors ${sourceSync.errors.join("; ")}` : ""}
                            </div>
                        ) : null}
                        <div>Frame interval: {projectQuery.data.frame_interval_sec}s</div>
                        <div>Annotators per frame: {projectQuery.data.assignments_per_task}</div>
                        <div>Agreement threshold: {projectQuery.data.agreement_threshold}</div>
                        <div>IoU threshold: {projectQuery.data.iou_threshold}</div>
                        <div>Assignment scope: {String(projectQuery.data.participant_rules?.assignment_scope || "selected_only")}</div>
                        <div>AI pre-labeling: {projectQuery.data.participant_rules?.ai_prelabel_enabled === false ? "disabled" : "enabled"}</div>
                        <div>AI model: {String(projectQuery.data.participant_rules?.ai_model || "baseline-box-v1")}</div>
                        <div>AI confidence: {String(projectQuery.data.participant_rules?.ai_confidence_threshold ?? 0.7)}</div>
                        <div>Keyframe interval: {String(projectQuery.data.participant_rules?.video_keyframe_interval ?? 1)}</div>
                        <div>Tracking: {String(projectQuery.data.participant_rules?.tracking_algorithm || "CSRT")}</div>
                        <div>Task batch size: {String(projectQuery.data.participant_rules?.task_batch_size ?? 10)}</div>
                        <div>Min consecutive frames: {String(projectQuery.data.participant_rules?.min_sequence_size ?? 3)}</div>
                        <div>Annotator pool size: {projectQuery.data.allowed_annotator_ids.length}</div>
                        <div>Workflow batches created: {String(overview?.work_items?.workflow_batches_total ?? 0)}</div>
                        <div>Validation-ready frames: {String(overview?.work_items?.validation_ready_items ?? 0)}</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-800 dark:bg-gray-950">
                        <div className="font-medium text-gray-900 dark:text-white">Instructions</div>
                        <div className="mt-2 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{projectQuery.data.instructions || "No instructions added yet."}</div>
                        {projectQuery.data.instructions_file_uri ? (
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white p-3 text-xs dark:border-gray-800 dark:bg-gray-950">
                                <div className="text-gray-600 dark:text-gray-400">
                                    Файл: <a className="text-blue-600 hover:underline dark:text-blue-400" href={projectQuery.data.instructions_file_uri} target="_blank" rel="noreferrer">{projectQuery.data.instructions_file_name || "instruction"}</a>
                                </div>
                                <div className="text-gray-500 dark:text-gray-400">
                                    v{projectQuery.data.instructions_version ?? 0}{projectQuery.data.instructions_updated_at ? ` · ${new Date(projectQuery.data.instructions_updated_at).toLocaleString()}` : ""}
                                </div>
                            </div>
                        ) : null}
                        {(user?.role === "customer" || user?.role === "admin") ? (
                            <div className="mt-3 space-y-2">
                                <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Загрузить файл инструкции (PDF/DOCX/MD/TXT)</div>
                                <input
                                    type="file"
                                    accept=".pdf,.docx,.md,.txt"
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
      {/* Статистика */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <StatCard label="Кадры" value={Number(overview?.imports?.frames_total ?? 0)} />
        <StatCard label="Задания" value={totalWorkItems} />
        <StatCard label="Готово к экспорту" value={`${approvedExportItems}/${totalWorkItems}`} sub={`${exportReadyPercent}% проверено`} />
        <StatCard label="На доработку" value={Number(overview?.assignments?.disputed ?? 0)} />
        <StatCard label="Завершено" value={`${completion}%`} />
      </div>

      {/* Готовность экспорта */}
      <div className={`rounded-lg border p-4 ${exportReadyPercent >= 80 ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Готовность датасета к экспорту</div>
            <div className="mt-1 text-xs">Экспорт включает только одобренные кадры bbox‑валидации. Разметка завершена на {completion}%, готовность к экспорту — {exportReadyPercent}%.</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold">{approvedExportItems} включено / {exportBlockedItems} исключено</div>
            <div className="text-xs opacity-80">ожидает {validationPendingItems}, спорных {validationDisputedItems}, недостаточно {insufficientAnnotatorItems + insufficientValidatorItems}</div>
          </div>
        </div>
      </div>

      {/* Workflow pipeline */}
      <div className="card space-y-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">🔄 Готовность workflow</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {readinessGates.map((gate) => (
            <div key={gate.label} className={`rounded-lg border p-3 text-sm ${gate.ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-gray-50 text-gray-600"}`}>
              <div className="font-medium">{gate.label}</div>
              <div className="mt-1 text-xs">{gate.ready ? "✅ Готово" : "⏳ Ожидает"}</div>
            </div>
          ))}
        </div>
        {!exportReady && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Экспорт станет доступен после появления хотя бы одного проверенного кадра. Сейчас: ожидает валидации {validationPending}, назначено пакетов {bboxValidationAssigned}, спорных {validationDisputed}.
          </div>
        )}
      </div>

      {/* Golden pool */}
      <div className="card space-y-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">🏅 Golden pool</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">Скрытый набор эталонных кадров для контроля качества.</p>
        {goldenQuery.isLoading ? <LoadingSpinner size="sm" /> :
         (goldenCandidates.length === 0) ? <p className="text-sm text-gray-500">Пока нет эталонных кадров.</p> :
         <p className="text-sm">Активных: {goldenActiveCount} · Кандидатов: {goldenCandidateCount}</p>}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        {/* Импорт */}
        <div className="card space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">📤 Импорт изображений</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">Загрузите изображения или видео. Видео будет нарезано на кадры согласно настройкам.</p>
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={(event) => setUploadQueue(Array.from(event.target.files ?? []))}
            disabled={!canUploadMedia}
            className="block w-full text-sm text-gray-600 dark:text-gray-300"
          />
          {uploadQueue.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
              {uploadQueue.map((f) => (
                <div key={f.name} className="flex justify-between py-1">
                  <span>{f.name}</span>
                  <span>{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
            </div>

            <DawidSkeneQuality projectId={projectId!} />

            <div className="card">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Annotator quality snapshot</h2>
                    {overviewQuery.isFetching ? <span className="text-sm text-gray-500">Refreshing…</span> : null}
                </div>
                <div className="mt-4 overflow-x-auto">
                    <table className="table min-w-full text-sm">
                        <thead>
                            <tr>
                                <th className="py-2 pr-3 text-left">Annotator</th>
                                <th className="py-2 pr-3 text-left">Rating</th>
                                <th className="py-2 pr-3 text-left">Open</th>
                                <th className="py-2 pr-3 text-left">Submitted</th>
                                <th className="py-2 pr-3 text-left">Conflict rate</th>
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
                                    <td className="py-4 text-gray-500" colSpan={5}>No annotators assigned yet.</td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Security / audit events</h2>
                    {securityEventsQuery.isFetching ? <span className="text-sm text-gray-500">Refreshing…</span> : null}
                </div>
                <div className="mt-4 space-y-2">
                    {(securityEventsQuery.data?.items ?? []).slice(0, 10).map((event) => (
                        <div key={event.id} className="rounded-lg border border-gray-200 p-3 text-xs dark:border-gray-800">
                            <div className="flex items-center justify-between">
                                <span className="font-medium text-gray-900 dark:text-white">{event.event_type}</span>
                                <span className="text-gray-500">{new Date(event.created_at).toLocaleString()}</span>
                            </div>
                            <div className="mt-1 text-gray-500 dark:text-gray-400">severity: {event.severity}</div>
                            <pre className="mt-2 max-h-24 overflow-auto rounded bg-gray-950 p-2 text-[11px] text-green-200">{JSON.stringify(event.payload, null, 2)}</pre>
                        </div>
                    ))}
                    {(securityEventsQuery.data?.items ?? []).length === 0 ? (
                        <div className="text-sm text-gray-500 dark:text-gray-400">No events yet.</div>
                    ) : null}
                </div>
            </div>

            {exportPayload ? (
                <div className="card">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Export preview</h2>
                    <pre className="mt-4 max-h-[420px] overflow-auto rounded-lg bg-gray-950 p-4 text-xs text-green-200">{exportPayload}</pre>
                </div>
            ) : null}
        </>
    );

    // Основной рендер с учётом роли и активной вкладки
    return (
        <div className="space-y-6">
            {canViewAnnotated ? (
                <>
                    {/* Переключатель вкладок */}
                    <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
                        <nav className="-mb-px flex space-x-8">
                            <button
                                onClick={() => setActiveTab("overview")}
                                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === "overview"
                                        ? "border-primary-500 text-primary-600 dark:text-primary-400"
                                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                    }`}
                            >
                                Обзор проекта
                            </button>
                            <button
                                onClick={() => setActiveTab("annotated")}
                                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === "annotated"
                                        ? "border-primary-500 text-primary-600 dark:text-primary-400"
                                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                    }`}
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
                                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                        Размеченные кадры
                                    </h2>
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
          )}
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" onClick={() => uploadMutation.mutate()} disabled={!canUpload || uploadMutation.isPending || uploadQueue.length === 0}>
              {uploadMutation.isPending ? "Загрузка..." : "Загрузить"}
            </button>
            <button className="btn-secondary" onClick={() => finalizeMutation.mutate()} disabled={!canUpload || !readyImportId || finalizeMutation.isPending}>
              {finalizeMutation.isPending ? "Финализация..." : "Финализировать импорт"}
            </button>
            <div className="flex items-center gap-2">
              <select
                className="input-field w-auto"
                value={artifact}
                onChange={(e) => setArtifact(e.target.value as ProjectExportArtifactName)}
              >
                <option value="validated_dataset">Валидированный датасет</option>
                <option value="consensus_annotations">Консенсусные аннотации</option>
                <option value="raw_annotations">Сырые аннотации</option>
                <option value="validation_report">Отчёт о валидации</option>
              </select>
              <select
                className="input-field w-auto"
                value={exportFormat}
                onChange={(event) => setExportFormat(event.target.value as ProjectExportFormat)}
              >
                {isGenericTask ? <option value="both">JSON + JSONL + CSV</option> : <option value="both">COCO + YOLO + VOC + CSV</option>}
                {isGenericTask ? <option value="json">JSON</option> : null}
                {isGenericTask ? <option value="jsonl">JSONL</option> : null}
                {!isGenericTask ? <option value="coco">COCO</option> : null}
                {!isGenericTask ? <option value="yolo">YOLO</option> : null}
                {!isGenericTask ? <option value="voc">VOC</option> : null}
                <option value="csv">CSV</option>
              </select>
              <button className="btn-primary" onClick={() => exportArchiveMutation.mutate()} disabled={exportArchiveMutation.isPending}>
                {exportArchiveMutation.isPending ? "Экспорт..." : "Скачать"}
              </button>
            </div>
          </div>
          {!canUploadMedia && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Для этого типа проекта импорт медиа не используется.</div>}
          {uploadError && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{uploadError}</div>}
          {finalizeError && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{finalizeError}</div>}
          {archiveError && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{archiveError}</div>}
        </div>

        {/* Настройки */}
        <div className="card space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">⚙️ Настройки workflow</h2>
          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <div>Метки: {projectQuery.data.label_schema.map((l) => l.name).join(", ") || "—"}</div>
            <div>Синхронизация: {sourceSync?.status || "не требуется"}</div>
            <div>Интервал кадров: {projectQuery.data.frame_interval_sec}с</div>
            <div>Аннотаторов на кадр: {projectQuery.data.assignments_per_task}</div>
            <div>Порог согласия: {projectQuery.data.agreement_threshold}</div>
            <div>Порог IoU: {projectQuery.data.iou_threshold}</div>
            <div>AI-предразметка: {projectQuery.data.participant_rules?.ai_prelabel_enabled === false ? "выключена" : "включена"}</div>
            <div>Размер батча: {String(projectQuery.data.participant_rules?.task_batch_size ?? 10)}</div>
            <div>Аннотаторов в пуле: {projectQuery.data.allowed_annotator_ids.length}</div>
          </div>
        </div>
      </div>

      {/* Dawid-Skene */}
      <DawidSkeneQuality projectId={projectId!} />

      {/* Annotator snapshot */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">👥 Сводка по аннотаторам</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="table min-w-full text-sm">
            <thead>
              <tr>
                <th className="py-2 pr-3 text-left">Аннотатор</th>
                <th className="py-2 pr-3 text-left">Рейтинг</th>
                <th className="py-2 pr-3 text-left">Открыто</th>
                <th className="py-2 pr-3 text-left">Отправлено</th>
                <th className="py-2 pr-3 text-left">Конфликтов</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.annotators ?? []).map((a) => (
                <tr key={a.user_id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-3">{a.username}</td>
                  <td className="py-2 pr-3">{a.rating?.toFixed(2) ?? "0.00"}</td>
                  <td className="py-2 pr-3">{a.open_assignments}</td>
                  <td className="py-2 pr-3">{a.submitted_assignments}</td>
                  <td className="py-2 pr-3">{a.conflict_rate?.toFixed(2) ?? "0.00"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security events */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">🔒 Журнал событий</h2>
        <div className="mt-4 space-y-2">
          {(securityQuery.data?.items ?? []).slice(0, 10).map((ev) => (
            <div key={ev.id} className="rounded-lg border border-gray-200 p-3 text-xs dark:border-gray-800">
              <div className="flex justify-between">
                <span className="font-medium">{ev.event_type}</span>
                <span className="text-gray-500">{new Date(ev.created_at).toLocaleString()}</span>
              </div>
              <pre className="mt-2 max-h-24 overflow-auto rounded bg-gray-950 p-2 text-[11px] text-green-200">{JSON.stringify(ev.payload, null, 2)}</pre>
            </div>
          ))}
          {(securityQuery.data?.items ?? []).length === 0 && <p className="text-sm text-gray-500">Событий пока нет.</p>}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card">
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
    </div>
  );
}
