import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import AnnotationCanvas from "../components/AnnotationCanvas";
import { getNextTask, submitAnnotation } from "../api/cvApi";


export default function AnnotationPage() {
  const { projectId } = useParams();

  const [task, setTask] = useState<any>(null);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadTask() {
    try {
      setLoading(true);
      setError(null);
      const data = await getNextTask(projectId!);
      setTask(data);
    } catch (err: any) {
      console.error("Error loading task:", err);
      setError(err.response?.data?.detail || "Failed to load task");
      setTask(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    try {
      setSubmitting(true);
      setError(null);
      await submitAnnotation(task.task_id, boxes);
      await loadTask();
    } catch (err: any) {
      console.error("Error submitting annotation:", err);
      setError(err.response?.data?.detail || "Failed to submit annotation");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    loadTask();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading task...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h3 className="text-red-800 font-semibold mb-2">Error</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={loadTask}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">No Tasks Available</h2>
          <p className="text-gray-600">There are no pending tasks for this project.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Annotation Task</h1>
        <div className="text-sm text-gray-600 space-y-1">
          <p><strong>Task ID:</strong> {task.task_id}</p>
          <p><strong>Status:</strong> {task.status}</p>
          <p><strong>Difficulty:</strong> {task.difficulty_score}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <AnnotationCanvas
          imageUrl={task.frame_url}
          onBoxesChange={setBoxes}
        />
      </div>

      <div className="flex gap-4">
        <button
          onClick={handleSubmit}
          disabled={submitting || boxes.length === 0}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Submitting..." : "Submit Annotation"}
        </button>
        <button
          onClick={loadTask}
          className="bg-gray-600 text-white px-6 py-2 rounded hover:bg-gray-700"
        >
          Skip Task
        </button>
      </div>
    </div>
  );
}