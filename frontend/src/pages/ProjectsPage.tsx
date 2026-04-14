import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { projectsAPI, Project } from "../services/api";
import { LoadingSpinner } from "../components/LoadingSpinner";

// Для CV проектов используем отдельный endpoint
// В MVP: показываем только обычные проекты
// TODO: объединить проекты из обоих источников

export default function ProjectsPage() {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectsAPI.list({ limit: 50, offset: 0 }),
    retry: 1,
  });

  const projects = projectsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            📁 Projects
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your annotation projects
          </p>
        </div>
        <Link to="/projects/create" className="btn-primary">
          ➕ New Project
        </Link>
      </div>

      {/* Список проектов */}
      {projectsQuery.isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 card">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            Loading projects...
          </p>
        </div>
      ) : projectsQuery.isError ? (
        <div className="card p-8 text-center">
          <svg
            className="w-16 h-16 text-red-500 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            Failed to load projects
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Check server connection and try again
          </p>
        </div>
      ) : projects.length === 0 ? (
        <div className="card p-12 text-center">
          <svg
            className="w-20 h-20 text-gray-400 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No projects yet
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Create your first annotation project to get started
          </p>
          <Link to="/projects/create" className="btn-primary inline-block">
            ➕ Create Project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project: Project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="group block card card-hover h-full"
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                    {project.title}
                  </h3>
                  <span
                    className={`badge flex-shrink-0 ml-2 ${
                      project.status === "active"
                        ? "badge-success"
                        : project.status === "open"
                        ? "badge-warning"
                        : "badge-secondary"
                    }`}
                  >
                    {project.status}
                  </span>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                  {project.description || "No description"}
                </p>

                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
                  <span>
                    Created{" "}
                    {new Date(project.created_at).toLocaleDateString("ru-RU")}
                  </span>
                  <span className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    Open →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
