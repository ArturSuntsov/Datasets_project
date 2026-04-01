import React from "react";

type LoadingSpinnerProps = {
  label?: string;
};

export function LoadingSpinner({ label = "Загрузка..." }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center gap-3 py-4 text-sm text-gray-600">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      <span>{label}</span>
    </div>
  );
}

