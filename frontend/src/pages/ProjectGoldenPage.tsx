import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AnnotationCanvas, { type AnnotationCanvasHandle } from "../components/AnnotationCanvas";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { projectsAPI, workflowAPI } from "../services/api";
import { useAuthStore } from "../store";
import type { BoundingBox, GoldenCandidate, GoldenSourceFrame, Role } from "../types";
import { statusLabel } from "../lib/projectDisplay";

type CaseType = "positive" | "negative";
type GoldenStatus = "candidate" | "active";
type GoldenUsage = "control" | "instruction_example" | "both";
type ExpectedDecision = "approve" | "needs_changes";

type SiteNavItem = {
  to: string;
  label: string;
  roles: Role[];
};

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

const ISSUE_OPTIONS = [
  { value: "manual_positive", label: "Хороший пример" },
  { value: "manual_negative", label: "Плохой пример" },
  { value: "missing_box", label: "Пропущена рамка" },
  { value: "bad_geometry", label: "Плохая геометрия" },
  { value: "wrong_label", label: "Неверная метка" },
  { value: "extra_box", label: "Лишняя рамка" },
  { value: "false_positive", label: "Ложный объект" },
];

const toolbarButtonClass = "inline-flex h-10 min-w-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold leading-none text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:hover:bg-gray-900";

function boxesFromAnnotation(annotation?: Record<string, unknown>): BoundingBox[] {
  const rawBoxes = ((annotation as any)?.boxes ?? []) as Array<Partial<BoundingBox>>;
  return rawBoxes.map((box) => ({
    x: Number(box.x || 0),
    y: Number(box.y || 0),
    width: Number(box.width || 0),
    height: Number(box.height || 0),
    label: String(box.label || "object"),
  }));
}

function candidateToFrame(candidate: GoldenCandidate): GoldenSourceFrame {
  return {
    frame_id: candidate.frame_id,
    frame_url: candidate.frame_url,
    frame_number: candidate.frame_number,
    timestamp_sec: candidate.timestamp_sec,
    width: candidate.width,
    height: candidate.height,
    asset_id: candidate.asset_id,
    golden_frame_id: candidate.golden_frame_id,
    golden_status: candidate.status || (candidate.is_active ? "active" : "candidate"),
    case_type: candidate.case_type,
    issue_type: candidate.issue_type,
    reference_annotation: candidate.reference_annotation,
    candidate_score: candidate.candidate_score,
  };
}

function shortStatus(status?: string) {
  if (status === "active") return "В golden";
  if (status === "candidate") return "Кандидат";
  if (status === "retired") return "Удален";
  return "Не добавлен";
}

export default function ProjectGoldenPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const canvasRef = useRef<AnnotationCanvasHandle | null>(null);
  const [frameSearch, setFrameSearch] = useState("");
  const [selectedFrame, setSelectedFrame] = useState<GoldenSourceFrame | null>(null);
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [selectedBoxIndex, setSelectedBoxIndex] = useState<number | null>(null);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [caseType, setCaseType] = useState<CaseType>("positive");
  const [goldenStatus, setGoldenStatus] = useState<GoldenStatus>("candidate");
  const [usage, setUsage] = useState<GoldenUsage>("both");
  const [expectedDecision, setExpectedDecision] = useState<ExpectedDecision>("approve");
  const [issueType, setIssueType] = useState("manual_positive");
  const [reviewNotes, setReviewNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSiteMenuOpen, setIsSiteMenuOpen] = useState(false);
  const [isFrameListOpen, setIsFrameListOpen] = useState(true);
  const [isCasesPanelOpen, setIsCasesPanelOpen] = useState(true);

  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectsAPI.get(projectId!),
    enabled: !!projectId,
  });
  const framesQuery = useQuery({
    queryKey: ["project-golden-source-frames", projectId, frameSearch],
    queryFn: () => workflowAPI.goldenSourceFrames(projectId!, { search: frameSearch.trim() || undefined, limit: 120 }),
    enabled: !!projectId,
  });
  const candidatesQuery = useQuery({
    queryKey: ["project-golden-candidates", projectId],
    queryFn: () => workflowAPI.goldenCandidates(projectId!),
    enabled: !!projectId,
  });

  const project = projectQuery.data;
  const frames = useMemo(() => framesQuery.data?.items ?? [], [framesQuery.data?.items]);
  const candidates = candidatesQuery.data?.items ?? [];
  const labels = project?.label_schema ?? [];
  const canManage = user?.role === "admin" || user?.role === "customer";
  const activeCount = Number(candidatesQuery.data?.active_count ?? 0);
  const candidateCount = Number(candidatesQuery.data?.candidate_count ?? 0);
  const retiredCount = Number(candidatesQuery.data?.retired_count ?? 0);
  const visibleSiteNavItems = SITE_NAV_ITEMS.filter((item) => !user?.role || item.roles.includes(user.role));

  useEffect(() => {
    if (!selectedLabel && labels.length) {
      setSelectedLabel(labels[0].name);
    }
  }, [labels, selectedLabel]);

  useEffect(() => {
    if (caseType === "negative") {
      setExpectedDecision("needs_changes");
      if (issueType === "manual_positive") setIssueType("manual_negative");
      return;
    }
    setExpectedDecision("approve");
    if (issueType === "manual_negative") setIssueType("manual_positive");
  }, [caseType, issueType]);

  const selectFrame = (frame: GoldenSourceFrame) => {
    setSelectedFrame(frame);
    const nextBoxes = boxesFromAnnotation(frame.reference_annotation);
    setBoxes(nextBoxes);
    setSelectedBoxIndex(nextBoxes.length ? 0 : null);
    setCaseType((frame.case_type as CaseType) || "positive");
    setGoldenStatus(frame.golden_status === "active" ? "active" : "candidate");
    setIssueType(frame.issue_type || "manual_positive");
    setReviewNotes("");
    setError(null);
  };

  const selectCandidate = (candidate: GoldenCandidate) => {
    selectFrame(candidateToFrame(candidate));
    setUsage((candidate.usage as GoldenUsage) || "both");
    setExpectedDecision((candidate.expected_decision as ExpectedDecision) || "approve");
    setReviewNotes(candidate.review_notes || "");
  };

  const selectedCandidate = useMemo(
    () => candidates.find((item) => item.frame_id === selectedFrame?.frame_id),
    [candidates, selectedFrame?.frame_id],
  );
  const selectedFrameIndex = useMemo(
    () => frames.findIndex((frame) => frame.frame_id === selectedFrame?.frame_id),
    [frames, selectedFrame?.frame_id],
  );
  const canGoPrevFrame = selectedFrameIndex > 0;
  const canGoNextFrame = selectedFrameIndex >= 0 && selectedFrameIndex < frames.length - 1;

  const goToAdjacentFrame = (direction: -1 | 1) => {
    if (!frames.length) return;
    const currentIndex = selectedFrameIndex >= 0 ? selectedFrameIndex : 0;
    const nextIndex = Math.min(Math.max(currentIndex + direction, 0), frames.length - 1);
    const nextFrame = frames[nextIndex];
    if (nextFrame) selectFrame(nextFrame);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!projectId || !selectedFrame) throw new Error("Выберите кадр.");
      if (caseType === "positive" && boxes.length === 0) throw new Error("Для хорошего golden case нужна хотя бы одна рамка.");
      const reference = { boxes };
      return workflowAPI.createGoldenCandidate(projectId, {
        frame_id: selectedFrame.frame_id,
        case_type: caseType,
        usage,
        expected_decision: expectedDecision,
        issue_type: issueType,
        status: goldenStatus,
        reference_annotation: reference,
        probe_annotation: caseType === "negative" ? { boxes: [] } : reference,
        review_notes: reviewNotes,
      });
    },
    onSuccess: async (saved) => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["project-golden-candidates", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-golden-source-frames", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
      selectCandidate(saved);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || err?.message || "Не удалось сохранить golden case.");
    },
  });

  const promoteMutation = useMutation({
    mutationFn: ({ goldenFrameId, notes }: { goldenFrameId: string; notes?: string }) =>
      workflowAPI.promoteGoldenCandidate(projectId!, goldenFrameId, notes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-golden-candidates", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-golden-source-frames", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });

  const retireMutation = useMutation({
    mutationFn: ({ goldenFrameId, notes }: { goldenFrameId: string; notes?: string }) =>
      workflowAPI.retireGoldenCandidate(projectId!, goldenFrameId, notes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-golden-candidates", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-golden-source-frames", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });

  const addBox = () => {
    const label = selectedLabel || labels[0]?.name || "object";
    setBoxes((current) => [...current, { x: 0, y: 0, width: 100, height: 100, label }]);
    setSelectedBoxIndex(boxes.length);
  };

  if (projectQuery.isLoading) return <LoadingSpinner size="lg" />;

  if (!project || !canManage) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Golden dataset недоступен</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Управлять контрольными примерами может только заказчик или администратор.</p>
        <Link to={user?.role === "annotator" ? "/labeling" : `/projects/${projectId}`} className="btn-secondary mt-4 inline-block">
          Назад
        </Link>
      </div>
    );
  }

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
          <div className="truncate text-sm font-semibold">{project.title}</div>
          <div className="truncate text-xs text-gray-500 dark:text-gray-400">
            Golden dataset · {activeCount} active · {candidateCount} candidates · кадр {selectedFrame?.frame_number ?? "-"}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" className={toolbarButtonClass} onClick={() => setIsFrameListOpen((value) => !value)}>
            {isFrameListOpen ? "Кадры -" : "Кадры +"}
          </button>
          <button type="button" className={toolbarButtonClass} onClick={() => setIsCasesPanelOpen((value) => !value)}>
            {isCasesPanelOpen ? "Кейсы -" : "Кейсы +"}
          </button>
          <button
            type="button"
            className={toolbarButtonClass}
            onClick={() => goToAdjacentFrame(-1)}
            disabled={!canGoPrevFrame}
            title="Previous frame"
            aria-label="Previous frame"
          >
            ←
          </button>
          <button
            type="button"
            className={toolbarButtonClass}
            onClick={() => goToAdjacentFrame(1)}
            disabled={!canGoNextFrame}
            title="Next frame"
            aria-label="Next frame"
          >
            →
          </button>
          <button type="button" className={toolbarButtonClass} onClick={() => canvasRef.current?.setDrawTool()}>
            Draw
          </button>
          <button type="button" className={toolbarButtonClass} onClick={() => canvasRef.current?.setPanTool()}>
            Pan
          </button>
          <button type="button" className={toolbarButtonClass} onClick={() => canvasRef.current?.zoomOut()}>
            -
          </button>
          <button type="button" className={toolbarButtonClass} onClick={() => canvasRef.current?.zoomIn()}>
            +
          </button>
          <button type="button" className={toolbarButtonClass} onClick={() => canvasRef.current?.resetView()}>
            Fit
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-indigo-600 px-3 text-sm font-semibold leading-none text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedFrame || saveMutation.isPending || (caseType === "positive" && boxes.length === 0)}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Сохранение..." : selectedCandidate ? "Обновить" : "Сохранить"}
          </button>
          <Link to={`/projects/${projectId}`} className={toolbarButtonClass}>
            К проекту
          </Link>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[auto,minmax(0,1fr),auto] gap-2 overflow-hidden p-2 pt-0">
        {isFrameListOpen ? (
          <aside className="flex w-[280px] min-w-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="border-b border-gray-200 p-2.5 dark:border-gray-800">
              <input className="input-field" value={frameSearch} onChange={(event) => setFrameSearch(event.target.value)} placeholder="Поиск кадров" />
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{framesQuery.data?.items?.length ?? 0} кадров в списке</div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {frames.map((frame) => {
                const active = selectedFrame?.frame_id === frame.frame_id;
                return (
                  <button
                    key={frame.frame_id}
                    type="button"
                    onClick={() => selectFrame(frame)}
                    className={`block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 dark:border-gray-800 ${
                      active ? "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-100" : "hover:bg-gray-50 dark:hover:bg-gray-900"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">Кадр {frame.frame_number}</span>
                      <span className="text-xs text-gray-500">{shortStatus(frame.golden_status)}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {frame.case_type ? `${frame.case_type} · ` : ""}{frame.issue_type || "без типа"}
                    </div>
                  </button>
                );
              })}
              {framesQuery.isLoading ? <div className="p-4"><LoadingSpinner size="sm" /></div> : null}
              {!framesQuery.isLoading && frames.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">Кадры не найдены.</div>
              ) : null}
            </div>
          </aside>
        ) : null}

        <main className="flex min-w-0 flex-col overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-900">
          <div className="flex min-h-0 flex-1">
            <section className="flex min-h-0 min-w-0 flex-1 p-2">
              {selectedFrame ? (
                <div className="min-h-0 flex-1 overflow-hidden bg-gray-100 dark:bg-gray-900">
                  <AnnotationCanvas
                    ref={canvasRef}
                    imageUrl={selectedFrame.frame_url}
                    value={boxes}
                    labels={labels}
                    currentLabel={selectedLabel}
                    selectedBoxIndex={selectedBoxIndex}
                    fitPadding={40}
                    showBackdrop={false}
                    stageToImage
                    onSelectedBoxIndexChange={setSelectedBoxIndex}
                    onBoxesChange={setBoxes}
                  />
                </div>
              ) : (
                <div className="flex h-full min-h-[520px] items-center justify-center text-sm text-gray-300">
                  Выберите кадр слева, чтобы разметить golden case.
                </div>
              )}
            </section>
          </div>
          <div className="shrink-0 border-t border-gray-200 bg-white px-2 py-1.5 dark:border-gray-800 dark:bg-gray-950">
            <div className="flex flex-wrap items-center gap-2">
              {labels.map((label) => (
                <button
                  key={label.name}
                  type="button"
                  onClick={() => setSelectedLabel(label.name)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${selectedLabel === label.name ? "text-white" : "bg-gray-800 text-gray-200 hover:bg-gray-700"}`}
                  style={selectedLabel === label.name ? { backgroundColor: label.color || "#2563eb" } : undefined}
                >
                  {label.name}
                </button>
              ))}
              <button type="button" className="btn-secondary ml-auto" onClick={addBox} disabled={!selectedFrame}>
                Добавить рамку
              </button>
            </div>
          </div>
        </main>

        {isCasesPanelOpen ? (
          <aside className="flex w-[340px] min-w-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <div className="space-y-2.5 border-b border-gray-200 p-3 dark:border-gray-800">
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Настройки golden case</h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Тип, назначение и статус контрольного примера.</p>
                </div>
                <select className="input-field" value={caseType} onChange={(event) => setCaseType(event.target.value as CaseType)}>
                  <option value="positive">Хорошая разметка</option>
                  <option value="negative">Плохая разметка</option>
                </select>
                <select className="input-field" value={usage} onChange={(event) => setUsage(event.target.value as GoldenUsage)}>
                  <option value="control">Только контроль</option>
                  <option value="instruction_example">Только инструкция</option>
                  <option value="both">Контроль + инструкция</option>
                </select>
                <select className="input-field" value={goldenStatus} onChange={(event) => setGoldenStatus(event.target.value as GoldenStatus)}>
                  <option value="candidate">Кандидат</option>
                  <option value="active">Добавить в golden</option>
                </select>
                <select className="input-field" value={issueType} onChange={(event) => setIssueType(event.target.value)}>
                  {ISSUE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                  <div className="text-lg font-semibold">{activeCount}</div>
                  Active
                </div>
                <div className="rounded-md bg-blue-50 p-2 text-blue-700 dark:bg-blue-950 dark:text-blue-200">
                  <div className="text-lg font-semibold">{candidateCount}</div>
                  Candidate
                </div>
                <div className="rounded-md bg-gray-100 p-2 text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                  <div className="text-lg font-semibold">{retiredCount}</div>
                  Retired
                </div>
              </div>

              <textarea className="input-field min-h-[76px]" value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} placeholder="Комментарий к контрольному кейсу" />
              {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Существующие кейсы</h2>
              <div className="mt-3 space-y-2">
                {candidates.map((candidate) => (
                  <div key={candidate.golden_frame_id} className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">Кадр {candidate.frame_number}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {statusLabel(candidate.status)} · {candidate.case_type || "positive"} · {candidate.issue_type || "manual"}
                        </div>
                      </div>
                      <button type="button" className="text-sm text-blue-600 hover:underline dark:text-blue-400" onClick={() => selectCandidate(candidate)}>
                        Открыть
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={candidate.status === "active" || promoteMutation.isPending}
                        onClick={() => promoteMutation.mutate({ goldenFrameId: candidate.golden_frame_id, notes: candidate.review_notes })}
                      >
                        В golden
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={candidate.status === "retired" || retireMutation.isPending}
                        onClick={() => retireMutation.mutate({ goldenFrameId: candidate.golden_frame_id, notes: candidate.review_notes })}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
                {candidatesQuery.isLoading ? <LoadingSpinner size="sm" /> : null}
                {!candidatesQuery.isLoading && candidates.length === 0 ? <div className="text-sm text-gray-500">Golden cases пока нет.</div> : null}
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      {isSiteMenuOpen ? (
        <div className="fixed inset-0 z-[130] bg-black/45" onClick={() => setIsSiteMenuOpen(false)}>
          <nav
            className="h-full w-72 bg-white p-4 shadow-2xl dark:bg-gray-950"
            onClick={(event) => event.stopPropagation()}
          >
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
              <NavLink
                to={`/projects/${projectId}`}
                className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-900"
                onClick={() => setIsSiteMenuOpen(false)}
              >
                Текущий проект
              </NavLink>
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
