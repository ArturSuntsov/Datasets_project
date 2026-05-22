import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { projectsAPI } from "../services/api";
import { LoadingSpinner } from "./LoadingSpinner";
import { AnnotatedImageViewer } from "./AnnotatedImageViewer";

interface AnnotatedFramesGalleryProps {
    projectId: string;
}

export function AnnotatedFramesGallery({ projectId }: AnnotatedFramesGalleryProps) {
    const [selectedFrame, setSelectedFrame] = useState<{ url: string; boxes: any[] } | null>(null);

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useInfiniteQuery({
        queryKey: ["annotated-frames", projectId],
        queryFn: ({ pageParam = 0 }) => projectsAPI.getAnnotatedFrames(projectId, { limit: 20, offset: pageParam }),
        getNextPageParam: (lastPage, pages) => {
            const loaded = pages.reduce((acc, page) => acc + page.items.length, 0);
            return loaded < lastPage.total ? loaded : undefined;
        },
        initialPageParam: 0,
    });

    if (isLoading) return <LoadingSpinner size="lg" />;
    if (isError) return <div className="text-red-500">Ошибка загрузки размеченных кадров</div>;

    const frames = data?.pages.flatMap((page) => page.items) ?? [];

    if (frames.length === 0) {
        return <div className="text-center text-gray-500 py-8">Нет размеченных кадров, прошедших валидацию.</div>;
    }

    return (
        <div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {frames.map((frame) => (
                    <div
                        key={frame.work_item_id}
                        className="relative cursor-pointer group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-lg transition"
                        onClick={() => setSelectedFrame({ url: frame.frame_url, boxes: frame.boxes })}
                    >
                        <img
                            src={frame.frame_url}
                            alt={`Frame ${frame.frame_number}`}
                            className="w-full h-40 object-cover"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            <span className="text-white text-sm">Просмотр</span>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-2 py-1">
                            Кадр {frame.frame_number}
                        </div>
                    </div>
                ))}
            </div>

            {hasNextPage && (
                <div className="flex justify-center mt-6">
                    <button
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
                    onClose={() => setSelectedFrame(null)}
                />
            )}
        </div>
    );
}