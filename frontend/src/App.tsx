import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./store";
import { Layout } from "./components/Layout";

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

export default function App() {
  return (
    <Routes>
      {/* Публичные страницы — без Layout */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Защищённые страницы — с Layout */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout>
              <DashboardPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/datasets"
        element={
          <RequireAuth>
            <Layout>
              <DatasetsPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/datasets/:id"
        element={
          <RequireAuth>
            <Layout>
              <DatasetDetailPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/tasks"
        element={
          <RequireAuth>
            <Layout>
              <TasksPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/labeling"
        element={
          <RequireAuth>
            <Layout>
              <LabelingPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/quality"
        element={
          <RequireAuth>
            <Layout>
              <QualityPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/finance"
        element={
          <RequireAuth>
            <Layout>
              <FinancePage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <Layout>
              <ProfilePage />
            </Layout>
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

