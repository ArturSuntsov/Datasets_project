/**
 * Страница управления датасетами
 * 
 * Особенности:
 * - Форма создания в столбик (не накладывается)
 * - Правильные отступы между элементами
 * - Красивая таблица с hover-эффектами
 * - Поддержка тёмной темы
 * - Адаптивный дизайн
 */

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
  });

  const createMutation = useMutation({
    mutationFn: (body: DatasetCreateRequest) => datasetsAPI.create(body as unknown as Record<string, unknown>),
    onSuccess: () => {
      setForm({ name: "", description: "", status: "draft", metadata: {} });
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
    },
  });

  // Получаем сообщение об ошибке
  const errorMessage = React.useMemo(() => {
    if (!createMutation.isError) return null;
    
    const error = createMutation.error as any;
    return error?.response?.data?.detail || 
           error?.response?.data?.error || 
           error?.message ||
           "Неизвестная ошибка";
  }, [createMutation.isError, createMutation.error]);

  const total = datasetsQuery.data?.total ?? 0;
  const items = datasetsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Сбор датасетов</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Здесь создаются и управляются датасеты. Разметка выполняется в отдельном разделе "Разметка датасетов".
        </p>
      </div>
      
      {/* Форма создания датасета */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          📁 Создание датасета
        </h2>
        
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          console.log('📦 Creating dataset:', form);
          createMutation.mutate(form);
        }}>
          
          {/* Название - на всю ширину */}
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

          {/* Описание - на всю ширину */}
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

          {/* Статус - на всю ширину */}
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

          {/* Кнопка создания - на всю ширину */}
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

        {/* Сообщение об ошибке */}
        {createMutation.isError && (
          <div className="mt-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">Ошибка создания датасета</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono break-all">
                  {errorMessage}
                </p>
              </div>
            </div>
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
            <svg className="w-16 h-16 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Не удалось загрузить датасеты</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Проверьте подключение к серверу и попробуйте снова
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Датасетов пока нет</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Создайте первый датасет с помощью формы выше
            </p>
          </div>
        ) : (
          <>
            {/* Таблица датасетов */}
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="py-3 px-4">Название</th>
                    <th className="py-3 px-4">Статус</th>
                    <th className="py-3 px-4">Версия схемы</th>
                    <th className="py-3 px-4">Обновлено</th>
                    <th className="py-3 px-4">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d: Dataset) => (
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
                          {d.status === 'active' && '✅ '}
                          {d.status === 'draft' && '📝 '}
                          {d.status === 'archived' && '🗄️ '}
                          {d.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                        v{d.schema_version ?? '1.0'}
                      </td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                        {d.updated_at 
                          ? new Date(d.updated_at).toLocaleDateString('ru-RU')
                          : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <Link 
                          to={`/datasets/${d.id}`} 
                          className="btn-sm"
                        >
                          Открыть
                        </Link>
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
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Назад
              </button>
              
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Показано <span className="font-semibold text-gray-900 dark:text-white">{offset + 1}</span> — <span className="font-semibold text-gray-900 dark:text-white">{Math.min(offset + limit, total)}</span> из <span className="font-semibold text-gray-900 dark:text-white">{total}</span>
              </div>
              
              <button
                type="button"
                disabled={offset + limit >= total}
                onClick={() => setOffset((o) => o + limit)}
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Дальше →
              </button>
            </div>
          </>
        )}
      </div>
      
    </div>
  );
}
