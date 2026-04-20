import { Stage, Layer, Rect, Image as KonvaImage, Text, Group } from "react-konva";
import { useEffect, useMemo, useState } from "react";
import { BoundingBox } from "../types";

const useImageLoader = (url: string) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
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

export default function AnnotationCanvas({
  imageUrl,
  value,
  currentLabel,
  onBoxesChange,
}: {
  imageUrl: string;
  value: BoundingBox[];
  currentLabel: string;
  onBoxesChange: (boxes: BoundingBox[]) => void;
}) {
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const { image, loading, error } = useImageLoader(imageUrl);

  const maxWidth = 1000;
  const maxHeight = 700;
  const { canvasWidth, canvasHeight } = useMemo(() => {
    if (!image) {
      return { canvasWidth: maxWidth, canvasHeight: maxHeight };
    }
    const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    return { canvasWidth: image.width * ratio, canvasHeight: image.height * ratio };
  }, [image]);

  const handleMouseDown = (event: any) => {
    const stage = event.target.getStage();
    const pos = stage.getPointerPosition();
    setDrawing(true);
    setStartPos(pos);
    setCurrentPos(pos);
  };

  const handleMouseMove = (event: any) => {
    if (!drawing) return;
    const stage = event.target.getStage();
    setCurrentPos(stage.getPointerPosition());
  };

  const handleMouseUp = () => {
    if (!drawing || !startPos || !currentPos || !currentLabel) {
      setDrawing(false);
      return;
    }
    const nextBox: BoundingBox = {
      x: Math.min(startPos.x, currentPos.x),
      y: Math.min(startPos.y, currentPos.y),
      width: Math.abs(currentPos.x - startPos.x),
      height: Math.abs(currentPos.y - startPos.y),
      label: currentLabel,
    };
    if (nextBox.width > 8 && nextBox.height > 8) {
      onBoxesChange([...value, nextBox]);
    }
    setDrawing(false);
    setStartPos(null);
    setCurrentPos(null);
  };

  if (loading) {
    return <div className="flex h-[500px] items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500">Loading image...</div>;
  }

  if (error || !imageUrl) {
    return <div className="flex h-[500px] items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">{error || "No frame available"}</div>;
  }

  return (
    <div className="space-y-3">
      <Stage width={canvasWidth} height={canvasHeight} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <Layer>
          {image ? <KonvaImage image={image} width={canvasWidth} height={canvasHeight} /> : null}
          {value.map((box, index) => (
            <Group key={index}>
              <Rect x={box.x} y={box.y} width={box.width} height={box.height} stroke="#ef4444" strokeWidth={2} />
              <Text x={box.x} y={Math.max(0, box.y - 18)} text={box.label} fill="#ef4444" fontSize={14} fontStyle="bold" />
            </Group>
          ))}
          {drawing && startPos && currentPos ? (
            <Rect
              x={Math.min(startPos.x, currentPos.x)}
              y={Math.min(startPos.y, currentPos.y)}
              width={Math.abs(currentPos.x - startPos.x)}
              height={Math.abs(currentPos.y - startPos.y)}
              stroke="#2563eb"
              strokeWidth={2}
              dash={[8, 4]}
            />
          ) : null}
        </Layer>
      </Stage>
      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
        <span>Selected label: {currentLabel || "Choose a label first"}</span>
        <span>{value.length} boxes</span>
      </div>
    </div>
  );
}
