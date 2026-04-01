import React from "react";
import { NavLink } from "react-router-dom";

type NavItem = {
  to: string;
  label: string;
};

const items: NavItem[] = [
  { to: "/", label: "Дашборд" },
  { to: "/datasets", label: "Датасеты" },
  { to: "/tasks", label: "Задачи" },
  { to: "/labeling", label: "Разметка" },
  { to: "/quality", label: "Качество" },
  { to: "/finance", label: "Финансы" },
  { to: "/profile", label: "Профиль" },
];

function linkClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? "block rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white dark:bg-gray-100 dark:text-gray-900"
    : "block rounded-md px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800";
}

export function Sidebar() {
  return (
    <aside className="w-64 shrink-0 border-r border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
      <nav className="space-y-1">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) => linkClass({ isActive })}
          >
            {it.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

