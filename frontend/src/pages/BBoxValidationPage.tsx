import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InstructionGate, InstructionPanel } from "../components/InstructionPanel";
import { annotatorAPI } from "../services/api";
import { useAuthStore } from "../store";
import type { Role } from "../types";

type Decision = "approve" | "needs_changes";
type FocusRect = { x: number; y: number; width: number; height: number } | null;
type ViewportSize = { width: number; height: number };
type NormalizedBox = { x: number; y: number; width: number; height: number; label?: string; color?: string };
type SiteNavItem = { to: string; label: string; roles: Role[] };

const SITE_NAV_ITEMS: SiteNavItem[] = [
  { to: "/", label: "Дашборд", roles: ["customer", "annotator", "admin"] },
  { to: "/projects", label: "Проекты", roles: ["customer", "admin"] },
  { to: "/tasks", label: "Задачи", roles: ["admin"] },
  { to: "/quality", label: "Качество", roles: ["customer", "admin"] },
  { to: "/labeling", label: "Разметка", roles: ["annotator", "admin"] },
  { to: "/datasets", label: "Датасеты", roles: ["annotator", "admin"] },
  { to: "/finance", label: "Финансы", roles: ["customer", "annotator", "admin"] },
  { to: "/profile", label: "Профиль", roles: ["customer", "annotator", "admin"] },
];

const toolbarButtonClass = "inline-flex h-10 min-w-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold leading-none text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function itemWidth(item: any) {
  return Math.max(Number(item?.width || item?.frame?.width || 1), 1);
}

function itemHeight(item: any) {
  return Math.max(Number(item?.height || item?.frame?.height || 1), 1);
}

function frameUrl(item: any) {
  return String(item?.frame_url || item?.frame_uri || item?.image_url || item?.url || "");
}

function questionKey(question: any) {
  return String(question?.question_id || question?.golden_id || question?.work_item_id || question?.frame_id || question?.id || "");
}

function rawBoxesFrom(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.boxes)) return value.boxes;
  if (Array.isArray(value.bboxes)) return value.bboxes;
  if (Array.isArray(value.annotations)) return value.annotations;
  if (value.label_data) return rawBoxesFrom(value.label_data);
  if (value.annotation) return rawBoxesFrom(value.annotation);
  return [];
}

function normalizeBox(raw: any, imageWidth: number, imageHeight: number): NormalizedBox | null {
  const source = Array.isArray(raw)
    ? { x: raw[0], y: raw[1], width: raw[2], height: raw[3] }
    : raw || {};
  let x = Number(source.x ?? source.left ?? source.x_min ?? source.x1 ?? 0);
  let y = Number(source.y ?? source.top ?? source.y_min ?? source.y1 ?? 0);
  let width = Number(source.width ?? source.w ?? 0);
  let height = Number(source.height ?? source.h ?? 0);
  const x2 = Number(source.x2 ?? source.right ?? source.x_max ?? Number.NaN);
  const y2 = Number(source.y2 ?? source.bottom ?? source.y_max ?? Number.NaN);

  if ((!width || !height) && Number.isFinite(x2) && Number.isFinite(y2)) {
    width = x2 - x;
    height = y2 - y;
  }

  if (Array.isArray(raw) && raw.length >= 4 && raw[2] > raw[0] && raw[3] > raw[1]) {
    const maybeWidth = Number(raw[2]) - x;
    const maybeHeight = Number(raw[3]) - y;
    if (maybeWidth > 0 && maybeHeight > 0 && (Number(raw[2]) > imageWidth || Number(raw[3]) > imageHeight)) {
      width = Number(raw[2]);
      height = Number(raw[3]);
    } else if (maybeWidth > 0 && maybeHeight > 0 && width > imageWidth * 0.8 && height > imageHeight * 0.8) {
      width = maybeWidth;
      height = maybeHeight;
    }
  }

  const values = [x, y, width, height].map(Math.abs);
  const looksNormalized = imageWidth > 10 && imageHeight > 10 && values.every((value) => value <= 1.0001);
  if (looksNormalized) {
    x *= imageWidth;
    y *= imageHeight;
    width *= imageWidth;
    height *= imageHeight;
  }

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 0) {
    x += width;
    width = Math.abs(width);
  }
  if (height < 0) {
    y += height;
    height = Math.abs(height);
  }
  if (width <= 0 || height <= 0) return null;

  const left = clamp(x, 0, imageWidth);
  const top = clamp(y, 0, imageHeight);
  const right = clamp(x + width, 0, imageWidth);
  const bottom = clamp(y + height, 0, imageHeight);
  if (right <= left || bottom <= top) return null;
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    label: String(source.label || source.class_name || source.category || ""),
    color: source.color,
  };
}

function boxesForQuestion(question: any, dimensions?: { width: number; height: number }): NormalizedBox[] {
  const width = dimensions?.width ?? itemWidth(question);
  const height = dimensions?.height ?? itemHeight(question);
  const candidates = [
    question?.candidate_annotation,
    question?.probe_annotation,
    question?.final_annotation,
    question?.label_data,
    question?.annotation,
    question,
  ];
  for (const candidate of candidates) {
    const boxes = rawBoxesFrom(candidate)
      .map((box) => normalizeBox(box, width, height))
      .filter(Boolean) as NormalizedBox[];
    if (boxes.length) return boxes;
  }
  return [];
}

function boxesBoundingRect(boxes: NormalizedBox[]): FocusRect {
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function paddedRect(rect: FocusRect, imageWidth: number, imageHeight: number): FocusRect {
  if (!rect) return null;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const targetWidth = Math.min(imageWidth, Math.max(rect.width * 4.5, imageWidth * 0.14));
  const targetHeight = Math.min(imageHeight, Math.max(rect.height * 4.5, imageHeight * 0.14));
  const left = clamp(centerX - targetWidth / 2, 0, Math.max(imageWidth - targetWidth, 0));
  const top = clamp(centerY - targetHeight / 2, 0, Math.max(imageHeight - targetHeight, 0));
  return { x: left, y: top, width: Math.max(targetWidth, 1), height: Math.max(targetHeight, 1) };
}

function useElementSize(ref: RefObject<HTMLElement>): ViewportSize {
  const [size, setSize] = useState<ViewportSize>({ width: 1, height: 1 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setSize({ width: Math.max(element.clientWidth, 1), height: Math.max(element.clientHeight, 1) });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [ref]);
  return size;
}

function clampPan(value: number, viewportSize: number, imageSize: number) {
  if (imageSize <= viewportSize) return (viewportSize - imageSize) / 2;
  return clamp(value, viewportSize - imageSize, 0);
}

function BoxFocusViewer({
  item,
  boxes,
}: {
  item: any;
  boxes: NormalizedBox[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageUrl = frameUrl(item);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const viewport = useElementSize(containerRef);
  const width = naturalSize?.width || itemWidth(item);
  const height = naturalSize?.height || itemHeight(item);
  const viewerBoxes = useMemo(() => {
    const normalized = boxesForQuestion(item, { width, height });
    return normalized.length ? normalized : boxes;
  }, [boxes, height, item, width]);
  const rect = boxesBoundingRect(viewerBoxes);
  const target = paddedRect(rect, width, height);
  const baseFitScale = Math.min(viewport.width / width, viewport.height / height);
  const targetScale = target ? Math.min(viewport.width / target.width, viewport.height / target.height) : baseFitScale;
  const scale = clamp(target ? targetScale : baseFitScale, baseFitScale * 0.5, baseFitScale * 8);
  const centerX = target ? target.x + target.width / 2 : width / 2;
  const centerY = target ? target.y + target.height / 2 : height / 2;
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const left = clampPan(viewport.width / 2 - centerX * scale, viewport.width, scaledWidth);
  const top = clampPan(viewport.height / 2 - centerY * scale, viewport.height, scaledHeight);

  useEffect(() => {
    setNaturalSize(null);
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <div ref={containerRef} className="relative h-full min-h-0 w-full overflow-hidden bg-gray-100 dark:bg-gray-900" style={{ overscrollBehavior: "contain" }}>
      {imageUrl && !imageFailed ? (
        <div
          className="absolute z-[1] bg-no-repeat"
          style={{
            left,
            top,
            width: scaledWidth,
            height: scaledHeight,
            backgroundImage: `url("${imageUrl.replace(/"/g, "%22")}")`,
            backgroundPosition: "center",
            backgroundSize: "100% 100%",
          }}
        />
      ) : null}
      <img
        src={imageUrl}
        alt={`Frame ${item.frame_number}`}
        className="pointer-events-none absolute z-0 select-none opacity-0"
        draggable={false}
        onLoad={(event) => {
          const image = event.currentTarget;
          setImageFailed(false);
          if (image.naturalWidth > 0 && image.naturalHeight > 0) {
            setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
          }
        }}
        onError={() => setImageFailed(true)}
        style={{ left, top, width: scaledWidth, height: scaledHeight }}
      />
      {!imageUrl ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
          Изображение кадра не найдено в задании.
        </div>
      ) : null}
      {imageUrl && imageFailed ? (
        <div className="absolute inset-0 z-[1] flex items-center justify-center p-6 text-center text-sm text-gray-500">
          Не удалось загрузить изображение кадра: {imageUrl}
        </div>
      ) : null}
      {viewerBoxes.map((box, index) => (
        <div
          key={`${questionKey(item)}-${index}`}
          className="absolute z-[2] border-2 border-emerald-400"
          style={{
            left: left + box.x * scale,
            top: top + box.y * scale,
            width: box.width * scale,
            height: box.height * scale,
            borderColor: box.color || "#34d399",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
          }}
        >
          {box.label ? <span className="absolute -top-6 left-0 rounded bg-black/80 px-2 py-0.5 text-xs text-white">{box.label}</span> : null}
        </div>
      ))}
    </div>
  );
}

export default function BBoxValidationPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [searchParams] = useSearchParams();
  const projectIdFilter = searchParams.get("projectId") || "";
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSiteMenuOpen, setIsSiteMenuOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(true);
  const [statusNotice, setStatusNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const queueQuery = useQuery({
    queryKey: ["bbox-validation-queue"],
    queryFn: () => annotatorAPI.bboxValidationQueue(),
  });
  const projectQuery = useQuery({
    queryKey: ["annotator-project-detail", projectIdFilter],
    queryFn: () => annotatorAPI.projectDetail(projectIdFilter),
    enabled: !!projectIdFilter,
  });

  const assignments = useMemo(
    () => (queueQuery.data?.items ?? []).filter((item: any) => !projectIdFilter || item.project_id === projectIdFilter),
    [queueQuery.data?.items, projectIdFilter],
  );
  const selectedAssignment = useMemo(
    () => assignments.find((item: any) => item.assignment_id === selectedAssignmentId) ?? assignments[0] ?? null,
    [assignments, selectedAssignmentId],
  );
  const questions = useMemo(() => selectedAssignment?.questions ?? selectedAssignment?.question_details ?? [], [selectedAssignment]);
  const orderedQuestions = useMemo(() => {
    if (!selectedAssignment) return questions;
    const lookup = new Map<string, any>();
    for (const question of questions) lookup.set(questionKey(question), question);
    const sequence = Array.isArray(selectedAssignment.sequence) ? selectedAssignment.sequence : [];
    const ordered = sequence.map((entry: any) => lookup.get(String(entry.id))).filter(Boolean);
    return ordered.length > 0 ? ordered : questions;
  }, [questions, selectedAssignment]);

  const currentQuestion = orderedQuestions[currentIndex] ?? null;
  const currentQuestionKey = questionKey(currentQuestion);
  const currentBoxes = useMemo(() => boxesForQuestion(currentQuestion), [currentQuestion]);
  const hasCurrentBoxes = currentBoxes.length > 0;
  const backToProject = projectIdFilter ? `/labeling/projects/${projectIdFilter}` : "/labeling";
  const allAnswered = orderedQuestions.length > 0 && orderedQuestions.every((question: any) => Boolean(decisions[questionKey(question)]));
  const instructionBundle = projectQuery.data?.instructions_bundle;
  const instructionsAcknowledged = instructionBundle?.acknowledgement?.acknowledged ?? !projectIdFilter;
  const visibleSiteNavItems = SITE_NAV_ITEMS.filter((item) => !user?.role || item.roles.includes(user.role));

  useEffect(() => {
    if (!statusNotice) return;
    const timeout = window.setTimeout(() => setStatusNotice(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [statusNotice]);

  useEffect(() => {
    if (!selectedAssignmentId && selectedAssignment?.assignment_id) {
      setSelectedAssignmentId(selectedAssignment.assignment_id);
      setCurrentIndex(0);
      setDecisions({});
    }
  }, [selectedAssignment?.assignment_id, selectedAssignmentId]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAssignment) throw new Error("Validation assignment not selected");
      if (!instructionsAcknowledged) throw new Error("Перед отправкой подтвердите чтение инструкции.");
      const realQuestions = orderedQuestions.filter((question: any) => !question.golden_id);
      const goldenQuestions = orderedQuestions.filter((question: any) => question.golden_id);
      const body = {
        decisions: Object.fromEntries(realQuestions.map((question: any) => [questionKey(question), decisions[questionKey(question)] ?? "approve"])),
        golden_decisions: Object.fromEntries(goldenQuestions.map((question: any) => [questionKey(question), decisions[questionKey(question)] ?? "approve"])),
      };
      return annotatorAPI.submitBBoxValidation(selectedAssignment.assignment_id, body);
    },
    onSuccess: async (result: any) => {
      if (result?.status === "rejected_by_golden") {
        await queryClient.invalidateQueries({ queryKey: ["bbox-validation-queue"] });
        await queryClient.invalidateQueries({ queryKey: ["annotator-project-detail", projectIdFilter] });
        if (projectIdFilter) navigate(`/projects/${projectIdFilter}/instructions`);
        return;
      }
      setSelectedAssignmentId(null);
      setDecisions({});
      setCurrentIndex(0);
      setStatusNotice({
        kind: "success",
        text: `Проверка отправлена. ${Number(result?.approved_items || 0)} элементов подтверждено, ${Number(result?.requeued_items || 0)} отправлено на доразметку.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["bbox-validation-queue"] });
      await queryClient.invalidateQueries({ queryKey: ["annotator-projects"] });
    },
    onError: (err: any) => {
      setStatusNotice({
        kind: "error",
        text: err?.response?.data?.detail || err?.response?.data?.error || err?.message || "Не удалось отправить валидацию.",
      });
    },
  });

  const selectAssignment = (assignmentId: string) => {
    setSelectedAssignmentId(assignmentId);
    setCurrentIndex(0);
    setDecisions({});
  };

  const setDecision = (decision: Decision) => {
    if (!currentQuestion) return;
    setDecisions((prev) => ({ ...prev, [currentQuestionKey]: decision }));
    setCurrentIndex((prev) => Math.min(orderedQuestions.length - 1, prev + 1));
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-white">
      <header className="relative z-[110] flex min-h-[60px] items-center gap-3 border-b border-gray-200 bg-white px-3 shadow-sm dark:border-gray-800 dark:bg-gray-950">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
          onClick={() => setIsSiteMenuOpen(true)}
          title="Разделы сайта"
          aria-label="Разделы сайта"
        >
          <span className="flex h-5 w-6 flex-col justify-between" aria-hidden="true">
            <span className="block h-0.5 rounded bg-current" />
            <span className="block h-0.5 rounded bg-current" />
            <span className="block h-0.5 rounded bg-current" />
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">Валидация объектов</div>
          <div className="truncate text-xs text-gray-500 dark:text-gray-400">
            {selectedAssignment?.project_title || projectQuery.data?.project_title || "BBox validation"} · кадр {currentQuestion?.frame_number ?? "-"} · {orderedQuestions.length ? `${currentIndex + 1}/${orderedQuestions.length}` : "0/0"}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {projectIdFilter ? <InstructionPanel projectId={projectIdFilter} bundle={instructionBundle} fallbackText={projectQuery.data?.instructions} compact /> : null}
          <button type="button" className={toolbarButtonClass} onClick={() => setIsQueueOpen((value) => !value)}>
            {isQueueOpen ? "Пакеты -" : "Пакеты +"}
          </button>
          <button type="button" className={toolbarButtonClass} onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))} disabled={!orderedQuestions.length || currentIndex <= 0}>
            ←
          </button>
          <button type="button" className={toolbarButtonClass} onClick={() => setCurrentIndex((prev) => Math.min(orderedQuestions.length - 1, prev + 1))} disabled={!orderedQuestions.length || currentIndex >= orderedQuestions.length - 1}>
            →
          </button>
          <button type="button" className={toolbarButtonClass} disabled={!hasCurrentBoxes}>
            К рамке
          </button>
          <button className={decisions[currentQuestionKey] === "approve" ? "inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-3 text-sm font-semibold leading-none text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50" : toolbarButtonClass} type="button" onClick={() => setDecision("approve")} disabled={!currentQuestion}>
            Принять
          </button>
          <button className={decisions[currentQuestionKey] === "needs_changes" ? "inline-flex h-10 items-center justify-center rounded-lg bg-red-600 px-3 text-sm font-semibold leading-none text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50" : toolbarButtonClass} type="button" onClick={() => setDecision("needs_changes")} disabled={!currentQuestion}>
            Отклонить
          </button>
          <Link className={toolbarButtonClass} to={backToProject}>
            К проекту
          </Link>
        </div>
      </header>

      {statusNotice ? (
        <div
          className={`mx-2 mt-2 shrink-0 rounded-lg border p-3 text-sm ${
            statusNotice.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
          }`}
        >
          {statusNotice.text}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[auto,minmax(0,1fr)] gap-2 overflow-hidden p-2 pt-0">
        {isQueueOpen ? (
          <aside className="flex w-[280px] min-w-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 p-2.5 dark:border-gray-800">
              <div className="text-sm font-semibold text-gray-900 dark:text-white">Пакеты валидации</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{assignments.length} задач · отмечено {Object.keys(decisions).length}/{orderedQuestions.length}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {assignments.map((item: any) => (
                <button
                  key={item.assignment_id}
                  className={`block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 dark:border-gray-800 ${
                    selectedAssignment?.assignment_id === item.assignment_id ? "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-100" : "hover:bg-gray-50 dark:hover:bg-gray-900"
                  }`}
                  onClick={() => selectAssignment(item.assignment_id)}
                  type="button"
                >
                  <div className="truncate font-medium text-gray-900 dark:text-white">{item.project_title}</div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Кадров: {item.total}</div>
                </button>
              ))}
              {assignments.length === 0 ? <div className="p-4 text-sm text-gray-500">Нет задач bbox-валидации.</div> : null}
            </div>
          </aside>
        ) : null}

        <main className="flex min-w-0 flex-col overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-900">
          {projectIdFilter && !instructionsAcknowledged ? (
            <div className="shrink-0 border-b border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
              <InstructionGate projectId={projectIdFilter} bundle={instructionBundle} fallbackText={projectQuery.data?.instructions} />
            </div>
          ) : null}

          <section className="flex min-h-0 min-w-0 flex-1 p-2">
            {selectedAssignment && currentQuestion ? (
              <BoxFocusViewer item={currentQuestion} boxes={currentBoxes} />
            ) : (
              <div className="flex h-full min-h-[520px] flex-1 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                Выберите пакет bbox-валидации.
              </div>
            )}
          </section>

          <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
              <span>Рамок: {currentBoxes.length}</span>
              <span>Отмечено: {Object.keys(decisions).length}/{orderedQuestions.length}</span>
              <button className="ml-auto inline-flex h-10 items-center justify-center rounded-lg bg-indigo-600 px-3 text-sm font-semibold leading-none text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending || !allAnswered || !instructionsAcknowledged}>
                {submitMutation.isPending ? "Отправка..." : "Отправить валидацию"}
              </button>
            </div>
          </div>
        </main>
      </div>

      {isSiteMenuOpen ? (
        <div className="fixed inset-0 z-[130] bg-black/45" onClick={() => setIsSiteMenuOpen(false)}>
          <nav className="h-full w-72 bg-white p-4 shadow-2xl dark:bg-gray-950" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="font-semibold text-gray-900 dark:text-white">Меню</div>
              <button type="button" className="btn-secondary" onClick={() => setIsSiteMenuOpen(false)}>
                Закрыть
              </button>
            </div>
            <div className="space-y-1">
              {visibleSiteNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `block rounded-md px-3 py-2 text-sm font-medium ${
                      isActive ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200" : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-900"
                    }`
                  }
                  onClick={() => setIsSiteMenuOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
