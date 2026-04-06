/**
 * Тесты для API клиента (services/api.ts).
 * 
 * Проверяет:
 * - Функции работы с токенами (get/set/clear)
 * - Настройку axios instance
 * - Интерсепторы для авторизации
 * - API методы (auth, datasets, tasks, finance)
 * - Обработку ошибок
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  api,
  authAPI,
  datasetsAPI,
  tasksAPI,
  financeAPI,
  qualityAPI,
  throwApiError,
} from '../services/api';

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTokens();
  });

  describe('Работа с токенами', () => {
    describe('getAccessToken', () => {
      it('должен возвращать null когда токен не установлен', () => {
        expect(getAccessToken()).toBeNull();
      });

      it('должен возвращать токен после установки', () => {
        setTokens('test_access_token');
        expect(getAccessToken()).toBe('test_access_token');
      });

      it('должен возвращать null при ошибке localStorage', () => {
        // Mock localStorage с ошибкой
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
          throw new Error('Storage error');
        });

        expect(getAccessToken()).toBeNull();
      });
    });

    describe('getRefreshToken', () => {
      it('должен возвращать null когда refresh токен не установлен', () => {
        expect(getRefreshToken()).toBeNull();
      });

      it('должен возвращать refresh токен после установки', () => {
        setTokens('access_token', 'refresh_token');
        expect(getRefreshToken()).toBe('refresh_token');
      });
    });

    describe('setTokens', () => {
      it('должен сохранять access токен', () => {
        setTokens('new_access_token');
        expect(getAccessToken()).toBe('new_access_token');
      });

      it('должен сохранять refresh токен', () => {
        setTokens('access', 'refresh');
        expect(getRefreshToken()).toBe('refresh');
      });

      it('должен обновлять существующие токены', () => {
        setTokens('old_access', 'old_refresh');
        setTokens('new_access', 'new_refresh');
        
        expect(getAccessToken()).toBe('new_access');
        expect(getRefreshToken()).toBe('new_refresh');
      });

      it('должен работать без refresh токена', () => {
        setTokens('access_only');
        expect(getAccessToken()).toBe('access_only');
      });

      it('должен игнорировать ошибки storage', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
          throw new Error('Storage full');
        });

        // Не должно выбрасывать исключение
        expect(() => setTokens('token')).not.toThrow();
      });
    });

    describe('clearTokens', () => {
      it('должен удалять оба токена', () => {
        setTokens('access', 'refresh');
        clearTokens();
        
        expect(getAccessToken()).toBeNull();
        expect(getRefreshToken()).toBeNull();
      });

      it('должен работать когда токены не установлены', () => {
        expect(() => clearTokens()).not.toThrow();
      });
    });
  });

  describe('Axios instance', () => {
    it('должен создавать instance с правильным baseURL', () => {
      // В dev режиме baseURL должен быть пустым (прокси через Vite)
      expect(api.defaults.baseURL).toBe('');
    });

    it('должен иметь timeout 30000ms', () => {
      expect(api.defaults.timeout).toBe(30000);
    });

    it('должен добавлять Authorization header при наличии токена', () => {
      setTokens('test_token');
      
      // Проверяем что interceptor настроен
      const config = { headers: {} };
      const result = (api.interceptors.request as any).handlers[0].fulfilled(config);
      
      expect(result.headers.Authorization).toBe('Bearer test_token');
    });

    it('должен работать без токена', () => {
      clearTokens();
      
      const config = { headers: {} };
      const result = (api.interceptors.request as any).handlers[0].fulfilled(config);
      
      expect(result.headers.Authorization).toBeUndefined();
    });
  });

  describe('Auth API', () => {
    beforeEach(() => {
      vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });
      vi.spyOn(axios, 'get').mockResolvedValue({ data: {} });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('должен вызывать POST /api/auth/login/', async () => {
      const mockPost = vi.spyOn(axios, 'post').mockResolvedValue({
        data: { access: 'token', user: { id: '1', email: 'test@example.com' } },
      });

      await authAPI.login({ identifier: 'test', password: 'password' });

      expect(mockPost).toHaveBeenCalledWith('/api/auth/login/', {
        identifier: 'test',
        password: 'password',
      });
    });

    it('должен вызывать POST /api/auth/register/', async () => {
      const mockPost = vi.spyOn(axios, 'post').mockResolvedValue({
        data: { access: 'token', user: { id: '1' } },
      });

      await authAPI.register({
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        role: 'customer',
      });

      expect(mockPost).toHaveBeenCalledWith('/api/auth/register/', {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        role: 'customer',
      });
    });

    it('должен вызывать GET /api/users/me/', async () => {
      const mockGet = vi.spyOn(axios, 'get').mockResolvedValue({
        data: { id: '1', email: 'test@example.com', role: 'customer' },
      });

      await authAPI.me();

      expect(mockGet).toHaveBeenCalledWith('/api/users/me/');
    });
  });

  describe('Datasets API', () => {
    beforeEach(() => {
      vi.spyOn(axios, 'get').mockResolvedValue({ data: {} });
      vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });
      vi.spyOn(axios, 'patch').mockResolvedValue({ data: {} });
      vi.spyOn(axios, 'delete').mockResolvedValue({ data: {} });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('должен вызывать GET /api/datasets/ с параметрами', async () => {
      const mockGet = vi.spyOn(axios, 'get').mockResolvedValue({
        data: { items: [], total: 0 },
      });

      await datasetsAPI.list({ limit: 10, offset: 0, status: 'active' });

      expect(mockGet).toHaveBeenCalledWith('/api/datasets/', {
        params: { limit: 10, offset: 0, status: 'active' },
      });
    });

    it('должен вызывать POST /api/datasets/ с JSON', async () => {
      const mockPost = vi.spyOn(axios, 'post').mockResolvedValue({
        data: { id: '1', name: 'Test' },
      });

      await datasetsAPI.create({ name: 'Test Dataset' });

      expect(mockPost).toHaveBeenCalledWith('/api/datasets/', { name: 'Test Dataset' });
    });

    it('должен вызывать POST /api/datasets/ с FormData', async () => {
      const mockPost = vi.spyOn(axios, 'post').mockResolvedValue({
        data: { id: '1', name: 'File Dataset' },
      });

      const formData = new FormData();
      formData.append('file', new File(['test'], 'test.txt'));

      await datasetsAPI.create(formData);

      expect(mockPost).toHaveBeenCalledWith('/api/datasets/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    });

    it('должен вызывать GET /api/datasets/:id/', async () => {
      const mockGet = vi.spyOn(axios, 'get').mockResolvedValue({
        data: { id: '123', name: 'Detail' },
      });

      await datasetsAPI.detail('123');

      expect(mockGet).toHaveBeenCalledWith('/api/datasets/123/');
    });

    it('должен вызывать PATCH /api/datasets/:id/', async () => {
      const mockPatch = vi.spyOn(axios, 'patch').mockResolvedValue({
        data: { id: '123', name: 'Updated' },
      });

      await datasetsAPI.update('123', { name: 'Updated Name' });

      expect(mockPatch).toHaveBeenCalledWith('/api/datasets/123/', { name: 'Updated Name' });
    });

    it('должен вызывать DELETE /api/datasets/:id/', async () => {
      const mockDelete = vi.spyOn(axios, 'delete').mockResolvedValue({});

      await datasetsAPI.remove('123');

      expect(mockDelete).toHaveBeenCalledWith('/api/datasets/123/');
    });
  });

  describe('Tasks API', () => {
    beforeEach(() => {
      vi.spyOn(axios, 'get').mockResolvedValue({ data: {} });
      vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });
      vi.spyOn(axios, 'patch').mockResolvedValue({ data: {} });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('должен вызывать POST /api/tasks/', async () => {
      const mockPost = vi.spyOn(axios, 'post').mockResolvedValue({
        data: { id: '1', title: 'New Task' },
      });

      await tasksAPI.create({ title: 'New Task', dataset_id: '1' });

      expect(mockPost).toHaveBeenCalledWith('/api/tasks/', {
        title: 'New Task',
        dataset_id: '1',
      });
    });

    it('должен вызывать GET /api/tasks/ с параметрами', async () => {
      const mockGet = vi.spyOn(axios, 'get').mockResolvedValue({
        data: { items: [], total: 0 },
      });

      await tasksAPI.list({ limit: 20, offset: 0, status: 'pending' });

      expect(mockGet).toHaveBeenCalledWith('/api/tasks/', {
        params: { limit: 20, offset: 0, status: 'pending' },
      });
    });

    it('должен вызывать PATCH /api/tasks/:id/', async () => {
      const mockPatch = vi.spyOn(axios, 'patch').mockResolvedValue({
        data: { id: '1', status: 'completed' },
      });

      await tasksAPI.update('1', { status: 'completed' });

      expect(mockPatch).toHaveBeenCalledWith('/api/tasks/1/', { status: 'completed' });
    });

    it('должен вызывать PATCH /api/tasks/:id/annotate/', async () => {
      const mockPatch = vi.spyOn(axios, 'patch').mockResolvedValue({
        data: { id: '1', label_data: { class: 'cat' } },
      });

      await tasksAPI.annotate('1', {
        label_data: { class: 'cat' },
        is_final: true,
      });

      expect(mockPatch).toHaveBeenCalledWith('/api/tasks/1/annotate/', {
        label_data: { class: 'cat' },
        is_final: true,
      });
    });
  });

  describe('Quality API', () => {
    beforeEach(() => {
      vi.spyOn(axios, 'get').mockResolvedValue({ data: {} });
      vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('должен вызывать POST /api/quality/review/', async () => {
      const mockPost = vi.spyOn(axios, 'post').mockResolvedValue({
        data: { id: '1', review_status: 'pending' },
      });

      await qualityAPI.createReview({
        task_id: '1',
        dataset_id: '1',
        annotation_a_id: 'a1',
        annotation_b_id: 'a2',
      });

      expect(mockPost).toHaveBeenCalledWith('/api/quality/review/', {
        task_id: '1',
        dataset_id: '1',
        annotation_a_id: 'a1',
        annotation_b_id: 'a2',
      });
    });

    it('должен вызывать GET /api/quality/metrics/:datasetId/', async () => {
      const mockGet = vi.spyOn(axios, 'get').mockResolvedValue({
        data: { dataset_id: '1', items: [], total: 0 },
      });

      await qualityAPI.metrics('1', { limit: 10, offset: 0 });

      expect(mockGet).toHaveBeenCalledWith('/api/quality/metrics/1/', {
        params: { limit: 10, offset: 0 },
      });
    });
  });

  describe('Finance API', () => {
    beforeEach(() => {
      vi.spyOn(axios, 'get').mockResolvedValue({ data: {} });
      vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('должен вызывать GET /api/finance/transactions/', async () => {
      const mockGet = vi.spyOn(axios, 'get').mockResolvedValue({
        data: { items: [], total: 0 },
      });

      await financeAPI.transactions({ limit: 20, offset: 0, status: 'completed' });

      expect(mockGet).toHaveBeenCalledWith('/api/finance/transactions/', {
        params: { limit: 20, offset: 0, status: 'completed' },
      });
    });

    it('должен вызывать POST /api/finance/pay/', async () => {
      const mockPost = vi.spyOn(axios, 'post').mockResolvedValue({
        data: { transaction_id: '1', status: 'completed' },
      });

      await financeAPI.pay({ amount: 100, currency: 'USD' });

      expect(mockPost).toHaveBeenCalledWith('/api/finance/pay/', {
        amount: 100,
        currency: 'USD',
      });
    });

    it('должен вызывать POST /api/finance/withdraw/', async () => {
      const mockPost = vi.spyOn(axios, 'post').mockResolvedValue({
        data: { transaction_id: '1', status: 'completed' },
      });

      await financeAPI.withdraw({ amount: 50, currency: 'USD' });

      expect(mockPost).toHaveBeenCalledWith('/api/finance/withdraw/', {
        amount: 50,
        currency: 'USD',
      });
    });
  });

  describe('throwApiError', () => {
    it('должен выбрасывать ошибку с detail из axios response', () => {
      const error = {
        isAxiosError: true,
        response: { data: { detail: 'Custom error message' } },
        message: 'Request failed',
      };

      expect(() => throwApiError(error)).toThrow('Custom error message');
    });

    it('должен выбрасывать ошибку с message если нет detail', () => {
      const error = {
        isAxiosError: true,
        response: { data: {} },
        message: 'Network error',
      };

      expect(() => throwApiError(error)).toThrow('Network error');
    });

    it('должен выбрасывать ошибку для не-axios ошибок', () => {
      const error = new Error('Plain error');

      expect(() => throwApiError(error)).toThrow('Plain error');
    });
  });
});
