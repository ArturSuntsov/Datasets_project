import React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { datasetsAPI, qualityAPI } from "../services/api";
import { ApiListResponse, Dataset, QualityMetricsItem, QualityReviewRequest } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";

export function QualityPage() {
  const [datasetId, setDatasetId] = React.useState<string>("");

  const datasetsQuery = useQuery<ApiListResponse<Dataset>>({
    queryKey: ["quality-datasets"],
    queryFn: () => datasetsAPI.list({ limit: 200, offset: 0 }),
  });

  const metricsQuery = useQuery({
    queryKey: ["quality-metrics", datasetId],
    queryFn: () => qualityAPI.metrics(datasetId),
    enabled: !!datasetId,
  });

  const reviewMutation = useMutation({
    mutationFn: (body: QualityReviewRequest) => qualityAPI.createReview(body),
  });

  const [form, setForm] = React.useState<QualityReviewRequest>({
    task_id: "",
    annotation_a_id: "",
    annotation_b_id: "",
    arbitrator: null,
    arbitration_requested: false,
    arbitration_comment: null,
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="mb-2 text-sm font-semibold">Метрики качества</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <div className="text-xs text-gray-600 dark:text-gray-300">Dataset</div>
            <select
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
            >
              <option value="">Выберите датасет</option>
              {(datasetsQuery.data?.items ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.id})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            {metricsQuery.isLoading ? <LoadingSpinner label="Загрузка метрик..." /> : null}
          </div>
        </div>

        {metricsQuery.isError ? <div className="mt-2 text-sm text-red-700">Не удалось загрузить метрики</div> : null}

        {metricsQuery.data ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="py-2 pr-3">Task</th>
                  <th className="py-2 pr-3">Precision</th>
                  <th className="py-2 pr-3">Recall</th>
                  <th className="py-2 pr-3">F1</th>
                  <th className="py-2 pr-3">Дата</th>
                </tr>
              </thead>
              <tbody>
                {(metricsQuery.data.items as QualityMetricsItem[]).map((m) => (
                  <tr key={m.task_id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="py-2 pr-3 font-mono text-xs">{m.task_id}</td>
                    <td className="py-2 pr-3">{m.precision.toFixed(3)}</td>
                    <td className="py-2 pr-3">{m.recall.toFixed(3)}</td>
                    <td className="py-2 pr-3 font-semibold">{m.f1.toFixed(3)}</td>
                    <td className="py-2 pr-3 text-xs text-gray-600 dark:text-gray-300">{m.created_at ?? "—"}</td>
                  </tr>
                ))}
                {(metricsQuery.data.items ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-3 text-sm text-gray-600">
                      Нет метрик
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="mb-2 text-sm font-semibold">Кросс-проверка</div>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
            placeholder="task_id"
            value={form.task_id}
            onChange={(e) => setForm((s) => ({ ...s, task_id: e.target.value }))}
          />
          <input
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
            placeholder="annotation_a_id"
            value={form.annotation_a_id}
            onChange={(e) => setForm((s) => ({ ...s, annotation_a_id: e.target.value }))}
          />
          <input
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
            placeholder="annotation_b_id"
            value={form.annotation_b_id}
            onChange={(e) => setForm((s) => ({ ...s, annotation_b_id: e.target.value }))}
          />
          <input
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
            placeholder="arbitrator (user id, опционально)"
            value={form.arbitrator ?? ""}
            onChange={(e) => setForm((s) => ({ ...s, arbitrator: e.target.value ? e.target.value : null }))}
          />
        </div>

        <div className="mt-3 flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!form.arbitration_requested} onChange={(e) => setForm((s) => ({ ...s, arbitration_requested: e.target.checked }))} />
            Требовать арбитраж
          </label>
        </div>

        {form.arbitration_requested ? (
          <textarea
            className="mt-3 w-full min-h-[90px] rounded-md border border-gray-300 p-3 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
            placeholder="Комментарий арбитра"
            value={form.arbitration_comment ?? ""}
            onChange={(e) => setForm((s) => ({ ...s, arbitration_comment: e.target.value || null }))}
          />
        ) : null}

        <div className="mt-3">
          <button
            type="button"
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            disabled={reviewMutation.isPending}
            onClick={() => reviewMutation.mutate(form)}
          >
            Создать проверку
          </button>
        </div>

        {reviewMutation.isError ? <div className="mt-2 text-sm text-red-700">Ошибка создания проверки</div> : null}
      </div>
    </div>
  );
}

