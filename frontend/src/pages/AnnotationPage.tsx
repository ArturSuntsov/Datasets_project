import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AnnotationCanvas from "../components/AnnotationCanvas";
import { annotatorAPI } from "../services/api";
import { BoundingBox } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";

export default function AnnotationPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [comment, setComment] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");

  const assignmentQuery = useQuery({
    queryKey: ["annotator-assignment", assignmentId],
    queryFn: () => annotatorAPI.detail(assignmentId!),
    enabled: !!assignmentId,
  });

  useEffect(() => {
    if (assignmentQuery.data) {
      setBoxes(assignmentQuery.data.draft?.boxes ?? []);
      setComment(assignmentQuery.data.comment ?? "");
      setSelectedLabel((assignmentQuery.data.label_schema?.[0]?.name as string | undefined) ?? "");
    }
  }, [assignmentQuery.data]);

  const submitMutation = useMutation({
    mutationFn: (isFinal: boolean) => annotatorAPI.submit(assignmentId!, { label_data: { boxes }, comment, is_final: isFinal }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["annotator-queue"] });
      await queryClient.invalidateQueries({ queryKey: ["annotator-assignment", assignmentId] });
      if (result.assignment_status === "submitted" || result.assignment_status === "accepted") {
        navigate("/labeling");
      }
    },
  });

  const removeLast = () => setBoxes((current) => current.slice(0, -1));
  const labels = useMemo(() => assignmentQuery.data?.label_schema ?? [], [assignmentQuery.data]);

  if (assignmentQuery.isLoading) {
    return <LoadingSpinner size="lg" />;
  }

  if (!assignmentQuery.data) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Assignment not found</h1>
        <Link to="/labeling" className="btn-primary mt-4 inline-block">Back to queue</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{assignmentQuery.data.project_title}</div>
          <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">BBox Annotation</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Assignment {assignmentQuery.data.assignment_id.slice(0, 8)} · frame {assignmentQuery.data.frame.frame_number}</p>
        </div>
        <Link to="/labeling" className="btn-secondary">Back to queue</Link>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr,0.36fr]">
        <div className="card">
          <AnnotationCanvas imageUrl={assignmentQuery.data.frame_url} value={boxes} currentLabel={selectedLabel} onBoxesChange={setBoxes} />
        </div>

        <div className="space-y-4">
          <div className="card space-y-3">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">Labels</div>
            <div className="flex flex-wrap gap-2">
              {labels.map((label) => (
                <button
                  key={label.name}
                  type="button"
                  onClick={() => setSelectedLabel(label.name)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition ${selectedLabel === label.name ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200"}`}
                >
                  {label.name}
                </button>
              ))}
            </div>
            <button type="button" className="btn-secondary w-full" onClick={removeLast} disabled={boxes.length === 0}>
              Remove last box
            </button>
          </div>

          <div className="card space-y-3">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">Instructions</div>
            <div className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">{assignmentQuery.data.instructions || "No project instructions added."}</div>
          </div>

          <div className="card space-y-3">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">Comment</div>
            <textarea className="input-field min-h-[120px]" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Optional note for reviewer or project owner" />
            {assignmentQuery.data.quality_signals?.too_fast ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Previous submission was flagged as unusually fast.</div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="btn-secondary" onClick={() => submitMutation.mutate(false)} disabled={submitMutation.isPending}>
                Save draft
              </button>
              <button type="button" className="btn-primary" onClick={() => submitMutation.mutate(true)} disabled={submitMutation.isPending || boxes.length === 0}>
                Submit
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
