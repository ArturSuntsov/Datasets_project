/**
 * Единый Layout компонент для всех защищённых страниц
 * 
 * Особенности:
 * - Фиксированный сайдбар слева (w-72)
 * - Фиксированный header сверху (h-16)
 * - Основной контент с правильными отступами
 * - Min-h-screen для предотвращения обрезания
 * - Поддержка тёмной темы
 */

import React from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      
      {/* Фиксированный сайдбар слева */}
      <Sidebar />
      
      {/* Правая часть: header + контент */}
      <div className="flex-1 flex flex-col min-h-screen">
        
        {/* Фиксированный header сверху */}
        <Header />
        
        {/* Основной контент с отступами */}
        <main className="flex-1 ml-72 mt-16 p-8 overflow-auto">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
