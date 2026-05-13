import React from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { datasetsAPI } from "../services/api";
import { Dataset, DatasetUpdateRequest } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuthStore } from "../store/useAuthStore";

export function DatasetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const datasetQuery = useQuery<Dataset>({
    queryKey: ["dataset", id],
    queryFn: () => (id ? datasetsAPI.detail(id) : Promise.reject(new Error("No dataset id"))),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (body: DatasetUpdateRequest) => (id ? datasetsAPI.update(id, body as Record<string, unknown>) : Promise.reject(new Error("No id"))),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dataset", id] }),
  });

  const [form, setForm] = React.useState<Pick<Dataset, "name" | "status" | "description">>({
    name: "",
    status: "draft",
    description: "",
  });

  const [exportFormat, setExportFormat] = React.useState<"voc" | "coco" | "yolo" | "tfrecord">("coco");
  const [isExporting, setIsExporting] = React.useState(false);

  const handleExport = async () => {
    if (!id) return;
    setIsExporting(true);
    try {
      const blob = await datasetsAPI.exportDataset(id, exportFormat);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const extension = exportFormat === "tfrecord" ? "tfrecord" : "zip";
      a.download = `dataset-${id}-export.${extension}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Ошибка при скачивании датасета. Проверьте права доступа или попробуйте позже.");
    } finally {
      setIsExporting(false);
    }
  };

  React.useEffect(() => {
    if (datasetQuery.data) {
      setForm({
        name: datasetQuery.data.name,
        status: datasetQuery.data.status,
        description: datasetQuery.data.description,
      });
    }
  }, [datasetQuery.data]);

  return (
    <div className="space-y-4">
      {datasetQuery.isLoading ? (
        <LoadingSpinner />
      ) : datasetQuery.isError ? (
        <div className="text-sm text-red-700">Не удалось загрузить датасет</div>
      ) : datasetQuery.data ? (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="mb-3 text-sm font-semibold">Детали датасета</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-gray-600">ID</div>
                <div className="rounded-md bg-gray-50 p-2 text-xs font-mono dark:bg-gray-900">{datasetQuery.data.id}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-gray-600">Schema version</div>
                <div className="rounded-md bg-gray-50 p-2 text-xs dark:bg-gray-900">{datasetQuery.data.schema_version}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
                placeholder="Название"
              />
              <select
                value={form.status}
                onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as Dataset["status"] }))}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
              >
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="archived">archived</option>
              </select>
              <textarea
                value={form.description}
                onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                className="md:col-span-2 min-h-[90px] rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
                placeholder="Описание"
              />
              <button
                type="button"
                disabled={updateMutation.isPending}
                onClick={() => updateMutation.mutate({ name: form.name, status: form.status, description: form.description } as DatasetUpdateRequest)}
                className="md:col-span-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
              >
                {updateMutation.isPending ? "Сохраняем..." : "Сохранить изменения"}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="mb-3 text-sm font-semibold">Metadata</div>
            <pre className="max-h-[400px] overflow-auto rounded-md bg-gray-50 p-3 text-xs dark:bg-gray-900">
              {JSON.stringify(datasetQuery.data.metadata ?? {}, null, 2)}
            </pre>
          </div>

          {/* Блок экспорта (только для customer) */}
          {user?.role === 'customer' && (
            <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
              <div className="mb-3 text-sm font-semibold">Экспорт разметки</div>
              <div className="flex items-center gap-4">
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as "voc" | "coco" | "yolo" | "tfrecord")}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700"
                >
                  <option value="voc">PASCAL VOC</option>
                  <option value="coco">COCO</option>
                  <option value="yolo">YOLO</option>
                  <option value="tfrecord">TFRecord</option>
                </select>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleExport}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {isExporting ? "Скачивание..." : "Скачать"}
                </button>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

