import React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { datasetsAPI } from "../services/api";
import { ApiListResponse, Dataset, DatasetCreateRequest } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";

export function DatasetsPage() {
  const queryClient = useQueryClient();
  const [limit] = React.useState(20);
  const [offset, setOffset] = React.useState(0);

  const [form, setForm] = React.useState<DatasetCreateRequest>({
    name: "",
    description: "",
    status: "draft",
    metadata: {},
  });

  const datasetsQuery = useQuery<ApiListResponse<Dataset>>({
    queryKey: ["datasets", limit, offset],
    queryFn: () => datasetsAPI.list({ limit, offset }),
    keepPreviousData: true,
  });

  const createMutation = useMutation({
    mutationFn: (body: DatasetCreateRequest) => datasetsAPI.create(body),
    onSuccess: () => {
      setForm({ name: "", description: "", status: "draft", metadata: {} });
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
  });

  const total = datasetsQuery.data?.total ?? 0;
  const items = datasetsQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="mb-3 text-sm font-semibold">Создание датасета (MVP)</div>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
            placeholder="Название"
          />
          <input
            value={form.description ?? ""}
            onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
            placeholder="Описание"
          />
          <select
            value={form.status ?? "draft"}
            onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as DatasetCreateRequest["status"] }))}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
          >
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="archived">archived</option>
          </select>
          <button
            type="button"
            disabled={createMutation.isPending || !form.name.trim()}
            onClick={() => createMutation.mutate(form)}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {createMutation.isPending ? "Создаём..." : "Создать"}
          </button>
        </div>
        {createMutation.isError ? <div className="mt-3 text-sm text-red-700">Ошибка создания датасета</div> : null}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="mb-3 text-sm font-semibold">Датасеты</div>
        {datasetsQuery.isLoading ? (
          <LoadingSpinner />
        ) : datasetsQuery.isError ? (
          <div className="text-sm text-red-700">Не удалось загрузить датасеты</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="py-2 pr-3">Название</th>
                    <th className="py-2 pr-3">Статус</th>
                    <th className="py-2 pr-3">Версия схемы</th>
                    <th className="py-2 pr-3">Обновлено</th>
                    <th className="py-2 pr-3">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <tr key={d.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-3 font-medium">
                        <Link to={`/datasets/${d.id}`} className="text-blue-700 hover:underline dark:text-blue-400">
                          {d.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">{d.status}</td>
                      <td className="py-2 pr-3">{d.schema_version}</td>
                      <td className="py-2 pr-3">{d.updated_at ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <Link to={`/datasets/${d.id}`} className="text-xs text-blue-700 hover:underline dark:text-blue-400">
                          Детали
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 ? (
                    <tr>
                      <td className="py-3 text-sm text-gray-600" colSpan={5}>
                        Нет датасетов
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                disabled={offset <= 0}
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Назад
              </button>
              <div className="text-xs text-gray-600 dark:text-gray-300">
                {offset + 1}-{Math.min(offset + limit, total)} из {total}
              </div>
              <button
                type="button"
                disabled={offset + limit >= total}
                onClick={() => setOffset((o) => o + limit)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Дальше
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

