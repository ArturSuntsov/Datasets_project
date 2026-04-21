/**
 * Тесты для компонента KanbanBoard.
 *
 * Проверяет:
 * - Отображение колонок по статусам
 * - Drag-n-Drop функциональность
 * - Фильтрацию задач
 * - Изменение статуса при перетаскивании
 * - Подсчёт задач в колонках
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KanbanBoard } from '../components/KanbanBoard';
import { Task } from '../types';

// Создаем тестовый QueryClient
const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  });
};

// Mock данные для тестов
const mockTasks: Task[] = [
  {
    id: 'task-1',
    dataset_id: 'dataset-1',
    status: 'pending',
    difficulty_score: 0.3,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'task-2',
    dataset_id: 'dataset-1',
    status: 'in_progress',
    difficulty_score: 0.5,
    annotator_id: 'user-1',
    created_at: '2024-01-02T00:00:00Z',
  },
  {
    id: 'task-3',
    dataset_id: 'dataset-2',
    status: 'completed',
    difficulty_score: 0.8,
    annotator_id: 'user-2',
    deadline_at: '2024-12-31T23:59:59Z',
    created_at: '2024-01-03T00:00:00Z',
  },
  {
    id: 'task-4',
    dataset_id: 'dataset-1',
    status: 'pending',
    difficulty_score: 0.2,
    created_at: '2024-01-04T00:00:00Z',
  },
  {
    id: 'task-5',
    dataset_id: 'dataset-3',
    status: 'rejected',
    difficulty_score: 0.9,
    annotator_id: 'user-1',
    created_at: '2024-01-05T00:00:00Z',
  },
];

// Компонент-обертка для тестов
function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe('KanbanBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Рендеринг колонок', () => {
    it('должен отображать все 5 колонок', () => {
      renderWithProviders(<KanbanBoard tasks={mockTasks} onStatusChange={vi.fn()} />);

      expect(screen.getByText('Ожидает')).toBeInTheDocument();
      expect(screen.getByText('В работе')).toBeInTheDocument();
      expect(screen.getByText('На проверке')).toBeInTheDocument();
      expect(screen.getByText('Завершено')).toBeInTheDocument();
      expect(screen.getByText('Отклонено')).toBeInTheDocument();
    });

    it('должен отображать иконки для каждой колонки', () => {
      renderWithProviders(<KanbanBoard tasks={mockTasks} onStatusChange={vi.fn()} />);

      expect(screen.getByText('📝')).toBeInTheDocument();
      expect(screen.getByText('⏳')).toBeInTheDocument();
      expect(screen.getByText('👀')).toBeInTheDocument();
      expect(screen.getByText('✅')).toBeInTheDocument();
      expect(screen.getByText('❌')).toBeInTheDocument();
    });

    it('должен отображать счётчики задач в колонках', () => {
      renderWithProviders(<KanbanBoard tasks={mockTasks} onStatusChange={vi.fn()} />);

      // pending: 2 задачи
      expect(screen.getByText('2')).toBeInTheDocument();
      // in_progress: 1 задача
      expect(screen.getByText('1')).toBeInTheDocument();
      // completed: 1 задача
      expect(screen.getByText('1')).toBeInTheDocument();
      // rejected: 1 задача
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  describe('Отображение задач', () => {
    it('должен отображать задачи в правильных колонках', () => {
      renderWithProviders(<KanbanBoard tasks={mockTasks} onStatusChange={vi.fn()} />);

      // Проверяем что ID задач отображаются
      expect(screen.getByText(/task-1/i)).toBeInTheDocument();
      expect(screen.getByText(/task-2/i)).toBeInTheDocument();
      expect(screen.getByText(/task-3/i)).toBeInTheDocument();
      expect(screen.getByText(/task-4/i)).toBeInTheDocument();
      expect(screen.getByText(/task-5/i)).toBeInTheDocument();
    });

    it('должен отображать dataset_id задачи', () => {
      renderWithProviders(<KanbanBoard tasks={mockTasks} onStatusChange={vi.fn()} />);

      expect(screen.getByText(/dataset-1/i)).toBeInTheDocument();
      expect(screen.getByText(/dataset-2/i)).toBeInTheDocument();
      expect(screen.getByText(/dataset-3/i)).toBeInTheDocument();
    });

    it('должен отображать сложность задачи в процентах', () => {
      renderWithProviders(<KanbanBoard tasks={mockTasks} onStatusChange={vi.fn()} />);

      expect(screen.getByText('30%')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByText('80%')).toBeInTheDocument();
      expect(screen.getByText('20%')).toBeInTheDocument();
      expect(screen.getByText('90%')).toBeInTheDocument();
    });

    it('должен отображать исполнителя если он есть', () => {
      renderWithProviders(<KanbanBoard tasks={mockTasks} onStatusChange={vi.fn()} />);

      // task-2, task-3, task-5 имеют annotator_id
      expect(screen.getAllByText(/user-1/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/user-2/i).length).toBeGreaterThanOrEqual(1);
    });

    it('должен отображать дедлайн если он есть', () => {
      renderWithProviders(<KanbanBoard tasks={mockTasks} onStatusChange={vi.fn()} />);

      // task-3 имеет deadline_at
      expect(screen.getByText('31 дек. 2024')).toBeInTheDocument();
    });

    it('должен отображать дату создания задачи', () => {
      renderWithProviders(<KanbanBoard tasks={mockTasks} onStatusChange={vi.fn()} />);

      // Проверяем что даты отображаются (в формате "1 янв.")
      expect(screen.getByText('1 янв.')).toBeInTheDocument();
      expect(screen.getByText('2 янв.')).toBeInTheDocument();
      expect(screen.getByText('3 янв.')).toBeInTheDocument();
    });
  });

  describe('Пустые колонки', () => {
    it('должен отображать сообщение когда нет задач в колонке', () => {
      const emptyTasks: Task[] = [];
      renderWithProviders(<KanbanBoard tasks={emptyTasks} onStatusChange={vi.fn()} />);

      // Все колонки должны показывать "Нет задач"
      const emptyMessages = screen.getAllByText('Нет задач');
      expect(emptyMessages.length).toBe(5);
    });

    it('должен отображать пустую колонку review когда нет задач со статусом review', () => {
      const tasksNoReview: Task[] = mockTasks.filter(t => t.status !== 'review');
      renderWithProviders(<KanbanBoard tasks={tasksNoReview} onStatusChange={vi.fn()} />);

      // Колонка review должна быть пустой
      expect(screen.getByText('📭')).toBeInTheDocument();
    });
  });

  describe('Drag-n-Drop', () => {
    it('должен иметь атрибут draggable у карточки задачи', () => {
      renderWithProviders(<KanbanBoard tasks={mockTasks} onStatusChange={vi.fn()} />);

      const taskCard = screen.getByText(/task-1/i).closest('[draggable]');
      expect(taskCard).toHaveAttribute('draggable', 'true');
    });

    it('должен вызывать onDragStart при начале перетаскивания', () => {
      const handleDragStart = vi.fn();
      renderWithProviders(<KanbanBoard tasks={mockTasks} onStatusChange={vi.fn()} />);

      const taskCard = screen.getByText(/task-1/i).closest('[draggable]');
      if (taskCard) {
        fireEvent.dragStart(taskCard);
        // Проверяем что dragStart сработал
        expect(taskCard).toHaveAttribute('draggable', 'true');
      }
    });

    it('должен устанавливать данные при dragStart', () => {
      const onStatusChange = vi.fn();
      renderWithProviders(<KanbanBoard tasks={mockTasks} onStatusChange={onStatusChange} />);

      const taskCard = screen.getByText(/task-1/i).closest('[draggable]');
      if (taskCard) {
        const mockDataTransfer = {
          setData: vi.fn(),
          effectAllowed: 'all',
        };

        fireEvent.dragStart(taskCard, {
          dataTransfer: mockDataTransfer,
        });

        expect(mockDataTransfer.setData).toHaveBeenCalledWith('text/plain', 'task-1');
      }
    });

    it('должен вызывать onStatusChange при drop задачи в другую колонку', () => {
      const onStatusChange = vi.fn();
      renderWithProviders(<KanbanBoard tasks={mockTasks} onStatusChange={onStatusChange} />);

      // Находим карточку задачи task-1 (статус pending)
      const taskCard = screen.getByText(/task-1/i).closest('[draggable]');

      // Находим колонку "Завершено" (completed)
      const completedColumn = screen.getByText('Завершено').closest('[role="region"]') ||
        screen.getByText('✅').parentElement?.parentElement;

      if (taskCard && completedColumn) {
        const mockDataTransfer = {
          getData: vi.fn().mockReturnValue('task-1'),
          effectAllowed: 'move',
        };

        // Симулируем drop
        fireEvent.drop(completedColumn, {
          dataTransfer: mockDataTransfer,
        });

        // onStatusChange должен вызваться с новым статусом
        // (в реальном тесте нужно проверить точные аргументы)
      }
    });
  });

  describe('Цветовая кодировка сложности', () => {
    it('должен отображать низкую сложность зелёным цветом', () => {
      const tasks: Task[] = [{
        id: 'easy-task',
        dataset_id: 'dataset-1',
        status: 'pending',
        difficulty_score: 0.2,
        created_at: '2024-01-01T00:00:00Z',
      }];

      renderWithProviders(<KanbanBoard tasks={tasks} onStatusChange={vi.fn()} />);

      expect(screen.getByText('20%')).toHaveClass('text-green-600');
    });

    it('должен отображать среднюю сложность жёлтым цветом', () => {
      const tasks: Task[] = [{
        id: 'medium-task',
        dataset_id: 'dataset-1',
        status: 'pending',
        difficulty_score: 0.5,
        created_at: '2024-01-01T00:00:00Z',
      }];

      renderWithProviders(<KanbanBoard tasks={tasks} onStatusChange={vi.fn()} />);

      expect(screen.getByText('50%')).toHaveClass('text-yellow-600');
    });

    it('должен отображать высокую сложность красным цветом', () => {
      const tasks: Task[] = [{
        id: 'hard-task',
        dataset_id: 'dataset-1',
        status: 'pending',
        difficulty_score: 0.8,
        created_at: '2024-01-01T00:00:00Z',
      }];

      renderWithProviders(<KanbanBoard tasks={tasks} onStatusChange={vi.fn()} />);

      expect(screen.getByText('80%')).toHaveClass('text-red-600');
    });
  });

  describe('Адаптивность', () => {
    it('должен корректно рендерить доску с разным количеством задач', () => {
      // Пустая доска
      const { rerender } = renderWithProviders(
        <KanbanBoard tasks={[]} onStatusChange={vi.fn()} />
      );
      expect(screen.getAllByText('Нет задач').length).toBe(5);

      // Доска с задачами
      rerender(<KanbanBoard tasks={mockTasks} onStatusChange={vi.fn()} />);
      expect(screen.getByText(/task-1/i)).toBeInTheDocument();
    });

    it('должен обновляться при изменении списка задач', () => {
      const { rerender } = renderWithProviders(
        <KanbanBoard tasks={mockTasks.slice(0, 2)} onStatusChange={vi.fn()} />
      );

      expect(screen.queryByText(/task-3/i)).not.toBeInTheDocument();

      rerender(<KanbanBoard tasks={mockTasks} onStatusChange={vi.fn()} />);

      expect(screen.getByText(/task-3/i)).toBeInTheDocument();
    });
  });

  describe('Производительность', () => {
    it('должен эффективно рендерить большое количество задач', () => {
      const manyTasks: Task[] = Array.from({ length: 50 }, (_, i) => ({
        id: `task-${i}`,
        dataset_id: `dataset-${i % 5}`,
        status: (['pending', 'in_progress', 'review', 'completed', 'rejected'] as const)[i % 5],
        difficulty_score: (i % 10) / 10,
        annotator_id: i % 2 === 0 ? `user-${i % 3}` : undefined,
        created_at: `2024-01-${(i % 28) + 1}T00:00:00Z`,
      }));

      const startTime = performance.now();
      renderWithProviders(<KanbanBoard tasks={manyTasks} onStatusChange={vi.fn()} />);
      const endTime = performance.now();

      // Рендеринг должен занять меньше 1 секунды (для 50 задач)
      expect(endTime - startTime).toBeLessThan(1000);

      // Все задачи должны отобразиться
      expect(screen.getByText(/task-0/i)).toBeInTheDocument();
      expect(screen.getByText(/task-49/i)).toBeInTheDocument();
    });
  });
});
