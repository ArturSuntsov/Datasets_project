/**
 * Тесты для компонента LoginPage.
 * 
 * Проверяет:
 * - Отображение формы входа
 * - Валидацию полей (email/username, пароль)
 * - Отправку формы
 * - Отображение ошибок
 * - Навигацию после успешного входа
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from '../pages/LoginPage';
import { useAuthStore } from '../store';

// Создаем QueryClient для тестов
const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
};

// Компонент-обертка для тестов с роутингом
function renderWithProviders(ui: React.ReactElement, { initialEntry = '/login' } = {}) {
  const queryClient = createTestQueryClient();
  
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={ui} />
          <Route path="/" element={<div data-testid="dashboard">Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('LoginPage', () => {
  // Сбрасываем состояние store перед каждым тестом
  beforeEach(() => {
    vi.clearAllMocks();
    // Сбрасываем состояние auth store
    const store = useAuthStore.getState();
    if ('clear' in store) {
      (store as any).clear();
    }
  });

  describe('Рендеринг', () => {
    it('должен отображать форму входа', () => {
      renderWithProviders(<LoginPage />);
      
      expect(screen.getByText('Вход')).toBeInTheDocument();
      expect(screen.getByLabelText('Email или username')).toBeInTheDocument();
      expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /войти/i })).toBeInTheDocument();
    });

    it('должен отображать ссылку на регистрацию', () => {
      renderWithProviders(<LoginPage />);
      
      expect(screen.getByText('Регистрация')).toBeInTheDocument();
      expect(screen.getByText('Регистрация')).toHaveAttribute('href', '/register');
    });

    it('должен отображать описание', () => {
      renderWithProviders(<LoginPage />);
      
      expect(screen.getByText(/войдите в систему/i)).toBeInTheDocument();
    });
  });

  describe('Валидация формы', () => {
    it('должен показывать ошибку при пустом identifier', async () => {
      renderWithProviders(<LoginPage />);
      
      const submitButton = screen.getByRole('button', { name: /войти/i });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/укажите email или username/i)).toBeInTheDocument();
      });
    });

    it('должен показывать ошибку при коротком identifier', async () => {
      renderWithProviders(<LoginPage />);
      
      const identifierInput = screen.getByLabelText('Email или username');
      fireEvent.change(identifierInput, { target: { value: 'ab' } });
      fireEvent.blur(identifierInput);
      
      await waitFor(() => {
        expect(screen.getByText(/слишком короткое значение/i)).toBeInTheDocument();
      });
    });

    it('должен показывать ошибку при пустом пароле', async () => {
      renderWithProviders(<LoginPage />);
      
      const identifierInput = screen.getByLabelText('Email или username');
      fireEvent.change(identifierInput, { target: { value: 'test@example.com' } });
      
      const submitButton = screen.getByRole('button', { name: /войти/i });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/укажите пароль/i)).toBeInTheDocument();
      });
    });

    it('должен показывать ошибку при коротком пароле', async () => {
      renderWithProviders(<LoginPage />);
      
      const passwordInput = screen.getByLabelText('Пароль');
      fireEvent.change(passwordInput, { target: { value: '123' } });
      fireEvent.blur(passwordInput);
      
      await waitFor(() => {
        expect(screen.getByText(/слишком короткий пароль/i)).toBeInTheDocument();
      });
    });

    it('не должен показывать ошибки при валидных данных', async () => {
      renderWithProviders(<LoginPage />);
      
      const identifierInput = screen.getByLabelText('Email или username');
      const passwordInput = screen.getByLabelText('Пароль');
      
      fireEvent.change(identifierInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      
      await waitFor(() => {
        expect(screen.queryByText(/укажите email/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/укажите пароль/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Отправка формы', () => {
    it('должен вызывать login при успешной валидации', async () => {
      // Mock функции login
      const mockLogin = vi.fn().mockResolvedValue(undefined);
      useAuthStore.setState({ login: mockLogin, loading: false, error: null });
      
      renderWithProviders(<LoginPage />);
      
      const identifierInput = screen.getByLabelText('Email или username');
      const passwordInput = screen.getByLabelText('Пароль');
      
      fireEvent.change(identifierInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      
      const submitButton = screen.getByRole('button', { name: /войти/i });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          identifier: 'test@example.com',
          password: 'password123',
        });
      });
    });

    it('должен навигировать на dashboard после успешного входа', async () => {
      const mockLogin = vi.fn().mockResolvedValue(undefined);
      useAuthStore.setState({ login: mockLogin, loading: false, error: null });
      
      renderWithProviders(<LoginPage />);
      
      const identifierInput = screen.getByLabelText('Email или username');
      const passwordInput = screen.getByLabelText('Пароль');
      
      fireEvent.change(identifierInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      
      const submitButton = screen.getByRole('button', { name: /войти/i });
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('dashboard')).toBeInTheDocument();
      });
    });

    it('должен показывать состояние загрузки', async () => {
      useAuthStore.setState({ loading: true, error: null });
      
      renderWithProviders(<LoginPage />);
      
      const submitButton = screen.getByRole('button', { name: /войти/i });
      expect(submitButton).toBeDisabled();
      expect(submitButton).toHaveTextContent(/вход\.\.\./i);
    });

    it('должен показывать ошибку при неудачном входе', async () => {
      useAuthStore.setState({ 
        loading: false, 
        error: 'Неверный логин или пароль',
      });
      
      renderWithProviders(<LoginPage />);
      
      expect(screen.getByText('Неверный логин или пароль')).toBeInTheDocument();
    });
  });

  describe('Доступность (a11y)', () => {
    it('должен иметь правильные label для инпутов', () => {
      renderWithProviders(<LoginPage />);
      
      expect(screen.getByLabelText('Email или username')).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'password');
    });

    it('должен иметь id у инпутов и htmlFor у label', () => {
      renderWithProviders(<LoginPage />);
      
      const identifierInput = screen.getByLabelText('Email или username');
      const passwordInput = screen.getByLabelText('Пароль');
      
      expect(identifierInput).toHaveAttribute('id', 'identifier');
      expect(passwordInput).toHaveAttribute('id', 'password');
    });
  });
});
