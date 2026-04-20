/**
 * Kanban-доска для управления задачами
 *
 * Особенности:
 * - Drag-n-Drop между колонками
 * - Отображение статистики по колонкам
 * - Быстрое изменение статуса перетаскиванием
 * - Поддержка тёмной темы
 * - Адаптивный дизайн
 * - Анимации при перетаскивании
 */

import React from "react";
import { Task, TaskStatus } from "../types";

type KanbanColumnProps = {
  status: TaskStatus;
  tasks: Task[];
  onDropTask: (taskId: string, newStatus: TaskStatus) => void;
  onDragStart: (taskId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  isDragOver: boolean;
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: string }> = {
  pending: { label: "Ожидает", color: "bg-gray-500", icon: "📝" },
  in_progress: { label: "В работе", color: "bg-yellow-500", icon: "⏳" },
  review: { label: "На проверке", color: "bg-blue-500", icon: "👀" },
  completed: { label: "Завершено", color: "bg-green-500", icon: "✅" },
  rejected: { label: "Отклонено", color: "bg-red-500", icon: "❌" },
};

function KanbanColumn({ status, tasks, onDropTask, onDragStart, onDragOver, isDragOver }: KanbanColumnProps) {
  const config = STATUS_CONFIG[status];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    onDragOver(e);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) {
      onDropTask(taskId, status);
    }
  };

  return (
    <div
      className={`flex flex-col rounded-xl bg-gray-100 dark:bg-gray-800/50 transition-all duration-200 ${
        isDragOver ? "ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-900" : ""
      }`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Заголовок колонки */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-xl bg-gray-200 dark:bg-gray-800 px-3 py-2 border-b border-gray-300 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{config.label}</span>
        </div>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white dark:bg-gray-700 text-xs font-bold text-gray-700 dark:text-gray-300 shadow-sm">
          {tasks.length}
        </span>
      </div>

      {/* Список задач */}
      <div className="flex-1 space-y-2 p-2 overflow-y-auto min-h-[200px]">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
            <span className="text-2xl mb-2">📭</span>
            <span className="text-xs text-center">Нет задач</span>
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} onDragStart={onDragStart} />
          ))
        )}
      </div>
    </div>
  );
}

type TaskCardProps = {
  task: Task;
  onDragStart: (taskId: string) => void;
};

function TaskCard({ task, onDragStart }: TaskCardProps) {
  const [isDragging, setIsDragging] = React.useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
    setIsDragging(true);
    onDragStart(task.id);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const difficultyColor =
    task.difficulty_score < 0.3
      ? "text-green-600 dark:text-green-400"
      : task.difficulty_score < 0.7
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-red-600 dark:text-red-400";

  const formattedDate = task.created_at
    ? new Date(task.created_at).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
      })
    : "—";

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`group cursor-grab active:cursor-grabbing rounded-lg bg-white dark:bg-gray-900 p-3 shadow-sm border border-gray-200 dark:border-gray-700
        hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 hover:-translate-y-0.5
        transition-all duration-200 ${isDragging ? "opacity-50 scale-95" : "opacity-100"}`}
    >

      {/* Заголовок задачи */}
      <div className="mb-2">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
          {task.title || `Задача #${task.id.slice(0, 6)}`}
        </h4>
      </div>

      {/* ID задачи и сложность */}
      <div className="flex items-center justify-between mb-2">
        <code className="text-[10px] font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
          {task.id.slice(0, 8)}...
        </code>
        <span className={`text-[10px] font-medium ${difficultyColor}`}>
          {(task.difficulty_score * 100).toFixed(0)}%
        </span>
      </div>

      {/* Dataset ID */}
      <div className="mb-2">
        <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-0.5">Датасет</div>
        <code className="text-xs font-mono text-gray-700 dark:text-gray-300 bg-primary-50 dark:bg-primary-900/20 px-1.5 py-0.5 rounded block truncate">
          {task.dataset_id.slice(0, 12)}...
        </code>
      </div>

      {/* Аннотатор (если есть) */}
      {task.annotator_id && (
        <div className="mb-2">
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-0.5">Исполнитель</div>
          <code className="text-xs font-mono text-gray-700 dark:text-gray-300 bg-secondary-50 dark:bg-secondary-900/20 px-1.5 py-0.5 rounded block truncate">
            {task.annotator_id.slice(0, 8)}...
          </code>
        </div>
      )}

      {/* Дедлайн (если есть) */}
      {task.deadline_at && (
        <div className="mb-2">
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-0.5">Дедлайн</div>
          <div className="text-xs text-gray-700 dark:text-gray-300">
            {new Date(task.deadline_at).toLocaleDateString("ru-RU")}
          </div>
        </div>
      )}

      {/* Нижняя панель */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800 mt-2">
        <span className="text-[10px] text-gray-400 dark:text-gray-500">{formattedDate}</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-xs text-gray-400 dark:text-gray-500">⋮⋮</span>
        </div>
      </div>
    </div>
  );
}

type KanbanBoardProps = {
  tasks: Task[];
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
};

export function KanbanBoard({ tasks, onStatusChange }: KanbanBoardProps) {
  const [dragOverColumn, setDragOverColumn] = React.useState<TaskStatus | null>(null);

  const tasksByStatus = React.useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      pending: [],
      in_progress: [],
      review: [],
      completed: [],
      rejected: [],
    };
    for (const task of tasks) {
      map[task.status].push(task);
    }
    return map;
  }, [tasks]);

  const handleDragStart = (_taskId: string) => {
    // Drag start callback
  };

  const handleDragOver = (status: TaskStatus) => {
    setDragOverColumn(status);
  };

  const handleDropTask = (taskId: string, newStatus: TaskStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== newStatus) {
      onStatusChange(taskId, newStatus);
    }
    setDragOverColumn(null);
  };

  const STATUSES: TaskStatus[] = ["pending", "in_progress", "review", "completed", "rejected"];

  return (
    <div className="grid gap-4 lg:grid-cols-5 min-h-[calc(100vh-12rem)]">
      {STATUSES.map((status) => (
        <KanbanColumn
          key={status}
          status={status}
          tasks={tasksByStatus[status]}
          onDropTask={handleDropTask}
          onDragStart={handleDragStart}
          onDragOver={() => handleDragOver(status)}
          isDragOver={dragOverColumn === status}
        />
      ))}
    </div>
  );
}
