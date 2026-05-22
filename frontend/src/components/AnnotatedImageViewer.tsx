import { useEffect, useRef, useState } from "react";

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

export function AnnotatedImageViewer({ imageUrl, boxes, width = 800, height = 600, onClose }: AnnotatedImageViewerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
            setImg(image);
            setLoading(false);
        };
        image.onerror = () => setLoading(false);
        image.src = imageUrl;
    }, [imageUrl]);

    useEffect(() => {
        if (!img || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const scale = Math.min(width / img.width, height / img.height);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;
        const offsetX = (width - drawWidth) / 2;
        const offsetY = (height - drawHeight) / 2;

        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

        for (const box of boxes) {
            const x = offsetX + box.x * scale;
            const y = offsetY + box.y * scale;
            const w = box.width * scale;
            const h = box.height * scale;
            ctx.strokeStyle = "#ef4444";
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = "#ef4444";
            ctx.font = "14px sans-serif";
            ctx.fillText(box.label, x + 2, y - 2);
        }
    }, [img, boxes, width, height]);

    if (loading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
                <div className="text-white">Загрузка...</div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-2" onClick={(e) => e.stopPropagation()}>
                <button
                    className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-white/50 rounded-full w-8 h-8"
                    onClick={onClose}
                >
                    ?
                </button>
                <canvas ref={canvasRef} style={{ maxWidth: "90vw", maxHeight: "90vh" }} />
            </div>
        </div>
    );
}