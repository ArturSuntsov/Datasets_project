/**
 * Хук для управления темой (светлая/тёмная)
 * 
 * Использование:
 * const { theme, toggleTheme } = useTheme();
 * 
 * Особенности:
 * - Сохранение выбора в localStorage
 * - Авто-определение системной темы при первом запуске
 * - Плавные переходы между темами
 */

import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

export function useTheme() {
  // Инициализация: читаем из localStorage или определяем по системе
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('theme') as Theme | null;
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
      // Авто-определение по системной теме
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch (e) {
      console.error('Error reading theme from localStorage:', e);
    }
    return 'light';
  });

  // Применяем тему к document при изменении
  useEffect(() => {
    const root = document.documentElement;
    
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    
    // Сохраняем в localStorage
    try {
      localStorage.setItem('theme', theme);
    } catch (e) {
      console.error('Error saving theme to localStorage:', e);
    }
  }, [theme]);

  // Переключатель темы
  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Установка конкретной темы
  const setThemeValue = (newTheme: Theme) => {
    setTheme(newTheme);
  };

  return { theme, toggleTheme, setTheme: setThemeValue };
}
