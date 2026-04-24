import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qualityAPI } from "../services/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuthStore } from "../store";

export function QualityPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [datasetId, setDatasetId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Получаем список датасетов (через quality API нет, используем заглушку)
  const datasetsQuery = useQuery({
    queryKey: ["quality-datasets"],
    queryFn: async () => {
      // Можно заменить на реальный запрос к datasetsAPI
      const res = await fetch("/api/datasets/", {
        headers: { Authorization: `Bearer ${localStorage.getItem("dataset_ai_access_token")}` }
      });
      return res.json();
    },
    enabled: user?.role === "customer" || user?.role === "admin",
  });

  const metricsQuery = useQuery({
    queryKey: ["quality-metrics", datasetId],
    queryFn: () => qualityAPI.metrics(datasetId),
    enabled: !!datasetId,
  });

  const createReviewMutation = useMutation({
    mutationFn: (body: any) => qualityAPI.createReview(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quality-metrics", datasetId] });
      alert("Review created successfully!");
    },
  });

  if (user?.role !== "customer" && user?.role !== "admin") {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Контроль качества
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Этот раздел доступен только заказчикам и администраторам.
        </p>
      </div>
    );
  }

  const datasets = (datasetsQuery.data as any)?.items ?? [];
  const metrics = (metricsQuery.data as any)?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          📊 Контроль качества
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Просмотр метрик качества и создание проверок разметки.
        </p>
      </div>

      {/* Выбор датасета */}
      <div className="card">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Выберите датасет
        </label>
        <select
          value={datasetId}
          onChange={(e) => setDatasetId(e.target.value)}
          className="input-field"
        >
          <option value="">— Выберите датасет —</option>
          {datasets.map((ds: any) => (
            <option key={ds.id} value={ds.id}>
              {ds.name}
            </option>
          ))}
        </select>
      </div>

      {/* Метрики качества */}
      {datasetId && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Метрики качества
          </h2>
          {metricsQuery.isLoading ? (
            <LoadingSpinner />
          ) : metrics.length === 0 ? (
            <p className="text-gray-500">Нет метрик для этого датасета</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                    <th className="py-3 px-2">Задача</th>
                    <th className="py-3 px-2">Precision</th>
                    <th className="py-3 px-2">Recall</th>
                    <th className="py-3 px-2">F1</th>
                    <th className="py-3 px-2">Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m: any) => (
                    <tr key={m.task_id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-3 px-2 font-mono text-xs">{m.task_id?.slice(0, 8)}...</td>
                      <td className="py-3 px-2">{m.precision?.toFixed(3)}</td>
                      <td className="py-3 px-2">{m.recall?.toFixed(3)}</td>
                      <td className="py-3 px-2 font-semibold">{m.f1?.toFixed(3)}</td>
                      <td className="py-3 px-2 text-xs text-gray-500">
                        {m.created_at ? new Date(m.created_at).toLocaleString("ru-RU") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
