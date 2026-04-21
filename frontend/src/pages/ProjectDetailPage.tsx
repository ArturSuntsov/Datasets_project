import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { projectsAPI, workflowAPI } from "../services/api";
import { LoadingSpinner } from "../components/LoadingSpinner";

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const [activeImportId, setActiveImportId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [exportPayload, setExportPayload] = useState<string | null>(null);

  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectsAPI.get(projectId!),
    enabled: !!projectId,
  });

  const overviewQuery = useQuery({
    queryKey: ["project-overview", projectId],
    queryFn: () => workflowAPI.overview(projectId!),
    enabled: !!projectId,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!projectId || uploadQueue.length === 0) {
        return null;
      }
      let currentImportId = activeImportId;
      let latest = null;
      for (const file of uploadQueue) {
        latest = await workflowAPI.upload(projectId, file, currentImportId);
        currentImportId = latest.import_id;
      }
      return latest;
    },
    onSuccess: (result) => {
      if (result?.import_id) {
        setActiveImportId(result.import_id);
      }
      setUploadQueue([]);
      setUploadError(null);
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
    onError: (err: any) => {
      setUploadError(err.response?.data?.detail || err.response?.data?.error || "Upload failed");
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!projectId || !activeImportId) {
        throw new Error("Nothing to finalize");
      }
      return workflowAPI.finalize(projectId, activeImportId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => workflowAPI.export(projectId!),
    onSuccess: (payload) => {
      setExportPayload(JSON.stringify(payload, null, 2));
    },
  });

  const overview = overviewQuery.data;
  const lastUploadPreview = uploadMutation.data?.preview;

  const completion = useMemo(() => {
    const total = Number(overview?.work_items?.total || 0);
    const done = Number(overview?.work_items?.completed || 0);
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }, [overview]);

  if (projectQuery.isLoading) {
    return <LoadingSpinner size="lg" />;
  }

  if (!projectQuery.data) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">Project not found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {projectQuery.data.project_type} / {projectQuery.data.annotation_type}
          </div>
          <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{projectQuery.data.title}</h1>
          <p className="mt-3 max-w-3xl text-sm text-gray-600 dark:text-gray-400">{projectQuery.data.description}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to={`/projects/${projectId}/workflow`} className="btn-secondary">
            Настройка разметки
          </Link>
          <button className="btn-secondary" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
            {exportMutation.isPending ? "Exporting..." : "Export COCO JSON"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="card">
          <div className="text-sm text-gray-500 dark:text-gray-400">Frames</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{overview?.imports?.frames_total ?? 0}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 dark:text-gray-400">Work items</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{overview?.work_items?.total ?? 0}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 dark:text-gray-400">Pending review</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{overview?.reviews?.pending ?? 0}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 dark:text-gray-400">Completion</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{completion}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="card space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Import media</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Upload images or videos. Videos are split into frames using the project frame interval.</p>
          </div>
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={(event) => setUploadQueue(Array.from(event.target.files ?? []))}
            className="block w-full text-sm text-gray-600 dark:text-gray-300"
          />
          {uploadQueue.length > 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-800 dark:bg-gray-950">
              {uploadQueue.map((file) => (
                <div key={file.name} className="flex items-center justify-between py-1">
                  <span>{file.name}</span>
                  <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" type="button" onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending || uploadQueue.length === 0}>
              {uploadMutation.isPending ? "Uploading..." : "Upload to preview"}
            </button>
            <button className="btn-secondary" type="button" onClick={() => finalizeMutation.mutate()} disabled={!activeImportId || finalizeMutation.isPending}>
              {finalizeMutation.isPending ? "Finalizing..." : "Finalize import"}
            </button>
          </div>
          {uploadError ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{uploadError}</div> : null}
          {lastUploadPreview ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
              <div>Processed assets: {lastUploadPreview.assets_processed}</div>
              <div>Failed assets: {lastUploadPreview.assets_failed}</div>
              <div>Frames detected: {lastUploadPreview.frames_total}</div>
              {lastUploadPreview.errors.length > 0 ? <div className="mt-2">Errors: {lastUploadPreview.errors.join("; ")}</div> : null}
            </div>
          ) : null}
        </div>

        <div className="card space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Workflow configuration</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Fixed defaults for the MVP vertical slice.</p>
          </div>
          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <div>Labels: {projectQuery.data.label_schema.map((item) => item.name).join(", ") || "—"}</div>
            <div>Frame interval: {projectQuery.data.frame_interval_sec}s</div>
            <div>Annotators per frame: {projectQuery.data.assignments_per_task}</div>
            <div>Agreement threshold: {projectQuery.data.agreement_threshold}</div>
            <div>IoU threshold: {projectQuery.data.iou_threshold}</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-800 dark:bg-gray-950">
            <div className="font-medium text-gray-900 dark:text-white">Instructions</div>
            <div className="mt-2 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{projectQuery.data.instructions || "No instructions added yet."}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Annotator quality snapshot</h2>
          {overviewQuery.isFetching ? <span className="text-sm text-gray-500">Refreshing…</span> : null}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="table min-w-full text-sm">
            <thead>
              <tr>
                <th className="py-2 pr-3 text-left">Annotator</th>
                <th className="py-2 pr-3 text-left">Rating</th>
                <th className="py-2 pr-3 text-left">Open</th>
                <th className="py-2 pr-3 text-left">Submitted</th>
                <th className="py-2 pr-3 text-left">Conflict rate</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.annotators ?? []).map((annotator) => (
                <tr key={annotator.user_id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-3">{annotator.username}</td>
                  <td className="py-2 pr-3">{annotator.rating?.toFixed(2) ?? "0.00"}</td>
                  <td className="py-2 pr-3">{annotator.open_assignments}</td>
                  <td className="py-2 pr-3">{annotator.submitted_assignments}</td>
                  <td className="py-2 pr-3">{annotator.conflict_rate?.toFixed(2) ?? "0.00"}</td>
                </tr>
              ))}
              {(overview?.annotators ?? []).length === 0 ? (
                <tr>
                  <td className="py-4 text-gray-500" colSpan={5}>No annotators assigned yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {exportPayload ? (
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Export preview</h2>
          <pre className="mt-4 max-h-[420px] overflow-auto rounded-lg bg-gray-950 p-4 text-xs text-green-200">{exportPayload}</pre>
        </div>
      ) : null}
    </div>
  );
}
