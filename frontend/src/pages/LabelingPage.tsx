import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { annotatorAPI } from "../services/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuthStore } from "../store";

export function LabelingPage() {
  const user = useAuthStore((s) => s.user);
  const queueQuery = useQuery({
    queryKey: ["annotator-queue"],
    queryFn: () => annotatorAPI.queue(),
    enabled: user?.role === "annotator" || user?.role === "admin",
  });

  if (user?.role !== "annotator" && user?.role !== "admin") {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Annotator queue</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">This workspace is available to annotators and admins.</p>
      </div>
    );
  }

  const items = queueQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Разметка датасетов</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Этот раздел отвечает только за аннотацию задач. Сбор и настройка датасетов выполняются в разделе "Сбор датасетов".
        </p>
      </div>

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

      {queueQuery.isLoading ? (
        <div className="card p-10 flex justify-center"><LoadingSpinner size="lg" /></div>
      ) : items.length === 0 ? (
        <div className="card p-10 text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">No assignments yet</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">As soon as a project is finalized and assigned to you, it will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {items.map((item) => (
            <div key={item.assignment_id} className="card card-hover">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{item.project_title}</div>
                  <h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">Assignment {item.assignment_id.slice(0, 8)}</h2>
                </div>
                <span className="badge badge-warning">{item.status}</span>
              </div>
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">Labels: {item.label_schema.map((label) => label.name).join(", ") || "—"}</p>
              <p className="mt-2 line-clamp-3 text-sm text-gray-500 dark:text-gray-400">{item.instruction || "No project instructions yet."}</p>
              <div className="mt-5 flex items-center justify-between">
                <div className="text-xs text-gray-500 dark:text-gray-400">Created {new Date(item.created_at).toLocaleString()}</div>
                <Link to={`/labeling/assignments/${item.assignment_id}`} className="btn-primary">
                  Open task
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
