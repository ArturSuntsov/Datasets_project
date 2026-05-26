import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsAPI } from "../services/api";
import { LoadingSpinner } from "./LoadingSpinner";
import { AnnotatedImageViewer } from "./AnnotatedImageViewer";
import { resolveMediaUrl } from "../utils/media";

interface AnnotatedFramesGalleryProps {
    projectId: string;
    isActive?: boolean;
    pendingValidationCount?: number;
    onApprovePending?: () => void;
    isApproving?: boolean;
}

export function AnnotatedFramesGallery({
    projectId,
    isActive = true,
    pendingValidationCount = 0,
    onApprovePending,
    isApproving = false,
}: AnnotatedFramesGalleryProps) {
    const queryClient = useQueryClient();
    const [selectedFrame, setSelectedFrame] = useState<{
        url: string;
        boxes: any[];
        width: number;
        height: number;
    } | null>(null);

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error, refetch } = useInfiniteQuery({
        queryKey: ["annotated-frames", projectId],
        queryFn: ({ pageParam = 0 }) => projectsAPI.getAnnotatedFrames(projectId, { limit: 20, offset: pageParam }),
        getNextPageParam: (lastPage, pages) => {
            const loaded = pages.reduce((acc, page) => acc + page.items.length, 0);
            return loaded < lastPage.total ? loaded : undefined;
        },
        initialPageParam: 0,
        staleTime: 0,
        refetchOnMount: "always",
        refetchOnWindowFocus: true,
        refetchInterval: isActive ? 8000 : false,
    });

    const approveFrameMutation = useMutation({
        mutationFn: (workItemId: string) => projectsAPI.approveFrame(projectId, workItemId),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["annotated-frames", projectId] });
            await queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] });
        },
    });

    if (isLoading) return <LoadingSpinner size="lg" />;
    if (isError) {
        const message =
            (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            "Не удалось загрузить размеченные кадры";
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {message}
                <button type="button" className="btn-secondary mt-3" onClick={() => refetch()}>
                    Повторить
                </button>
            </div>
        );
    }

    const frames = data?.pages.flatMap((page) => page.items) ?? [];
    const pendingInGallery = frames.filter((f) => f.customer_review_pending).length;

    if (frames.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">Пока нет размеченных кадров</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-2 max-w-md">
                    Кадр появится здесь сразу после того, как исполнитель отправит финальную разметку (кнопка «Отправить»).
                </p>
                {pendingValidationCount > 0 && onApprovePending ? (
                    <div className="mt-6 max-w-md space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                        <p>Обнаружено {pendingValidationCount} кадров в очереди — обновите страницу или нажмите одобрение.</p>
                        <button type="button" className="btn-primary" onClick={onApprovePending} disabled={isApproving}>
                            {isApproving ? "Одобряем..." : "Одобрить ожидающие кадры"}
                        </button>
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <div>
            {pendingInGallery > 0 && onApprovePending ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                    <span>
                        {pendingInGallery} кадр(ов) ожидает вашего одобрения
                    </span>
                    <button type="button" className="btn-primary" onClick={onApprovePending} disabled={isApproving}>
                        {isApproving ? "Одобряем..." : "Одобрить все"}
                    </button>
                </div>
            ) : null}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {frames.map((frame) => (
                    <div
                        key={frame.work_item_id}
                        className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-lg transition group"
                    >
                        <button
                            type="button"
                            className="block w-full cursor-pointer text-left"
                            onClick={() =>
                                setSelectedFrame({
                                    url: frame.frame_url,
                                    boxes: frame.boxes,
                                    width: frame.width,
                                    height: frame.height,
                                })
                            }
                        >
                            <img
                                src={resolveMediaUrl(frame.frame_url)}
                                alt={`Кадр ${frame.frame_number}`}
                                className="w-full h-40 object-cover"
                                loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center pointer-events-none">
                                <span className="text-white text-sm">Открыть</span>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-2 py-1 pointer-events-none">
                                Кадр {frame.frame_number}
                                {frame.boxes.length > 0 ? ` · ${frame.boxes.length} рамок` : ""}
                            </div>
                        </button>
                        <div className="absolute top-2 left-2">
                            {frame.customer_approved ? (
                                <span className="rounded bg-emerald-600/90 px-2 py-0.5 text-[10px] font-medium text-white">
                                    {frame.auto_approved ? "Авто-одобрено" : "Одобрено"}
                                </span>
                            ) : (
                                <span className="rounded bg-amber-500/90 px-2 py-0.5 text-[10px] font-medium text-white">
                                    На проверке
                                </span>
                            )}
                        </div>
                        {!frame.customer_approved ? (
                            <div className="border-t border-gray-200 p-2 dark:border-gray-700">
                                <button
                                    type="button"
                                    className="btn-primary w-full text-xs py-1.5"
                                    disabled={approveFrameMutation.isPending}
                                    onClick={() => approveFrameMutation.mutate(frame.work_item_id)}
                                >
                                    Одобрить
                                </button>
                            </div>
                        ) : null}
                    </div>
                ))}
            </div>

            {hasNextPage && (
                <div className="flex justify-center mt-6">
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                    >
                        {isFetchingNextPage ? "Загрузка..." : "Загрузить ещё"}
                    </button>
                </div>
            )}

            {selectedFrame && (
                <AnnotatedImageViewer
                    imageUrl={selectedFrame.url}
                    boxes={selectedFrame.boxes}
                    width={selectedFrame.width}
                    height={selectedFrame.height}
                    onClose={() => setSelectedFrame(null)}
                />
            )}
        </div>
    );
}
