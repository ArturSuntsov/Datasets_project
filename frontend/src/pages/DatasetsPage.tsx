/**
 * Страница управления датасетами
 * 
 * Особенности:
 * - Форма создания в столбик
 * - Возможность загружать файлы для датасетов
 * - Отображение статуса загрузки
 * - Поддержка тёмной темы
 */

import React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { datasetsAPI, dataLakeAPI } from "../services/api";
import { ApiListResponse, Dataset, DatasetCreateRequest } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { FileUploader } from "../components/FileUploader";

export function DatasetsPage() {
  const queryClient = useQueryClient();
  const [limit] = React.useState(20);
  const [offset, setOffset] = React.useState(0);
  const [uploadingDatasetId, setUploadingDatasetId] = React.useState<string | null>(null);

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

  const handleUploadComplete = (datasetId: string) => {
    setUploadingDatasetId(null);
    queryClient.invalidateQueries({ queryKey: ["datasets"] });
  };

  return (
    <div className="space-y-6">
      
      {/* Форма создания датасета */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          📁 Создание датасета
        </h2>
        
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate(form);
        }}>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Название датасета *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              className="input-field"
              placeholder="Введите название датасета"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Описание
            </label>
            <textarea
              value={form.description ?? ""}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
              className="input-field resize-none"
              rows={3}
              placeholder="Опишите датасет: тип данных, количество записей, источник..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Статус
            </label>
            <select
              value={form.status ?? "draft"}
              onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as DatasetCreateRequest["status"] }))}
              className="input-field"
            >
              <option value="draft">📝 Черновик (draft)</option>
              <option value="active">✅ Активен (active)</option>
              <option value="archived">🗄️ Архив (archived)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={createMutation.isPending || !form.name.trim()}
            className="btn-primary w-full"
          >
            {createMutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" />
                Создание...
              </span>
            ) : (
              "✨ Создать датасет"
            )}
          </button>
        </form>

        {createMutation.isError && (
          <div className="mt-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">Ошибка создания датасета</p>
          </div>
        )}
      </div>

      {/* Список датасетов */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          📋 Датасеты
        </h2>

        {datasetsQuery.isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Загрузка датасетов...</p>
          </div>
        ) : datasetsQuery.isError ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Не удалось загрузить датасеты</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Датасетов пока нет</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="py-3 px-4">Название</th>
                    <th className="py-3 px-4">Статус</th>
                    <th className="py-3 px-4">Файл</th>
                    <th className="py-3 px-4">Обновлено</th>
                    <th className="py-3 px-4">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <tr key={d.id}>
                      <td className="py-3 px-4">
                        <Link 
                          to={`/datasets/${d.id}`} 
                          className="font-medium text-primary-600 dark:text-primary-400 hover:underline"
                        >
                          {d.name}
                        </Link>
                       </td>
                      <td className="py-3 px-4">
                        <span className={`badge ${
                          d.status === 'active' ? 'badge-success' :
                          d.status === 'draft' ? 'badge-warning' :
                          'badge-secondary'
                        }`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {d.upload_status === 'uploaded' ? (
                          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                            ✅ Загружен ({d.file_size_bytes ? (d.file_size_bytes / 1024 / 1024).toFixed(1) + ' MB' : '?'})
                          </span>
                        ) : d.upload_status === 'uploading' ? (
                          <span className="text-xs text-yellow-600 dark:text-yellow-400">⏳ Загрузка...</span>
                        ) : (
                          <span className="text-xs text-gray-500">❌ Не загружен</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                        {d.updated_at 
                          ? new Date(d.updated_at).toLocaleDateString('ru-RU')
                          : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Link to={`/datasets/${d.id}`} className="btn-sm">
                            Открыть
                          </Link>
                          
                          {d.upload_status !== 'uploaded' && (
                            <button
                              onClick={() => setUploadingDatasetId(d.id)}
                              className="btn-sm bg-blue-500 hover:bg-blue-600"
                            >
                              Загрузить файл
                            </button>
                          )}
                          
                          {d.upload_status === 'uploaded' && (
                            <button
                              onClick={() => dataLakeAPI.downloadFile(d.id)}
                              className="btn-sm bg-green-500 hover:bg-green-600"
                            >
                              Скачать
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Пагинация */}
            <div className="mt-6 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-4">
              <button
                type="button"
                disabled={offset <= 0}
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                className="btn-secondary disabled:opacity-50"
              >
                ← Назад
              </button>
              
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Показано {offset + 1} — {Math.min(offset + limit, total)} из {total}
              </div>
              
              <button
                type="button"
                disabled={offset + limit >= total}
                onClick={() => setOffset((o) => o + limit)}
                className="btn-secondary disabled:opacity-50"
              >
                Дальше →
              </button>
            </div>
          </>
        )}
      </div>

      {/* Модальное окно загрузки файла */}
      {uploadingDatasetId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Загрузка файла
              </h3>
              <button
                onClick={() => setUploadingDatasetId(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <FileUploader
              datasetId={uploadingDatasetId}
              onUploadComplete={() => handleUploadComplete(uploadingDatasetId)}
              onUploadError={(error) => {
                console.error(error);
                setUploadingDatasetId(null);
              }}
            />
          </div>
        </div>
      )}
      
    </div>
  );
}
