import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { participantsAPI, projectsAPI } from "../services/api";
import { Participant, ProjectLabel } from "../types";

function parseLabels(raw: string): ProjectLabel[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name, index) => ({
      name,
      color: ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed"][index % 5],
    }));
}

export default function CreateProjectPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [labelsInput, setLabelsInput] = useState("drone");
  const [frameInterval, setFrameInterval] = useState("1");
  const [agreementThreshold, setAgreementThreshold] = useState("0.75");
  const [specialization, setSpecialization] = useState("");
  const [groupRule, setGroupRule] = useState("");
  const [selectedAnnotators, setSelectedAnnotators] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const annotatorsQuery = useQuery({ queryKey: ["participants", "annotator"], queryFn: () => participantsAPI.list("annotator") });

  const labelsPreview = useMemo(() => parseLabels(labelsInput), [labelsInput]);

  const toggle = (id: string, current: string[], setter: (value: string[]) => void) => {
    setter(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const project = await projectsAPI.create({
        title,
        description,
        status: "active",
        project_type: "cv",
        annotation_type: "bbox",
        instructions,
        label_schema: labelsPreview,
        participant_rules: {
          specialization,
          group: groupRule,
        },
        allowed_annotator_ids: selectedAnnotators,
        allowed_reviewer_ids: [],
        frame_interval_sec: Number(frameInterval) || 1,
        assignments_per_task: 2,
        agreement_threshold: Number(agreementThreshold) || 0.75,
        iou_threshold: 0.5,
      });
      navigate(`/projects/${project.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.error || "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  };

  const ParticipantSelector = ({
    title,
    items,
    selected,
    onToggle,
  }: {
    title: string;
    items: Participant[];
    selected: string[];
    onToggle: (id: string) => void;
  }) => (
    <div>
      <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{title}</div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {items.map((participant) => {
          const active = selected.includes(participant.id);
          return (
            <button
              key={participant.id}
              type="button"
              onClick={() => onToggle(participant.id)}
              className={`rounded-lg border p-3 text-left transition ${active ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30" : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-950"}`}
            >
              <div className="font-medium text-gray-900 dark:text-white">{participant.username}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{participant.specialization || "No specialization"} · rating {participant.rating?.toFixed(2) ?? "0.00"}</div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Create CV Project</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Configure labels, instructions, and annotator pool for the bbox workflow.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="card space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Project title</label>
              <input className="input-field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Drone detection dataset" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
              <textarea className="input-field min-h-[120px]" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What will annotators mark and why?" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Instructions</label>
              <textarea className="input-field min-h-[180px]" value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Mark every visible drone with a single tight bounding box..." />
            </div>
          </div>

          <div className="card space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Labels</label>
              <input className="input-field" value={labelsInput} onChange={(event) => setLabelsInput(event.target.value)} placeholder="drone, bird, helicopter" />
              <div className="mt-2 flex flex-wrap gap-2">
                {labelsPreview.map((label) => (
                  <span key={label.name} className="rounded-full px-3 py-1 text-xs font-medium text-white" style={{ backgroundColor: label.color }}>
                    {label.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Frame interval, sec</label>
                <input type="number" step="0.1" min="0.1" className="input-field" value={frameInterval} onChange={(event) => setFrameInterval(event.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Agreement threshold</label>
                <input type="number" step="0.05" min="0" max="1" className="input-field" value={agreementThreshold} onChange={(event) => setAgreementThreshold(event.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Required specialization</label>
                <input className="input-field" value={specialization} onChange={(event) => setSpecialization(event.target.value)} placeholder="aerial vision" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Required group</label>
                <input className="input-field" value={groupRule} onChange={(event) => setGroupRule(event.target.value)} placeholder="group-42" />
              </div>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
              Default QC for this flow: 2 annotators per frame and automatic agreement check with IoU threshold 0.5.
            </div>
          </div>
        </div>

        <div className="card space-y-5">
          <ParticipantSelector
            title="Annotator pool"
            items={annotatorsQuery.data?.items ?? []}
            selected={selectedAnnotators}
            onToggle={(id) => toggle(id, selectedAnnotators, setSelectedAnnotators)}
          />
        </div>

        {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

        <div className="flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting || !title || labelsPreview.length === 0}>
            {submitting ? "Creating..." : "Create Project"}
          </button>
        </div>
      </form>
    </div>
  );
}
