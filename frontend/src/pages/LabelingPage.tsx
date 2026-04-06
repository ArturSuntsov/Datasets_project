import React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { datasetsAPI, tasksAPI } from "../services/api";
import { Annotation, AnnotateRequest, Dataset, Task } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";

function safeJsonParse(input: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const v = JSON.parse(input);
    if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, error: "label_data должен быть объектом" };
    return { ok: true, value: v as Record<string, unknown> };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "JSON parse error" };
  }
}

export function LabelingPage() {
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const [labelDataJson, setLabelDataJson] = React.useState<string>(() => JSON.stringify({ boxes: [] }, null, 2));
  const [labelError, setLabelError] = React.useState<string | null>(null);
  const [autoContextJson, setAutoContextJson] = React.useState<string>(() => JSON.stringify({ result: { boxes: [] } }, null, 2));

  const tasksQuery = useQuery({
    queryKey: ["labeling-tasks"],
    queryFn: () => tasksAPI.list({ limit: 50, offset: 0, status: "in_progress" }),
  });

  const tasks: Task[] = (tasksQuery.data as any)?.items ?? [];

  React.useEffect(() => {
    if (!selectedTaskId && tasks.length > 0) setSelectedTaskId(tasks[0].id);
  }, [selectedTaskId, tasks]);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  const datasetQuery = useQuery<Dataset>({
    queryKey: ["labeling-dataset", selectedTask?.dataset_id],
    queryFn: () => datasetsAPI.detail(selectedTask!.dataset_id),
    enabled: !!selectedTask?.dataset_id,
  });

  const annotationFormat = React.useMemo(() => {
    const expected = (datasetQuery.data?.metadata?.annotation_format as string | undefined) ?? "generic_v1";
    return expected;
  }, [datasetQuery.data]);

  const annotateMutation = useMutation({
    mutationFn: (vars: { is_final: boolean; auto_label: boolean }) => {
      if (!selectedTask) throw new Error("Task not selected");
      const parsed = safeJsonParse(labelDataJson);
      if (!parsed.ok) {
        setLabelError(parsed.error);
        throw new Error(parsed.error);
      }
      const autoParsed = safeJsonParse(autoContextJson);
      if (!autoParsed.ok) {
        // Для auto_label допускаем пустой контекст.
        setLabelError(autoParsed.error);
      }

      const body: AnnotateRequest = {
        label_data: parsed.value,
        is_final: vars.is_final,
        annotation_format: annotationFormat,
        auto_label: vars.auto_label,
        input_context: autoParsed.ok ? autoParsed.value : undefined,
      };
      return tasksAPI.annotate(selectedTask.id, body);
    },
    onSuccess: (data: Annotation) => {
      setLastAnnotation(data);
      setLabelError(null);
    },
  });

  const [lastAnnotation, setLastAnnotation] = React.useState<Annotation | null>(null);

  return (
    <div className="space-y-4">
      {tasksQuery.isLoading || datasetQuery.isLoading ? <LoadingSpinner /> : null}

      {tasksQuery.isError ? <div className="text-sm text-red-700">Ошибка загрузки задач</div> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-3 text-sm font-semibold">Выбор задачи</div>
          <select
            value={selectedTaskId ?? ""}
            onChange={(e) => setSelectedTaskId(e.target.value || null)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          >
            {tasks.length === 0 ? <option value="">Нет задач</option> : null}
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} ({t.dataset_id})
              </option>
            ))}
          </select>

          {selectedTask ? (
            <div className="mt-3 space-y-1 text-xs text-gray-600 dark:text-gray-300">
              <div>
                Статус: <span className="font-medium">{selectedTask.status}</span>
              </div>
              <div>
                difficulty: <span className="font-medium">{selectedTask.difficulty_score}</span>
              </div>
              <div>
                формат аннотаций: <span className="font-medium">{annotationFormat}</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="mb-3 text-sm font-semibold">Разметка (MVP JSON)</div>
            <div className="text-xs text-gray-600 dark:text-gray-300">
              Для соответствия формату используется `dataset.metadata.annotation_format`. В случае `generic_v1` сериализатор проверяет только непустой объект.
            </div>

            <textarea
              value={labelDataJson}
              onChange={(e) => setLabelDataJson(e.target.value)}
              className="mt-3 min-h-[240px] w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 font-mono text-xs outline-none focus:border-blue-500"
            />
            {labelError ? <div className="mt-2 text-xs text-red-700">{labelError}</div> : null}

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => annotateMutation.mutate({ is_final: false, auto_label: false })}
                disabled={!selectedTask || annotateMutation.isPending}
                className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
              >
                Сохранить черновик
              </button>
              <button
                type="button"
                onClick={() => annotateMutation.mutate({ is_final: true, auto_label: false })}
                disabled={!selectedTask || annotateMutation.isPending}
                className="rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-60"
              >
                Отправить на проверку
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="mb-2 text-sm font-semibold">AI-предразметка (MVP)</div>
            <div className="text-xs text-gray-600 dark:text-gray-300">
              Автопредсказание работает через backend stub. Мы отправляем `input_context` и сохраняем `predicted_data`.
            </div>

            <textarea
              value={autoContextJson}
              onChange={(e) => setAutoContextJson(e.target.value)}
              className="mt-3 min-h-[140px] w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 font-mono text-xs outline-none focus:border-blue-500"
            />

            <button
              type="button"
              onClick={() => annotateMutation.mutate({ is_final: false, auto_label: true })}
              disabled={!selectedTask || annotateMutation.isPending}
              className="mt-3 rounded-md bg-gray-700 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-600 disabled:opacity-60"
            >
              Авторазметка
            </button>

            {annotateMutation.isError ? (
              <div className="mt-2 text-xs text-red-700">Ошибка сохранения аннотации</div>
            ) : null}
          </div>

          {lastAnnotation ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
              <div className="mb-2 text-sm font-semibold">Последний результат</div>
              <div className="text-xs text-gray-600 dark:text-gray-300">prediction:</div>
              <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-gray-50 p-3 text-xs dark:bg-gray-900">
                {JSON.stringify(lastAnnotation.predicted_data ?? {}, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

