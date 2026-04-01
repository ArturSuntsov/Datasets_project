/**
 * Тесты для компонента DashboardPage.
 * 
 * Проверяет:
 * - Отображение статистики (датасеты, задачи)
 * - Загрузку данных через React Query
 * - Отображение списка недавних задач
 * - Обработку ошибок загрузки
 * - Навигацию к разделам
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { DashboardPage } from '../pages/DashboardPage';

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
const mockDatasets = {
  items: [
    { id: '1', name: 'Test Dataset', description: 'Test', status: 'draft', schema_version: 1 },
  ],
  total: 5,
  limit: 20,
  offset: 0,
};

const mockTasks = {
  items: [
    { id: '1', title: 'Task 1', dataset_id: '1', status: 'pending', difficulty_score: 0.5 },
    { id: '2', title: 'Task 2', dataset_id: '1', status: 'completed', difficulty_score: 0.7 },
    { id: '3', title: 'Task 3', dataset_id: '2', status: 'in_progress', difficulty_score: 0.3 },
  ],
  total: 10,
  limit: 5,
  offset: 0,
};

// Настраиваем MSW server для mock API
const server = setupServer(
  http.get('/api/datasets/', () => {
    return HttpResponse.json(mockDatasets);
  }),
  http.get('/api/tasks/', () => {
    return HttpResponse.json(mockTasks);
  })
);

// Компонент-обертка для тестов
function renderWithProviders(ui: React.ReactElement, { initialEntry = '/' } = {}) {
  const queryClient = createTestQueryClient();
  
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/" element={ui} />
          <Route path="/datasets" element={<div data-testid="datasets-page">Datasets</div>} />
          <Route path="/tasks" element={<div data-testid="tasks-page">Tasks</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DashboardPage', () => {
  // Включаем MSW server перед всеми тестами
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Рендеринг', () => {
    it('должен отображать заголовки карточек', async () => {
      renderWithProviders(<DashboardPage />);
      
      expect(screen.getByText('Датасеты')).toBeInTheDocument();
      expect(screen.getByText(/завершённые задачи/i)).toBeInTheDocument();
      expect(screen.getByText('Недавняя активность')).toBeInTheDocument();
    });

    it('должен отображать количество датасетов', async () => {
      renderWithProviders(<DashboardPage />);
      
      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument();
      });
    });

    it('должен отображать количество завершенных задач', async () => {
      renderWithProviders(<DashboardPage />);
      
      await waitFor(() => {
        // В mockTasks одна задача со статусом completed
        expect(screen.getByText('1')).toBeInTheDocument();
      });
    });
  });

  describe('Загрузка данных', () => {
    it('должен показывать индикатор загрузки', () => {
      renderWithProviders(<DashboardPage />);
      
      // В начале загрузки должен быть индикатор
      expect(screen.getByText(/\.+\.\.\./i)).toBeInTheDocument();
    });

    it('должен загружать данные с API', async () => {
      renderWithProviders(<DashboardPage />);
      
      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument();
      });
      
      // Проверяем что данные загрузились
      expect(screen.getByText('Test Dataset')).toBeInTheDocument();
    });

    it('должен обрабатывать ошибку загрузки', async () => {
      // Переопределяем handler для ошибки
      server.use(
        http.get('/api/datasets/', () => {
          return new HttpResponse(null, { status: 500 });
        })
      );
      
      renderWithProviders(<DashboardPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/не удалось загрузить/i)).toBeInTheDocument();
      });
    });
  });

  describe('Таблица задач', () => {
    it('должен отображать заголовки таблицы', async () => {
      renderWithProviders(<DashboardPage />);
      
      await waitFor(() => {
        expect(screen.getByText('ID')).toBeInTheDocument();
        expect(screen.getByText('Dataset')).toBeInTheDocument();
        expect(screen.getByText('Статус')).toBeInTheDocument();
      });
    });

    it('должен отображать список задач', async () => {
      renderWithProviders(<DashboardPage />);
      
      await waitFor(() => {
        expect(screen.getByText('Task 1')).toBeInTheDocument();
        expect(screen.getByText('Task 2')).toBeInTheDocument();
        expect(screen.getByText('Task 3')).toBeInTheDocument();
      });
    });

    it('должен отображать статусы задач', async () => {
      renderWithProviders(<DashboardPage />);
      
      await waitFor(() => {
        expect(screen.getByText('pending')).toBeInTheDocument();
        expect(screen.getByText('completed')).toBeInTheDocument();
        expect(screen.getByText('in_progress')).toBeInTheDocument();
      });
    });

    it('должен показывать сообщение когда задач нет', async () => {
      server.use(
        http.get('/api/tasks/', () => {
          return HttpResponse.json({ items: [], total: 0 });
        })
      );
      
      renderWithProviders(<DashboardPage />);
      
      await waitFor(() => {
        expect(screen.getByText(/пока нет задач/i)).toBeInTheDocument();
      });
    });
  });

  describe('Навигация', () => {
    it('должен иметь ссылку на список датасетов', async () => {
      renderWithProviders(<DashboardPage />);
      
      await waitFor(() => {
        const link = screen.getByText('Открыть список');
        expect(link).toHaveAttribute('href', '/datasets');
      });
    });

    it('должен иметь ссылку на задачи', async () => {
      renderWithProviders(<DashboardPage />);
      
      await waitFor(() => {
        const link = screen.getByText('Перейти к задачам');
        expect(link).toHaveAttribute('href', '/tasks');
      });
    });
  });

  describe('Адаптивность', () => {
    it('должен корректно рендерить карточки статистики', async () => {
      renderWithProviders(<DashboardPage />);
      
      await waitFor(() => {
        const cards = screen.getAllByRole('region', { hidden: true });
        expect(cards.length).toBeGreaterThanOrEqual(2);
      });
    });
  });
});

// Тесты без MSW (с моком напрямую)
describe('DashboardPage (mocked hooks)', () => {
  it('должен отображать пустое состояние при отсутствии данных', async () => {
    const queryClient = createTestQueryClient();
    
    // Предзагружаем пустые данные
    queryClient.setQueryData(['dashboard-datasets'], { items: [], total: 0 });
    queryClient.setQueryData(['dashboard-tasks'], { items: [], total: 0 });
    
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });
});
