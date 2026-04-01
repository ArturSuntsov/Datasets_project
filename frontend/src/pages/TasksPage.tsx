import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tasksAPI } from "../services/api";
import { Task, TaskStatus } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";

const STATUSES: TaskStatus[] = ["pending", "in_progress", "review", "completed", "rejected"];

export function TasksPage() {
  const queryClient = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: () => tasksAPI.list({ limit: 100, offset: 0 }),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; status: TaskStatus }) => tasksAPI.update(vars.id, { status: vars.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", "all"] }),
  });

  const tasks: Task[] = (tasksQuery.data as any)?.items ?? [];

  const byStatus = React.useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      pending: [],
      in_progress: [],
      review: [],
      completed: [],
      rejected: [],
    };
    for (const t of tasks) {
      map[t.status as TaskStatus]?.push(t);
    }
    return map;
  }, [tasks]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="mb-2 text-sm font-semibold">Kanban задач</div>
        <div className="text-xs text-gray-600 dark:text-gray-300">Drag&Drop будет расширен на следующих итерациях.</div>
      </div>

      {tasksQuery.isLoading ? (
        <LoadingSpinner />
      ) : tasksQuery.isError ? (
        <div className="text-sm text-red-700">Не удалось загрузить задачи</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-5">
          {STATUSES.map((status) => (
            <div key={status} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold capitalize text-gray-800 dark:text-gray-100">{status.replace("_", " ")}</div>
                <div className="text-xs text-gray-600 dark:text-gray-300">{byStatus[status]?.length ?? 0}</div>
              </div>
              <div className="space-y-2">
                {(byStatus[status] ?? []).map((t) => (
                  <div key={t.id} className="rounded-md border border-gray-100 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-900">
                    <div className="text-[11px] font-mono text-gray-600 dark:text-gray-300">{t.id}</div>
                    <div className="mt-1 text-xs">
                      <span className="text-gray-600 dark:text-gray-300">dataset:</span> {t.dataset_id}
                    </div>
                    <div className="mt-2 flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="w-full rounded-md bg-gray-900 px-2 py-1 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
                          disabled={updateMutation.isPending}
                          onClick={() => {
                            const idx = STATUSES.indexOf(status);
                            const next = STATUSES[Math.min(STATUSES.length - 1, idx + 1)];
                            if (next && next !== status) updateMutation.mutate({ id: t.id, status: next });
                          }}
                        >
                          Вперёд
                        </button>
                        <button
                          type="button"
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-100 disabled:opacity-60 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
                          disabled={updateMutation.isPending}
                          onClick={() => {
                            const idx = STATUSES.indexOf(status);
                            const prev = STATUSES[Math.max(0, idx - 1)];
                            if (prev && prev !== status) updateMutation.mutate({ id: t.id, status: prev });
                          }}
                        >
                          Назад
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {(byStatus[status] ?? []).length === 0 ? (
                  <div className="text-xs text-gray-600 dark:text-gray-300">Пока нет задач</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

