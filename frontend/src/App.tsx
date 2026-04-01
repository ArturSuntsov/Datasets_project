import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./store";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";

import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DatasetsPage } from "./pages/DatasetsPage";
import { DatasetDetailPage } from "./pages/DatasetDetailPage";
import { TasksPage } from "./pages/TasksPage";
import { LabelingPage } from "./pages/LabelingPage";
import { QualityPage } from "./pages/QualityPage";
import { FinancePage } from "./pages/FinancePage";
import { ProfilePage } from "./pages/ProfilePage";

function RequireAuth({ children }: { children: React.ReactElement }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout>
              <DashboardPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/datasets"
        element={
          <RequireAuth>
            <AppLayout>
              <DatasetsPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/datasets/:id"
        element={
          <RequireAuth>
            <AppLayout>
              <DatasetDetailPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/tasks"
        element={
          <RequireAuth>
            <AppLayout>
              <TasksPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/labeling"
        element={
          <RequireAuth>
            <AppLayout>
              <LabelingPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/quality"
        element={
          <RequireAuth>
            <AppLayout>
              <QualityPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/finance"
        element={
          <RequireAuth>
            <AppLayout>
              <FinancePage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <AppLayout>
              <ProfilePage />
            </AppLayout>
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

