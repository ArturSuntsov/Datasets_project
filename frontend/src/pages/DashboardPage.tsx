/**
 * Главная страница Dashboard
 * 
 * Особенности:
 * - Отступ слева для сайдбара (ml-72)
 * - Сетка карточек статистики (grid-cols-4)
 * - Красивые карточки с иконками и градиентами
 * - Поддержка тёмной темы
 * - Адаптивный дизайн
 */

import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { datasetsAPI, tasksAPI } from "../services/api";
import { ApiListResponse, Dataset, Task } from "../types";
import { useAuthStore } from "../store";
import { LoadingSpinner } from "../components/LoadingSpinner";

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  
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
  const inProgressTasksCount = tasksQuery.data?.items?.filter((t) => t.status === "in_progress").length ?? 0;

  const recentTasks = tasksQuery.data?.items ?? [];

  // Карточки статистики
  const stats = [
    { 
      label: "Датасеты", 
      value: datasetsTotal, 
      icon: "📁",
      color: "from-blue-500 to-blue-600",
      link: "/datasets",
      description: "Всего датасетов"
    },
    { 
      label: "Задачи в работе", 
      value: inProgressTasksCount, 
      icon: "⏳",
      color: "from-yellow-500 to-yellow-600",
      link: "/tasks",
      description: "Активные задачи"
    },
    { 
      label: "Завершено", 
      value: completedTasksCount, 
      icon: "✅",
      color: "from-green-500 to-green-600",
      link: "/tasks",
      description: "Готовые задачи"
    },
    { 
      label: "Баланс", 
      value: "0 ₽", 
      icon: "💰",
      color: "from-purple-500 to-purple-600",
      link: "/finance",
      description: "Доступно средств"
    },
  ];

  return (
    <div className="space-y-8">
      
      {/* Заголовок страницы */}
      <div className="pb-6 border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              📊 Дашборд
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Добро пожаловать, <span className="font-semibold text-primary-600 dark:text-primary-400">{user?.username ?? "Пользователь"}</span>!
            </p>
          </div>

          {/* Сетка карточек статистики */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat) => (
              <Link
                key={stat.label}
                to={stat.link}
                className="group block"
              >
                <div className="card card-hover h-full">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        {stat.label}
                      </p>
                      <p className="text-4xl font-bold text-gray-900 dark:text-white mt-2 group-hover:scale-105 transition-transform">
                        {stat.value}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        {stat.description}
                      </p>
                    </div>
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-2xl shadow-lg group-hover:shadow-xl transition-shadow`}>
                      {stat.icon}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Быстрые действия */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
              ⚡ Быстрые действия
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                to="/datasets"
                className="p-5 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/10 border border-blue-200 dark:border-blue-800 hover:shadow-lg transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white text-xl group-hover:scale-110 transition-transform">
                    📁
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">Создать датасет</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Новый проект</p>
                  </div>
                </div>
              </Link>
              
              <Link
                to="/tasks"
                className="p-5 rounded-xl bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/10 border border-green-200 dark:border-green-800 hover:shadow-lg transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-green-600 dark:bg-green-500 flex items-center justify-center text-white text-xl group-hover:scale-110 transition-transform">
                    ✅
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">Задачи</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Посмотреть все</p>
                  </div>
                </div>
              </Link>
              
              <Link
                to="/profile"
                className="p-5 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/10 border border-purple-200 dark:border-purple-800 hover:shadow-lg transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-purple-600 dark:bg-purple-500 flex items-center justify-center text-white text-xl group-hover:scale-110 transition-transform">
                    👤
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">Профиль</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Настройки</p>
                  </div>
                </div>
              </Link>
            </div>
          </div>

          {/* Недавняя активность */}
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                📋 Недавняя активность
              </h2>
              <Link to="/tasks" className="text-sm text-primary-600 dark:text-primary-400 hover:underline font-medium">
                Все задачи →
              </Link>
            </div>

            {tasksQuery.isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <LoadingSpinner size="lg" />
                <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Загрузка задач...</p>
              </div>
            ) : tasksQuery.isError ? (
              <div className="flex flex-col items-center justify-center py-12">
                <svg className="w-16 h-16 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">Не удалось загрузить задачи</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Проверьте подключение к серверу
                </p>
              </div>
            ) : recentTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Задач пока нет</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Создайте первую задачу в разделе "Задачи"
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="py-3 px-4">ID</th>
                      <th className="py-3 px-4">Датасет</th>
                      <th className="py-3 px-4">Статус</th>
                      <th className="py-3 px-4">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTasks.map((t) => (
                      <tr key={t.id}>
                        <td className="py-3 px-4 font-mono text-xs text-gray-600 dark:text-gray-400">
                          {t.id.slice(0, 8)}...
                        </td>
                        <td className="py-3 px-4 text-gray-900 dark:text-white">
                          <Link to={`/datasets/${t.dataset_id}`} className="text-primary-600 dark:text-primary-400 hover:underline">
                            {t.dataset_id.slice(0, 12)}...
                          </Link>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`badge ${
                            t.status === 'completed' ? 'badge-success' :
                            t.status === 'in_progress' ? 'badge-warning' :
                            'badge-secondary'
                          }`}>
                            {t.status === 'completed' && '✅ '}
                            {t.status === 'in_progress' && '⏳ '}
                            {t.status === 'pending' && '📝 '}
                            {t.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <Link 
                            to={`/tasks/${t.id}`} 
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
            )}
          </div>

          {/* Подсказки для начала работы */}
          <div className="card bg-gradient-to-br from-primary-50 to-secondary-50 dark:from-primary-900/20 dark:to-secondary-900/20 border-primary-200 dark:border-primary-800">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
              💡 Начало работы
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-600 dark:bg-primary-500 text-white flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">Создайте первый датасет</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    <Link to="/datasets" className="text-primary-600 dark:text-primary-400 hover:underline">Добавьте датасет</Link> с описанием ваших данных
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-600 dark:bg-primary-500 text-white flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">Добавьте задачи для разметки</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    <Link to="/tasks" className="text-primary-600 dark:text-primary-400 hover:underline">Создайте задачи</Link> и настройте параметры аннотации
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-600 dark:bg-primary-500 text-white flex items-center justify-center text-sm font-bold">
                  3
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white">Пригласите аннотаторов</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    <Link to="/labeling" className="text-primary-600 dark:text-primary-400 hover:underline">Назначьте исполнителей</Link> для выполнения задач
                  </p>
                </div>
              </div>
            </div>
          </div>

    </div>
  );
}
