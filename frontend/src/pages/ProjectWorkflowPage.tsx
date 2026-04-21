import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { participantsAPI, projectsAPI, workflowAPI } from "../services/api";
import { Participant, Project, ProjectLabel, Role } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuthStore } from "../store";

function splitLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function joinLines(lines?: string[]): string {
  return (lines ?? []).join("\n");
}

function ensureUniqueLabelNames(labels: ProjectLabel[]): { ok: boolean; error?: string } {
  const seen = new Set<string>();
  for (const label of labels) {
    const key = (label.name || "").trim().toLowerCase();
    if (!key) return { ok: false, error: "Имя метки не может быть пустым." };
    if (seen.has(key)) return { ok: false, error: `Дубликат метки: ${label.name}` };
    seen.add(key);
  }
  return { ok: true };
}

function canEditProject(role?: Role): boolean {
  return role === "customer" || role === "admin";
}

export default function ProjectWorkflowPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [annotationType, setAnnotationType] = useState<Project["annotation_type"]>("bbox");
  const [frameInterval, setFrameInterval] = useState("1");
  const [assignmentsPerTask, setAssignmentsPerTask] = useState("2");
  const [agreementThreshold, setAgreementThreshold] = useState("0.75");
  const [iouThreshold, setIouThreshold] = useState("0.5");
  const [specialization, setSpecialization] = useState("");
  const [groupRule, setGroupRule] = useState("");
  const [labels, setLabels] = useState<ProjectLabel[]>([{ name: "drone" }]);
  const [selectedAnnotators, setSelectedAnnotators] = useState<string[]>([]);
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  const annotatorsQuery = useQuery({ queryKey: ["participants", "annotator"], queryFn: () => participantsAPI.list("annotator") });
  const reviewersQuery = useQuery({ queryKey: ["participants", "reviewer"], queryFn: () => participantsAPI.list("reviewer") });

  useEffect(() => {
    if (!projectQuery.data) return;
    const p = projectQuery.data;
    setAnnotationType(p.annotation_type);
    setFrameInterval(String(p.frame_interval_sec ?? 1));
    setAssignmentsPerTask(String(p.assignments_per_task ?? 2));
    setAgreementThreshold(String(p.agreement_threshold ?? 0.75));
    setIouThreshold(String(p.iou_threshold ?? 0.5));
    setSpecialization(String((p.participant_rules as any)?.specialization ?? ""));
    setGroupRule(String((p.participant_rules as any)?.group ?? ""));
    setLabels((p.label_schema?.length ? p.label_schema : [{ name: "drone" }]).map((l) => ({ ...l })));
    setSelectedAnnotators(p.allowed_annotator_ids ?? []);
    setSelectedReviewers(p.allowed_reviewer_ids ?? []);
  }, [projectQuery.data]);

  const hasWorkItems = useMemo(() => (overviewQuery.data?.work_items?.total ?? 0) > 0, [overviewQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Project id missing");
      const uniqueCheck = ensureUniqueLabelNames(labels);
      if (!uniqueCheck.ok) throw new Error(uniqueCheck.error || "Некорректная схема меток");
      const patch = {
        annotation_type: annotationType,
        frame_interval_sec: Number(frameInterval) || 1,
        assignments_per_task: Number(assignmentsPerTask) || 2,
        agreement_threshold: Number(agreementThreshold) || 0.75,
        iou_threshold: Number(iouThreshold) || 0.5,
        participant_rules: { specialization, group: groupRule },
        label_schema: labels,
        allowed_annotator_ids: selectedAnnotators,
        allowed_reviewer_ids: selectedReviewers,
      };
      return projectsAPI.update(projectId, patch);
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || "Не удалось сохранить настройки");
    },
  });

  const toggle = (id: string, current: string[], setter: (value: string[]) => void) => {
    setter(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const ParticipantSelector = ({
    title,
    items,
    selected,
    onToggle,
  }: {
    title: string;
    items: Participant[];
    selected: string[];
    onToggle: (id: string) => void;
  }) => (
    <div>
      <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{title}</div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {items.map((participant) => {
          const active = selected.includes(participant.id);
          return (
            <button
              key={participant.id}
              type="button"
              onClick={() => onToggle(participant.id)}
              className={`rounded-lg border p-3 text-left transition ${active ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30" : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-950"}`}
            >
              <div className="font-medium text-gray-900 dark:text-white">{participant.username}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{participant.specialization || "No specialization"} · rating {participant.rating?.toFixed(2) ?? "0.00"}</div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const addLabel = () => setLabels((current) => [...current, { name: "" }]);
  const removeLabel = (index: number) => setLabels((current) => current.filter((_, i) => i !== index));
  const updateLabel = (index: number, patch: Partial<ProjectLabel>) =>
    setLabels((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    saveMutation.mutate();
  };

  if (!canEditProject(user?.role)) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Настройка разметки</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Доступно только заказчику и администратору.</p>
        <Link to="/projects" className="btn-primary mt-5 inline-block">К проектам</Link>
      </div>
    );
  }

  if (projectQuery.isLoading) return <LoadingSpinner size="lg" />;

  if (!projectQuery.data) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Проект не найден</h1>
        <Link to="/projects" className="btn-primary mt-5 inline-block">К проектам</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Projects / {projectQuery.data.title}</div>
          <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">Настройка логики разметки</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Тип разметки, схема меток и параметры качества/распределения задач.</p>
        </div>
        <div className="flex gap-3">
          <button type="button" className="btn-secondary" onClick={() => navigate(`/projects/${projectId}`)}>
            Назад к проекту
          </button>
          <button type="button" className="btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>

      {hasWorkItems ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          В проекте уже созданы задания. Изменение схемы меток и параметров QC повлияет на последующие импорты и может усложнить консистентность результатов.
        </div>
      ) : null}

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="card space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Тип разметки</label>
              <select className="input-field" value={annotationType} onChange={(e) => setAnnotationType(e.target.value as any)}>
                <option value="bbox">BBox (ограничивающие рамки)</option>
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Сейчас поддерживается только bbox. Сегментация/полигоны можно добавить следующим шагом.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Шаг кадров, сек</label>
                <input type="number" min="0.1" step="0.1" className="input-field" value={frameInterval} onChange={(e) => setFrameInterval(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Исполнителей на задачу</label>
                <input type="number" min="1" step="1" className="input-field" value={assignmentsPerTask} onChange={(e) => setAssignmentsPerTask(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Agreement threshold</label>
                <input type="number" min="0" max="1" step="0.05" className="input-field" value={agreementThreshold} onChange={(e) => setAgreementThreshold(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">IoU threshold</label>
                <input type="number" min="0" max="1" step="0.05" className="input-field" value={iouThreshold} onChange={(e) => setIouThreshold(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Требуемая специализация</label>
                <input className="input-field" value={specialization} onChange={(e) => setSpecialization(e.target.value)} placeholder="aerial vision" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Требуемая группа</label>
                <input className="input-field" value={groupRule} onChange={(e) => setGroupRule(e.target.value)} placeholder="group-42" />
              </div>
            </div>
          </div>

          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">Схема меток</div>
                <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">Определения меток, правила принятия решений и примеры (по строкам).</div>
              </div>
              <button type="button" className="btn-secondary" onClick={addLabel}>Добавить метку</button>
            </div>
            <div className="space-y-3">
              {labels.map((label, index) => (
                <div key={index} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Имя</label>
                      <input className="input-field" value={label.name} onChange={(e) => updateLabel(index, { name: e.target.value })} placeholder="drone" />
                    </div>
                    <button type="button" className="btn-secondary" onClick={() => removeLabel(index)} disabled={labels.length <= 1}>
                      Удалить
                    </button>
                  </div>
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Описание</label>
                    <input className="input-field" value={label.description ?? ""} onChange={(e) => updateLabel(index, { description: e.target.value })} placeholder="Что считать объектом этого класса" />
                  </div>
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Правила (1 правило = 1 строка)</label>
                    <textarea
                      className="input-field min-h-[88px]"
                      value={joinLines(label.rules)}
                      onChange={(e) => updateLabel(index, { rules: splitLines(e.target.value) })}
                      placeholder={"- рамка должна быть плотной\n- размечать все видимые объекты\n- если сомневаешься — оставь комментарий"}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Примеры GOOD (1 строка = 1 пример)</label>
                      <textarea
                        className="input-field min-h-[88px]"
                        value={joinLines(label.examples?.good)}
                        onChange={(e) => updateLabel(index, { examples: { ...(label.examples ?? {}), good: splitLines(e.target.value) } })}
                        placeholder={"Дрон виден целиком\nДрон частично перекрыт, но распознаётся"}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Примеры BAD (1 строка = 1 пример)</label>
                      <textarea
                        className="input-field min-h-[88px]"
                        value={joinLines(label.examples?.bad)}
                        onChange={(e) => updateLabel(index, { examples: { ...(label.examples ?? {}), bad: splitLines(e.target.value) } })}
                        placeholder={"Птица/самолёт вместо дрона\nСлишком большая рамка захватывает фон"}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card space-y-5">
          <ParticipantSelector
            title="Пул аннотаторов (кому можно выдавать)"
            items={annotatorsQuery.data?.items ?? []}
            selected={selectedAnnotators}
            onToggle={(id) => toggle(id, selectedAnnotators, setSelectedAnnotators)}
          />
          <ParticipantSelector
            title="Пул ревьюеров"
            items={reviewersQuery.data?.items ?? []}
            selected={selectedReviewers}
            onToggle={(id) => toggle(id, selectedReviewers, setSelectedReviewers)}
          />
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={() => navigate(`/projects/${projectId}`)}>
            Отмена
          </button>
          <button type="submit" className="btn-primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Сохранение..." : "Сохранить настройки"}
          </button>
        </div>
      </form>
    </div>
  );
}

