import { useState } from "react";
import { resolveMediaUrl } from "../utils/media";

interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
}

interface AnnotatedImageViewerProps {
    imageUrl: string;
    boxes: Box[];
    width?: number;
    height?: number;
    onClose: () => void;
}

export function AnnotatedImageViewer({
    imageUrl,
    boxes,
    width = 1,
    height = 1,
    onClose,
}: AnnotatedImageViewerProps) {
    const [loadError, setLoadError] = useState(false);
    const mediaUrl = resolveMediaUrl(imageUrl);
    const frameWidth = Math.max(Number(width || 1), 1);
    const frameHeight = Math.max(Number(height || 1), 1);

    if (loadError) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
                <div
                    className="relative rounded-lg bg-white p-6 text-center dark:bg-gray-800"
                    onClick={(e) => e.stopPropagation()}
                >
                    <p className="text-sm text-gray-700 dark:text-gray-200">Не удалось загрузить изображение</p>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 break-all">{mediaUrl}</p>
                    <button type="button" className="btn-secondary mt-4" onClick={onClose}>
                        Закрыть
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
            <div
                className="relative max-h-full max-w-full overflow-auto rounded-lg bg-neutral-950 p-2 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-lg text-white hover:bg-black/80"
                    onClick={onClose}
                    aria-label="Закрыть"
                >
                    ×
                </button>
                <div className="relative inline-block">
                    <img
                        src={mediaUrl}
                        alt="Размеченный кадр"
                        className="block max-h-[85vh] max-w-[min(90vw,1400px)] h-auto w-auto select-none"
                        draggable={false}
                        onError={() => setLoadError(true)}
                    />
                    {boxes.map((box, index) => (
                        <div
                            key={index}
                            className="absolute border-2 border-red-500 pointer-events-none"
                            style={{
                                left: `${(Number(box.x || 0) / frameWidth) * 100}%`,
                                top: `${(Number(box.y || 0) / frameHeight) * 100}%`,
                                width: `${(Number(box.width || 0) / frameWidth) * 100}%`,
                                height: `${(Number(box.height || 0) / frameHeight) * 100}%`,
                                boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
                            }}
                        >
                            {box.label ? (
                                <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-red-600/90 px-2 py-0.5 text-xs text-white">
                                    {box.label}
                                </span>
                            ) : null}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
