import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { annotatorAPI } from "../services/api";
import { LoadingSpinner } from "../components/LoadingSpinner";

export default function AnnotatorProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const projectQuery = useQuery({
    queryKey: ["annotator-project-detail", projectId],
    queryFn: () => annotatorAPI.projectDetail(projectId!),
    enabled: !!projectId,
  });

  const nextAssignmentMutation = useMutation({
    mutationFn: () => annotatorAPI.nextProjectAssignment(projectId!),
    onSuccess: (result) => {
      navigate(`/labeling/assignments/${result.assignment_id}`);
    },
  });

  if (projectQuery.isLoading) {
    return <LoadingSpinner size="lg" />;
  }

  if (!projectQuery.data) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Project not found</h1>
        <Link to="/labeling" className="btn-primary mt-4 inline-block">
          Back to projects
        </Link>
      </div>
    );
  }

  const project = projectQuery.data;
  const primaryActionLabel = project.active_assignment_id ? "Continue labeling" : project.next_assignment_id ? "Start labeling" : "No assignments available";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{project.project_status}</div>
          <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{project.project_title}</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{project.description || "No project description."}</p>
        </div>
        <Link to="/labeling" className="btn-secondary">
          Back to projects
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="card">
          <div className="text-sm text-gray-500 dark:text-gray-400">Available</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{project.stats.available_count}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 dark:text-gray-400">Active</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{project.stats.active_count}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 dark:text-gray-400">Submitted</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{project.stats.submitted_count}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 dark:text-gray-400">Accepted</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{project.stats.accepted_count}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 dark:text-gray-400">Rejected</div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{project.stats.rejected_count}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr,0.42fr]">
        <div className="card space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Instructions</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Read the guidance carefully before you start. After that the system will show your frames one by one.
            </p>
          </div>

          <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
            {project.instructions || "No instructions added yet."}
          </div>

          {project.instructions_file_uri ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-gray-950">
              <div className="font-medium text-gray-900 dark:text-white">Attached instruction file</div>
              <div className="mt-2">
                <a className="text-blue-600 hover:underline dark:text-blue-400" href={project.instructions_file_uri} target="_blank" rel="noreferrer">
                  {project.instructions_file_name || "instruction"}
                </a>
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                v{project.instructions_version ?? 0}
                {project.instructions_updated_at ? ` | ${new Date(project.instructions_updated_at).toLocaleString()}` : ""}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary"
              onClick={() => nextAssignmentMutation.mutate()}
              disabled={nextAssignmentMutation.isPending || (!project.active_assignment_id && !project.next_assignment_id)}
            >
              {nextAssignmentMutation.isPending ? "Opening..." : primaryActionLabel}
            </button>
          </div>
          {nextAssignmentMutation.isError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">Could not open the next assignment.</div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="card space-y-3">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">Labels</div>
            <div className="space-y-2">
              {project.label_schema.map((label) => (
                <div key={label.name} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: label.color || "#2563eb" }} />
                    <span className="font-medium text-gray-900 dark:text-white">{label.name}</span>
                  </div>
                  {label.description ? <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">{label.description}</div> : null}
                </div>
              ))}
            </div>
          </div>

          <div className="card space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">Workflow settings</div>
            <div>Frame interval: {project.frame_interval_sec}s</div>
            <div>AI pre-labeling: {project.participant_rules?.ai_prelabel_enabled === false ? "disabled" : "enabled"}</div>
            <div>AI model: {String(project.participant_rules?.ai_model || "baseline-box-v1")}</div>
            <div>Tracking: {String(project.participant_rules?.tracking_algorithm || "CSRT")}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
