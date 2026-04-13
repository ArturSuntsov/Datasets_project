import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Глобальные переменные для тестов (describe, it, expect, и т.д.)
    globals: true,
    // Окружение для тестов компонентов React
    environment: 'jsdom',
    // Настройка setup файла
    setupFiles: ['./src/tests/setup.ts'],
    // Папка с тестами
    dir: './src/tests',
    // Включение coverage отчета
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/tests/**', 'src/**/*.d.ts', 'src/main.tsx'],
    },
    // Трансформация модулей
    transformMode: {
      web: [/\.[jt]sx$/],
    },
    // Сериализаторы для snapshot тестов
    snapshotSerializers: [],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
