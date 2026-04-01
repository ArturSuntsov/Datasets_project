/**
 * Настройка тестового окружения для Vitest + React Testing Library.
 * 
 * Включает:
 * - Глобальные утилиты @testing-library/jest-dom
 * - Mock для window.matchMedia (нужен для некоторых CSS-in-JS библиотек)
 * - Mock для localStorage
 */

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Очищаем DOM после каждого теста
afterEach(() => {
  cleanup();
});

// Mock для window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock для localStorage
const localStorageMock = {
  getItem: vi.fn((key: string) => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }),
  setItem: vi.fn((key: string, value: string) => {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Игнорируем ошибки storage
    }
  }),
  removeItem: vi.fn((key: string) => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Игнорируем ошибки storage
    }
  }),
  clear: vi.fn(() => {
    try {
      sessionStorage.clear();
    } catch {
      // Игнорируем ошибки storage
    }
  }),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock для window.scrollTo
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
});

// Mock для IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as unknown as typeof global.IntersectionObserver;
