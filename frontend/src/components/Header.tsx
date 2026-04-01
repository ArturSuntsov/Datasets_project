import React from "react";
import { NavLink } from "react-router-dom";
import { useAuthStore } from "../store";

export function Header() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-center gap-3">
        <div className="text-sm font-bold tracking-tight">Dataset AI Marketplace</div>
        <NavLink to="/" className="text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
          Дашборд
        </NavLink>
      </div>

      <div className="flex items-center gap-3">
        {user ? (
          <>
            <div className="text-xs text-gray-600 dark:text-gray-300">
              {user.username} ({user.role})
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900"
            >
              Выйти
            </button>
          </>
        ) : (
          <NavLink to="/login" className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
            Вход
          </NavLink>
        )}
      </div>
    </header>
  );
}

