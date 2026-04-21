import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { tasksAPI } from "../services/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuthStore } from "../store";

export function LabelingPage() {
  const user = useAuthStore((s) => s.user);

  // Используем tasksAPI вместо annotatorAPI
  const tasksQuery = useQuery({
    queryKey: ["labeling-tasks"],
    queryFn: () => tasksAPI.list({ limit: 50, offset: 0, status: "in_progress" }),
    enabled: user?.role === "annotator" || user?.role === "admin",
  });

  if (user?.role !== "annotator" && user?.role !== "admin") {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Разметка данных
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Этот раздел доступен только аннотаторам и администраторам.
        </p>
      </div>
    );
  }

  const items = (tasksQuery.data as any)?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          📝 Разметка датасетов
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Здесь отображаются задачи, назначенные вам для разметки.
        </p>
      </div>

      {tasksQuery.isLoading ? (
        <div className="card p-10 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : tasksQuery.isError ? (
        <div className="card p-10 text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Не удалось загрузить задачи
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Проверьте подключение к серверу и попробуйте позже.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="card p-10 text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Нет доступных задач
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Как только вам назначат задачу на разметку, она появится здесь.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {items.map((item: any) => (
            <div key={item.id} className="card card-hover">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Dataset: {item.dataset_id?.slice(0, 8)}...
                  </div>
                  <h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
                    Задача {item.id?.slice(0, 8)}...
                  </h2>
                </div>
                <span className={`badge ${
                  item.status === "in_progress" ? "badge-warning" : "badge-secondary"
                }`}>
                  {item.status === "in_progress" ? "⏳ В работе" : item.status}
                </span>
              </div>
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                Сложность: {item.difficulty_score?.toFixed(2) || "—"}
              </p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {item.input_ref || "Нет описания задачи"}
              </p>
              <div className="mt-5 flex items-center justify-between">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Создано: {item.created_at ? new Date(item.created_at).toLocaleString("ru-RU") : "—"}
                </div>
                <Link to={`/labeling`} className="btn-primary">
                  Открыть задачу
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
