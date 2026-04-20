import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { reviewerAPI } from "../services/api";
import { BoundingBox } from "../types";
import { useAuthStore } from "../store";
import { LoadingSpinner } from "../components/LoadingSpinner";

export function QualityPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [resolutionJson, setResolutionJson] = useState<string>(JSON.stringify({ boxes: [] }, null, 2));

  const queueQuery = useQuery({
    queryKey: ["reviewer-queue"],
    queryFn: () => reviewerAPI.queue(),
    enabled: user?.role === "reviewer" || user?.role === "admin",
  });

  useEffect(() => {
    if (!selectedReviewId && queueQuery.data?.items?.length) {
      setSelectedReviewId(queueQuery.data.items[0].review_id);
    }
  }, [queueQuery.data, selectedReviewId]);

  const reviewDetailQuery = useQuery({
    queryKey: ["review-detail", selectedReviewId],
    queryFn: () => reviewerAPI.detail(selectedReviewId!),
    enabled: !!selectedReviewId,
  });

  useEffect(() => {
    if (reviewDetailQuery.data?.resolution) {
      setResolutionJson(JSON.stringify(reviewDetailQuery.data.resolution, null, 2));
    }
  }, [reviewDetailQuery.data?.resolution]);

  const resolveMutation = useMutation({
    mutationFn: async () => reviewerAPI.resolve(selectedReviewId!, { resolution: JSON.parse(resolutionJson) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reviewer-queue"] });
      await queryClient.invalidateQueries({ queryKey: ["review-detail", selectedReviewId] });
    },
  });

  if (user?.role !== "reviewer" && user?.role !== "admin") {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Review Queue</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Project owners can monitor quality from each project page. Review resolution is available to reviewers and admins.</p>
      </div>
    );
  }

  const items = queueQuery.data?.items ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr,1.05fr]">
      <div className="card">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reviewer Queue</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Resolve low-agreement tasks and produce the final annotation.</p>
        {queueQuery.isLoading ? (
          <div className="mt-6 flex justify-center"><LoadingSpinner size="lg" /></div>
        ) : items.length === 0 ? (
          <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">No disputed tasks right now.</div>
        ) : (
          <div className="mt-6 space-y-3">
            {items.map((item) => (
              <button
                key={item.review_id}
                type="button"
                onClick={() => setSelectedReviewId(item.review_id)}
                className={`w-full rounded-lg border p-4 text-left transition ${selectedReviewId === item.review_id ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30" : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-950"}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{item.project_title}</div>
                    <div className="mt-2 font-semibold text-gray-900 dark:text-white">Review {item.review_id.slice(0, 8)}</div>
                  </div>
                  <span className="badge badge-warning">agreement {item.agreement_score.toFixed(2)}</span>
                </div>
                <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">{item.annotations.length} submissions · F1 {Number(item.metrics.f1 || 0).toFixed(2)}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card space-y-4">
        {!selectedReviewId || !reviewDetailQuery.data ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">Select a review from the queue to inspect annotations and resolve the dispute.</div>
        ) : (
          <>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{reviewDetailQuery.data.project_title}</div>
              <h2 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Resolve review {reviewDetailQuery.data.review_id.slice(0, 8)}</h2>
            </div>
            <img src={reviewDetailQuery.data.frame_url} alt="Frame under review" className="max-h-[420px] rounded-lg border border-gray-200 object-contain dark:border-gray-800" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {reviewDetailQuery.data.annotations.map((annotation) => (
                <div key={annotation.annotation_id} className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                  <div className="font-medium text-gray-900 dark:text-white">{annotation.annotator_username}</div>
                  <pre className="mt-3 max-h-48 overflow-auto text-xs text-gray-700 dark:text-gray-300">{JSON.stringify(annotation.label_data, null, 2)}</pre>
                  {annotation.comment ? <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{annotation.comment}</div> : null}
                </div>
              ))}
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Final resolution JSON</div>
              <textarea className="input-field min-h-[220px] font-mono text-xs" value={resolutionJson} onChange={(event) => setResolutionJson(event.target.value)} />
            </div>
            <button className="btn-primary" type="button" onClick={() => resolveMutation.mutate()} disabled={resolveMutation.isPending}>
              {resolveMutation.isPending ? "Resolving..." : "Resolve review"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
