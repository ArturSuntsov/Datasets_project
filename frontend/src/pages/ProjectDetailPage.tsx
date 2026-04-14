import React, { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { projectsAPI, cvAnnotationAPI, Project, UploadResponse } from "../services/api";
import { LoadingSpinner } from "../components/LoadingSpinner";

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Состояние для загрузки файлов
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; uri: string }>>([]);

  // Состояние для задач
  const [tasks, setTasks] = useState<Array<{ task_id: string; status: string; frame_url: string | null }>>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  // Загрузка данных проекта
  React.useEffect(() => {
    async function loadProject() {
      if (!projectId) return;

      try {
        setLoading(true);
        const data = await projectsAPI.get(projectId);
        setProject(data);
      } catch (err: any) {
        console.error("Error loading project:", err);
        setError(err.response?.data?.detail || "Failed to load project");
      } finally {
        setLoading(false);
      }
    }

    loadProject();
  }, [projectId]);

  // Загрузка задач
  React.useEffect(() => {
    async function loadTasks() {
      if (!projectId) return;

      try {
        setTasksLoading(true);
        const data = await cvAnnotationAPI.getProjectTasks(projectId);
        setTasks(data);
      } catch (err: any) {
        console.error("Error loading tasks:", err);
        // Не критично - задачи могут отсут
      } finally {
        setTasksLoading(false);
      }
    }

    if (project) {
      loadTasks();
    }
  }, [project, projectId]);

  // Загрузка файлов
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !projectId) return;

    const files = Array.from(e.target.files);
    setUploading(true);
    setUploadProgress(0);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const result: UploadResponse = await cvAnnotationAPI.uploadFile(projectId, file);
        
        setUploadedFiles(prev => [...prev, {
          name: result.file_name,
          uri: result.file_uri,
        }]);
        
        setUploadProgress(((i + 1) / files.length) * 100);
      }

      // Перезагружаем задачи
      const updatedTasks = await cvAnnotationAPI.getProjectTasks(projectId);
      setTasks(updatedTasks);
    } catch (err: any) {
      console.error("Error uploading files:", err);
      alert(`Upload failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h3 className="text-red-800 font-semibold mb-2">Error</h3>
          <p className="text-red-600 mb-4">{error || "Project not found"}</p>
          <button
            onClick={() => navigate("/")}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Заголовок проекта */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {project.title}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {project.description || "No description"}
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              to={`/projects/${projectId}/annotation`}
              className="btn-primary"
            >
              🎯 Start Annotation
            </Link>
            <button
              onClick={() => navigate(-1)}
              className="btn-secondary"
            >
              ← Back
            </button>
          </div>
        </div>

        {/* Информация о проекте */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Status</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
              {project.status}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Tasks</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {tasks.length}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Files</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {uploadedFiles.length}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Created</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {new Date(project.created_at).toLocaleDateString("ru-RU")}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Загрузка файлов */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            📤 Upload Files
          </h2>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
              disabled={uploading}
            />
            <label
              htmlFor="file-upload"
              className={`cursor-pointer ${
                uploading ? "opacity-50 cursor-not-allowed" : "text-blue-600 hover:text-blue-700"
              }`}
            >
              {uploading ? "Uploading..." : "Click to upload"}
            </label>
            <p className="text-sm text-gray-500 mt-2">
              Supported: JPG, PNG, GIF, MP4, AVI, MOV (max 10MB each)
            </p>

            {uploading && (
              <div className="mt-4">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Uploading: {Math.round(uploadProgress)}%
                </p>
              </div>
            )}
          </div>

          {/* Загруженные файлы */}
          {uploadedFiles.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Uploaded files:
              </h3>
              <div className="space-y-2">
                {uploadedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 px-4 py-2 rounded"
                  >
                    <span className="text-sm truncate flex-1">
                      {file.name}
                    </span>
                    <a
                      href={file.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 ml-4 text-sm"
                    >
                      View →
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Список задач */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            📋 Tasks
          </h2>

          {tasksLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="md" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No tasks yet. Upload files to create tasks.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <div
                  key={task.task_id}
                  className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 px-4 py-3 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="text-sm font-mono text-gray-900 dark:text-white">
                      Task {task.task_id.slice(0, 8)}...
                    </p>
                    {task.frame_url && (
                      <a
                        href={task.frame_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        View image →
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`badge ${
                        task.status === "done"
                          ? "badge-success"
                          : task.status === "in_progress"
                          ? "badge-warning"
                          : "badge-secondary"
                      }`}
                    >
                      {task.status}
                    </span>
                    {task.status === "pending" && (
                      <Link
                        to={`/projects/${projectId}/annotation`}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Annotate →
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
