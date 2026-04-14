import { Stage, Layer, Rect, Image as KonvaImage } from "react-konva";
import { useState, useEffect } from "react";

// Хук для загрузки изображения
const useImageLoader = (url: string) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      setImage(img);
      setLoading(false);
    };
    
    img.onerror = () => {
      setError("Failed to load image");
      setLoading(false);
    };

    img.src = url;
  }, [url]);

  return { image, loading, error };
};

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export default function AnnotationCanvas({
  imageUrl,
  onBoxesChange,
}: {
  imageUrl: string;
  onBoxesChange: (boxes: Box[]) => void;
}) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);

  const { image, loading, error } = useImageLoader(imageUrl);

  // Адаптивный размер canvas под изображение
  const maxWidth = 1000;
  const maxHeight = 700;
  
  let canvasWidth = maxWidth;
  let canvasHeight = maxHeight;

  if (image) {
    const ratio = Math.min(
      maxWidth / image.width,
      maxHeight / image.height,
      1
    );
    canvasWidth = image.width * ratio;
    canvasHeight = image.height * ratio;
  }

  const handleMouseDown = (e: any) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    setDrawing(true);
    setStartPos(pos);
    setCurrentPos(pos);
  };

  const handleMouseMove = (e: any) => {
    if (!drawing) return;
    const pos = e.target.getStage().getPointerPosition();
    setCurrentPos(pos);
  };

  const handleMouseUp = () => {
    if (!drawing || !startPos || !currentPos) {
      setDrawing(false);
      return;
    }

    const newBox = {
      x: Math.min(startPos.x, currentPos.x),
      y: Math.min(startPos.y, currentPos.y),
      width: Math.abs(currentPos.x - startPos.x),
      height: Math.abs(currentPos.y - startPos.y),
    };

    // Игнорируем слишком маленькие рамки
    if (newBox.width > 10 && newBox.height > 10) {
      const updated = [...boxes, newBox];
      setBoxes(updated);
      onBoxesChange(updated);
    }

    setDrawing(false);
    setStartPos(null);
    setCurrentPos(null);
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center bg-gray-100 rounded-lg"
        style={{ width: maxWidth, height: maxHeight }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading image...</p>
        </div>
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div
        className="flex items-center justify-center bg-gray-100 rounded-lg border-2 border-dashed border-gray-300"
        style={{ width: maxWidth, height: maxHeight }}
      >
        <div className="text-center text-gray-500">
          <p className="text-lg font-semibold mb-2">No Image Available</p>
          <p className="text-sm">{error || "Task has no image URL"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <Stage
        width={canvasWidth}
        height={canvasHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="border rounded-lg overflow-hidden"
      >
        <Layer>
          {/* Отображение изображения */}
          {image && (
            <KonvaImage
              image={image}
              width={canvasWidth}
              height={canvasHeight}
            />
          )}

          {/* Сохраненные рамки */}
          {boxes.map((box, idx) => (
            <Rect
              key={idx}
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              stroke="red"
              strokeWidth={2}
              dash={[5, 5]}
            />
          ))}

          {/* Текущая рисуемая рамка */}
          {drawing && startPos && currentPos && (
            <Rect
              x={Math.min(startPos.x, currentPos.x)}
              y={Math.min(startPos.y, currentPos.y)}
              width={Math.abs(currentPos.x - startPos.x)}
              height={Math.abs(currentPos.y - startPos.y)}
              stroke="blue"
              strokeWidth={2}
              dash={[10, 5]}
            />
          )}
        </Layer>
      </Stage>

      {/* Информация */}
      <div className="mt-2 text-sm text-gray-600 flex justify-between">
        <span>Click and drag to draw bounding boxes</span>
        <span>{boxes.length} box(es)</span>
      </div>
    </div>
  );
}
