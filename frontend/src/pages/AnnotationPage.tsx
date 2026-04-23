import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AnnotationCanvas from "../components/AnnotationCanvas";
import { annotatorAPI, projectsAPI } from "../services/api";
import { BoundingBox } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";

function clampNumber(raw: string, min: number, max: number, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export default function AnnotationPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [comment, setComment] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");
  const [selectedBoxIndex, setSelectedBoxIndex] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const assignmentQuery = useQuery({
    queryKey: ["annotator-assignment", assignmentId],
    queryFn: () => annotatorAPI.detail(assignmentId!),
    enabled: !!assignmentId,
  });

  const projectQuery = useQuery({
    queryKey: ["project", assignmentQuery.data?.project_id],
    queryFn: () => projectsAPI.get(assignmentQuery.data!.project_id),
    enabled: !!assignmentQuery.data?.project_id,
  });

  useEffect(() => {
    if (!assignmentQuery.data) return;
    const draftBoxes = assignmentQuery.data.draft?.boxes ?? [];
    const preAnnotatedBoxes = assignmentQuery.data.pre_annotations?.boxes ?? [];
    const initialBoxes = draftBoxes.length > 0 ? draftBoxes : preAnnotatedBoxes;
    setBoxes(initialBoxes);
    setComment(assignmentQuery.data.comment ?? "");
    setSelectedLabel((assignmentQuery.data.label_schema?.[0]?.name as string | undefined) ?? "");
    setSelectedBoxIndex(initialBoxes.length > 0 ? 0 : null);
  }, [assignmentQuery.data]);

  const labels = useMemo(() => assignmentQuery.data?.label_schema ?? [], [assignmentQuery.data]);
  const allowedLabels = useMemo(() => new Set(labels.map((label) => label.name)), [labels]);
  const selectedBox = selectedBoxIndex !== null ? boxes[selectedBoxIndex] ?? null : null;

  const submitMutation = useMutation({
    mutationFn: (isFinal: boolean) => annotatorAPI.submit(assignmentId!, { label_data: { boxes }, comment, is_final: isFinal }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["annotator-queue"] });
      await queryClient.invalidateQueries({ queryKey: ["annotator-projects"] });
      await queryClient.invalidateQueries({ queryKey: ["annotator-project-detail", assignmentQuery.data?.project_id] });
      await queryClient.invalidateQueries({ queryKey: ["annotator-assignment", assignmentId] });
      if (result.assignment_status === "submitted" || result.assignment_status === "accepted") {
        try {
          const next = await annotatorAPI.nextProjectAssignment(assignmentQuery.data!.project_id);
          navigate(`/labeling/assignments/${next.assignment_id}`);
          return;
        } catch {
          navigate(`/labeling/projects/${assignmentQuery.data!.project_id}`);
          return;
        }
      }
    },
  });

  const updateBox = (index: number, patch: Partial<BoundingBox>) => {
    setBoxes((current) => current.map((box, boxIndex) => (boxIndex === index ? { ...box, ...patch } : box)));
  };

  const removeSelectedBox = () => {
    if (selectedBoxIndex === null) return;
    setBoxes((current) => current.filter((_, index) => index !== selectedBoxIndex));
    setSelectedBoxIndex((current) => {
      if (current === null) return null;
      if (boxes.length <= 1) return null;
      return Math.max(0, current - 1);
    });
  };

  const validateBeforeSubmit = (): string | null => {
    if (!assignmentQuery.data) {
      return "Assignment not loaded";
    }
    const frameWidth = assignmentQuery.data.frame.width;
    const frameHeight = assignmentQuery.data.frame.height;
    if (boxes.length === 0) {
      return "Add at least one bounding box.";
    }
    for (const [index, box] of boxes.entries()) {
      if (!Number.isFinite(box.x) || !Number.isFinite(box.y) || !Number.isFinite(box.width) || !Number.isFinite(box.height)) {
        return `Box #${index + 1}: coordinates must be numeric.`;
      }
      if (box.width <= 0 || box.height <= 0) {
        return `Box #${index + 1}: width and height must be greater than zero.`;
      }
      if (box.x < 0 || box.y < 0 || box.x + box.width > frameWidth || box.y + box.height > frameHeight) {
        return `Box #${index + 1}: box exceeds frame bounds.`;
      }
      if (!allowedLabels.has(box.label)) {
        return `Box #${index + 1}: unknown label "${box.label}".`;
      }
    }
    return null;
  };

  const submit = (isFinal: boolean) => {
    const error = validateBeforeSubmit();
    setValidationError(error);
    if (error) return;
    submitMutation.mutate(isFinal);
  };

  if (assignmentQuery.isLoading) {
    return <LoadingSpinner size="lg" />;
  }

  if (!assignmentQuery.data) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Assignment not found</h1>
        <Link to="/labeling" className="btn-primary mt-4 inline-block">
          Back
        </Link>
      </div>
    );
  }

  const frame = assignmentQuery.data.frame;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{assignmentQuery.data.project_title}</div>
          <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">BBox Annotation</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Assignment {assignmentQuery.data.assignment_id.slice(0, 8)} | frame {frame.frame_number} | {frame.width}x{frame.height}
          </p>
        </div>
        <Link to="/labeling" className="btn-secondary">
          Back
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr,0.38fr]">
        <div className="card">
          <AnnotationCanvas
            imageUrl={assignmentQuery.data.frame_url}
            value={boxes}
            labels={labels}
            currentLabel={selectedLabel}
            selectedBoxIndex={selectedBoxIndex}
            onSelectedBoxIndexChange={setSelectedBoxIndex}
            onBoxesChange={setBoxes}
          />
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
                  className={`rounded-full px-3 py-1 text-sm font-medium transition ${selectedLabel === label.name ? "text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200"}`}
                  style={selectedLabel === label.name ? { backgroundColor: label.color || "#2563eb" } : undefined}
                >
                  {label.name}
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
              Draw a new box on the image, then fine-tune it below. Existing boxes can be dragged on the canvas.
            </div>
          </div>

          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold text-gray-900 dark:text-white">Selected box</div>
              <button type="button" className="btn-secondary" onClick={removeSelectedBox} disabled={selectedBoxIndex === null}>
                Delete
              </button>
            </div>

            {selectedBox ? (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Label</label>
                  <select
                    className="input-field"
                    value={selectedBox.label}
                    onChange={(event) => updateBox(selectedBoxIndex!, { label: event.target.value })}
                  >
                    {labels.map((label) => (
                      <option key={label.name} value={label.name}>
                        {label.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">X</label>
                    <input
                      type="number"
                      className="input-field"
                      value={selectedBox.x}
                      onChange={(event) =>
                        updateBox(selectedBoxIndex!, { x: clampNumber(event.target.value, 0, frame.width - selectedBox.width, selectedBox.x) })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Y</label>
                    <input
                      type="number"
                      className="input-field"
                      value={selectedBox.y}
                      onChange={(event) =>
                        updateBox(selectedBoxIndex!, { y: clampNumber(event.target.value, 0, frame.height - selectedBox.height, selectedBox.y) })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Width</label>
                    <input
                      type="number"
                      className="input-field"
                      value={selectedBox.width}
                      onChange={(event) =>
                        updateBox(selectedBoxIndex!, {
                          width: clampNumber(event.target.value, 1, frame.width - selectedBox.x, selectedBox.width),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Height</label>
                    <input
                      type="number"
                      className="input-field"
                      value={selectedBox.height}
                      onChange={(event) =>
                        updateBox(selectedBoxIndex!, {
                          height: clampNumber(event.target.value, 1, frame.height - selectedBox.y, selectedBox.height),
                        })
                      }
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                Select a box or draw a new one to edit its exact coordinates.
              </div>
            )}
          </div>

          <div className="card space-y-3">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">Instructions</div>
            <div className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
              {assignmentQuery.data.instructions || "No project instructions added."}
            </div>
            {projectQuery.data?.instructions_file_uri ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
                <div>
                  Instruction file:{" "}
                  <a className="text-blue-600 hover:underline dark:text-blue-400" href={projectQuery.data.instructions_file_uri} target="_blank" rel="noreferrer">
                    {projectQuery.data.instructions_file_name || "instruction"}
                  </a>
                </div>
                <div className="mt-1 text-gray-500 dark:text-gray-400">
                  v{projectQuery.data.instructions_version ?? 0}
                  {projectQuery.data.instructions_updated_at ? ` | ${new Date(projectQuery.data.instructions_updated_at).toLocaleString()}` : ""}
                </div>
              </div>
            ) : null}
          </div>

          <div className="card space-y-3">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">Comment</div>
            <textarea
              className="input-field min-h-[120px]"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Optional note for reviewer or project owner"
            />
            {assignmentQuery.data.pre_annotations?.boxes?.length ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
                AI suggestions were preloaded into this task. Review and adjust them before final submit.
              </div>
            ) : null}
            {assignmentQuery.data.quality_signals?.too_fast ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Previous submission for this assignment was flagged as unusually fast.
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="btn-secondary" onClick={() => submit(false)} disabled={submitMutation.isPending}>
                Save draft
              </button>
              <button type="button" className="btn-primary" onClick={() => submit(true)} disabled={submitMutation.isPending || boxes.length === 0}>
                Submit and next
              </button>
            </div>
            {validationError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{validationError}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
