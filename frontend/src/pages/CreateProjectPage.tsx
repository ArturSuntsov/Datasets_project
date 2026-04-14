import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { projectsAPI, cvAnnotationAPI } from "../services/api";

type ProjectType = "standard" | "cv"; // standard = обычный, cv = computer vision

export default function CreateProjectPage() {
  console.log('🚀 CreateProjectPage РЕНДЕРится!');
  
  const navigate = useNavigate();
  const [projectType, setProjectType] = useState<ProjectType>("cv");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [annotationType, setAnnotationType] = useState("bbox"); // только для CV
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Создать проект
      let projectId: string;

      if (projectType === "cv") {
        const cvProject = await cvAnnotationAPI.createProject(
          title,
          annotationType,
          description
        );
        projectId = cvProject.id;
      } else {
        const project = await projectsAPI.create({
          title,
          description,
          status: "active",
        });
        projectId = project.id;
      }

      setCreatedProjectId(projectId);

      // 2. Загрузить файлы (если есть)
      if (files.length > 0 && projectType === "cv") {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          setUploadProgress(((i + 1) / files.length) * 100);
          
          await cvAnnotationAPI.uploadFile(projectId, file);
        }
      }

      // 3. Перенаправить на страницу разметки (CV проекты несовместимы с projectsAPI)
      navigate(`/projects/${projectId}/annotation`);
    } catch (err: any) {
      console.error("Error creating project:", err);
      setError(err.response?.data?.error || err.response?.data?.detail || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Creating project...</p>
          {uploadProgress > 0 && (
            <p className="mt-2 text-sm text-gray-500">
              Uploading files: {Math.round(uploadProgress)}%
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Create New Project</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Тип проекта */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Project Type
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setProjectType("cv")}
              className={`p-4 border-2 rounded-lg text-left transition ${
                projectType === "cv"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <div className="font-semibold">Computer Vision</div>
              <div className="text-sm text-gray-600">
                Images & video annotation
              </div>
            </button>
            <button
              type="button"
              onClick={() => setProjectType("standard")}
              className={`p-4 border-2 rounded-lg text-left transition ${
                projectType === "standard"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <div className="font-semibold">Standard</div>
              <div className="text-sm text-gray-600">Text, audio, other data</div>
            </button>
          </div>
        </div>

        {/* Название */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Project Name *
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., Drone Detection Dataset"
          />
        </div>

        {/* Описание */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Describe your project..."
          />
        </div>

        {/* Тип аннотации (только для CV) */}
        {projectType === "cv" && (
          <div>
            <label htmlFor="annotationType" className="block text-sm font-medium text-gray-700 mb-1">
              Annotation Type
            </label>
            <select
              id="annotationType"
              value={annotationType}
              onChange={(e) => setAnnotationType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="bbox">Bounding Boxes (выделение объектов рамками)</option>
              <option value="polygon">Polygons (полигоны)</option>
              <option value="keypoints">Keypoints (ключевые точки)</option>
              <option value="classification">Classification (классификация)</option>
            </select>
          </div>
        )}

        {/* Загрузка файлов (только для CV) */}
        {projectType === "cv" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Files (images, videos)
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer text-blue-600 hover:text-blue-700"
              >
                Click to upload
              </label>
              <p className="text-sm text-gray-500 mt-2">
                Supported: JPG, PNG, GIF, MP4, AVI, MOV (max 500MB)
              </p>
              <p className="text-xs text-blue-600 mt-1">
                💡 Видео автоматически разбивается на кадры (1 кадр/сек)
              </p>
            </div>

            {/* Список файлов */}
            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  Selected files ({files.length}):
                </p>
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-gray-50 px-4 py-2 rounded"
                  >
                    <span className="text-sm truncate flex-1">
                      {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-red-600 hover:text-red-800 ml-4"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Кнопки */}
        <div className="flex gap-4">
          <button
            type="submit"
            className="flex-1 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!title || loading}
          >
            {loading ? "Creating..." : "Create Project"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
