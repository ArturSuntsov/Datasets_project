import React from "react";
import { useAuthStore } from "../store";
import { LoadingSpinner } from "../components/LoadingSpinner";

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const loadMe = useAuthStore((s) => s.loadMe);

  React.useEffect(() => {
    if (!user) loadMe();
  }, [user, loadMe]);

  if (loading && !user) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="text-sm font-semibold">Профиль</div>
        {user ? (
          <div className="mt-3 grid gap-2 text-sm">
            <div>
              <span className="text-gray-600 dark:text-gray-300">Username:</span> <span className="font-medium">{user.username}</span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-300">Email:</span> <span className="font-medium">{user.email}</span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-300">Role:</span> <span className="font-medium">{user.role}</span>
            </div>
            {typeof user.rating === "number" ? (
              <div>
                <span className="text-gray-600 dark:text-gray-300">Rating:</span> <span className="font-medium">{user.rating.toFixed(2)}</span>
              </div>
            ) : null}
            {user.balance ? (
              <div>
                <span className="text-gray-600 dark:text-gray-300">Balance:</span> <span className="font-medium">{user.balance}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 text-sm text-gray-600">Профиль не загружен</div>
        )}
      </div>
    </div>
  );
}

