import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { datasetsAPI, tasksAPI } from "../services/api";
import { ApiListResponse, Dataset, Task } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";

export function DashboardPage() {
  const datasetsQuery = useQuery<ApiListResponse<Dataset>>({
    queryKey: ["dashboard-datasets"],
    queryFn: () => datasetsAPI.list({ limit: 1, offset: 0 }),
  });

  const tasksQuery = useQuery<ApiListResponse<Task>>({
    queryKey: ["dashboard-tasks"],
    queryFn: () => tasksAPI.list({ limit: 5, offset: 0 }),
  });

  const datasetsTotal = datasetsQuery.data?.total ?? datasetsQuery.data?.items?.length ?? 0;
  const completedTasksCount = tasksQuery.data?.items?.filter((t) => t.status === "completed").length ?? 0;

  const recentTasks = tasksQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[220px] rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <div className="text-xs text-gray-600">Датасеты</div>
          <div className="mt-2 text-2xl font-bold">{datasetsQuery.isLoading ? <LoadingSpinner label="..." /> : datasetsTotal}</div>
          <div className="mt-3 text-xs">
            <Link to="/datasets" className="text-blue-700 hover:underline dark:text-blue-400">
              Открыть список
            </Link>
          </div>
        </div>

        <div className="flex-1 min-w-[220px] rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <div className="text-xs text-gray-600">Завершённые задачи (пример)</div>
          <div className="mt-2 text-2xl font-bold">{completedTasksCount}</div>
          <div className="mt-3 text-xs">
            <Link to="/tasks" className="text-blue-700 hover:underline dark:text-blue-400">
              Перейти к задачам
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="mb-3 text-sm font-semibold">Недавняя активность</div>
        {tasksQuery.isLoading ? (
          <LoadingSpinner />
        ) : tasksQuery.isError ? (
          <div className="text-sm text-red-700">Не удалось загрузить задачи</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="py-2 pr-3">ID</th>
                  <th className="py-2 pr-3">Dataset</th>
                  <th className="py-2 pr-3">Статус</th>
                </tr>
              </thead>
              <tbody>
                {recentTasks.map((t) => (
                  <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="py-2 pr-3 font-mono text-xs">{t.id}</td>
                    <td className="py-2 pr-3">{t.dataset_id}</td>
                    <td className="py-2 pr-3">{t.status}</td>
                  </tr>
                ))}
                {recentTasks.length === 0 ? (
                  <tr>
                    <td className="py-3 text-sm text-gray-600" colSpan={3}>
                      Пока нет задач
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

