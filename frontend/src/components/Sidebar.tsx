/**
 * Боковая навигационная панель (Sidebar)
 * 
 * Особенности:
 * - Увеличенная ширина (280px / w-72)
 * - Правильные отступы в пунктах меню
 * - Активные состояния с выделением
 * - Hover-эффекты на всех пунктах
 * - Поддержка тёмной темы
 */

import { NavLink } from "react-router-dom";
import { useAuthStore } from "../store";
import { Role } from "../types";

type NavItem = {
  to: string;
  label: string;
  icon: string;
  roles: Role[];
};

const items: NavItem[] = [
  { to: "/", label: "Дашборд", icon: "📊", roles: ["customer", "annotator", "admin"] },
  { to: "/datasets", label: "Датасеты", icon: "📁", roles: ["customer", "admin"] },
  { to: "/tasks", label: "Задачи", icon: "✅", roles: ["customer", "annotator", "admin"] },
  { to: "/labeling", label: "Разметка", icon: "🏷️", roles: ["annotator"] },
  { to: "/quality", label: "Качество", icon: "⭐", roles: ["customer", "admin"] },
  { to: "/finance", label: "Финансы", icon: "💰", roles: ["customer", "annotator", "admin"] },
  { to: "/profile", label: "Профиль", icon: "👤", roles: ["customer", "annotator", "admin"] },
];

export function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const availableItems = items.filter((item) => (user?.role ? item.roles.includes(user.role) : false));

  return (
    <aside className="fixed left-0 top-0 h-full w-72 min-w-[280px] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-colors duration-300 z-40">

      {/* Логотип */}
      <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <NavLink to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <span className="text-lg font-bold bg-gradient-primary bg-clip-text text-transparent">
            Dataset AI
          </span>
        </NavLink>
      </div>

      {/* Меню навигации */}
      <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        {availableItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`
            }
          >
            <span className="mr-3 text-lg">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Профиль пользователя внизу */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white font-semibold shadow-md">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {user.username}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {user.role}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Не авторизован
          </p>
        )}
      </div>
    </aside>
  );
}
