import { Link } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { annotatorAPI } from "../services/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuthStore } from "../store";

type ProjectTab = "available" | "active";

export function LabelingPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<ProjectTab>("available");

  const projectsQuery = useQuery({
    queryKey: ["annotator-projects"],
    queryFn: () => annotatorAPI.projects(),
    enabled: user?.role === "annotator" || user?.role === "admin",
  });

  if (user?.role !== "annotator" && user?.role !== "admin") {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Annotation Projects</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">This workspace is available to annotators and admins.</p>
      </div>
    );
  }

  const availableProjects = projectsQuery.data?.available_projects ?? [];
  const activeProjects = projectsQuery.data?.active_projects ?? [];
  const visibleProjects = tab === "available" ? availableProjects : activeProjects;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Project Annotation Flow</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          First open a project, review its instructions, and then work through your frames sequentially.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card">
          <div className="text-sm text-gray-500 dark:text-gray-400">Available projects</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{availableProjects.length}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 dark:text-gray-400">Active projects</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{activeProjects.length}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 dark:text-gray-400">Assignments in queue</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
            {availableProjects.reduce((sum, item) => sum + item.available_count, 0) + activeProjects.reduce((sum, item) => sum + item.active_count, 0)}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" className={`btn-secondary ${tab === "available" ? "ring-2 ring-blue-400" : ""}`} onClick={() => setTab("available")}>
          Available Projects
        </button>
        <button type="button" className={`btn-secondary ${tab === "active" ? "ring-2 ring-blue-400" : ""}`} onClick={() => setTab("active")}>
          Active Projects
        </button>
      </div>

      {projectsQuery.isLoading ? (
        <div className="card flex justify-center p-10">
          <LoadingSpinner size="lg" />
        </div>
      ) : projectsQuery.isError ? (
        <div className="card p-10 text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Could not load projects</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {(projectsQuery.error as any)?.response?.data?.detail || (projectsQuery.error as Error)?.message || "Check backend availability and try again."}
          </p>
        </div>
      ) : visibleProjects.length === 0 ? (
        <div className="card p-10 text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">No projects in this tab</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {tab === "available" ? "Projects with new assignments will appear here." : "Projects with started work will appear here."}
          </p>
          {tab === "available" ? (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              If a customer just uploaded media, they still need to click <span className="font-medium">Finalize import</span> before projects and assignments become visible here.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visibleProjects.map((project) => (
            <div key={project.project_id} className="card space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{project.project_status}</div>
                  <h2 className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{project.project_title}</h2>
                </div>
                <span className="badge badge-warning">{tab === "active" ? `${project.active_count} active` : `${project.available_count} available`}</span>
              </div>

              <div className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
                {project.instructions || "No project instructions yet."}
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{project.label_schema.length} labels</span>
                <span>{project.total_assignments} total assignments</span>
                <span>{project.submitted_count} submitted</span>
                <span>{project.accepted_count} accepted</span>
              </div>

              <div className="flex justify-end">
                <Link to={`/labeling/projects/${project.project_id}`} className="btn-primary">
                  Open Project
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
