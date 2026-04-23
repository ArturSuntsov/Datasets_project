import { Group, Image as KonvaImage, Layer, Rect, Stage, Text } from "react-konva";
import { useEffect, useMemo, useState } from "react";
import { BoundingBox, ProjectLabel } from "../types";

function useImageLoader(url: string) {
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
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function AnnotationCanvas({
  imageUrl,
  value,
  labels,
  currentLabel,
  selectedBoxIndex,
  onSelectedBoxIndexChange,
  onBoxesChange,
}: {
  imageUrl: string;
  value: BoundingBox[];
  labels: ProjectLabel[];
  currentLabel: string;
  selectedBoxIndex: number | null;
  onSelectedBoxIndexChange: (index: number | null) => void;
  onBoxesChange: (boxes: BoundingBox[]) => void;
}) {
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const { image, loading, error } = useImageLoader(imageUrl);

  const maxWidth = 1000;
  const maxHeight = 700;

  const imageWidth = image?.width || 1;
  const imageHeight = image?.height || 1;

  const { canvasWidth, canvasHeight, scale } = useMemo(() => {
    if (!image) {
      return { canvasWidth: maxWidth, canvasHeight: maxHeight, scale: 1 };
    }
    const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    return {
      canvasWidth: image.width * ratio,
      canvasHeight: image.height * ratio,
      scale: ratio,
    };
  }, [image]);

  const labelColorMap = useMemo(() => {
    return new Map(labels.map((label) => [label.name, label.color || "#ef4444"]));
  }, [labels]);

  const toImageCoords = (x: number, y: number) => ({
    x: clamp(x / scale, 0, imageWidth),
    y: clamp(y / scale, 0, imageHeight),
  });

  const toCanvasCoords = (box: BoundingBox) => ({
    x: box.x * scale,
    y: box.y * scale,
    width: box.width * scale,
    height: box.height * scale,
  });

  const handleMouseDown = (event: any) => {
    if (!currentLabel) return;
    const stage = event.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!pos) return;
    setDrawing(true);
    setStartPos(pos);
    setCurrentPos(pos);
    onSelectedBoxIndexChange(null);
  };

  const handleMouseMove = (event: any) => {
    if (!drawing) return;
    const stage = event.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!pos) return;
    setCurrentPos(pos);
  };

  const handleMouseUp = () => {
    if (!drawing || !startPos || !currentPos || !currentLabel) {
      setDrawing(false);
      setStartPos(null);
      setCurrentPos(null);
      return;
    }

    const start = toImageCoords(startPos.x, startPos.y);
    const end = toImageCoords(currentPos.x, currentPos.y);
    const nextBox: BoundingBox = {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
      label: currentLabel,
    };

    if (nextBox.width > 4 && nextBox.height > 4) {
      onBoxesChange([...value, nextBox]);
      onSelectedBoxIndexChange(value.length);
    }

    setDrawing(false);
    setStartPos(null);
    setCurrentPos(null);
  };

  const updateDraggedBox = (index: number, nextX: number, nextY: number) => {
    onBoxesChange(
      value.map((box, boxIndex) =>
        boxIndex === index
          ? {
              ...box,
              x: clamp(nextX / scale, 0, Math.max(0, imageWidth - box.width)),
              y: clamp(nextY / scale, 0, Math.max(0, imageHeight - box.height)),
            }
          : box
      )
    );
  };

  if (loading) {
    return <div className="flex h-[500px] items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500">Loading image...</div>;
  }

  if (error || !imageUrl) {
    return (
      <div className="flex h-[500px] items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">
        {error || "No frame available"}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Stage
        width={canvasWidth}
        height={canvasHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="rounded-lg border border-gray-200 bg-white shadow-sm"
      >
        <Layer>
          {image ? <KonvaImage image={image} width={canvasWidth} height={canvasHeight} /> : null}
          {value.map((box, index) => {
            const canvasBox = toCanvasCoords(box);
            const color = labelColorMap.get(box.label) || "#ef4444";
            const isSelected = selectedBoxIndex === index;
            return (
              <Group
                key={`${box.label}-${index}`}
                draggable
                onClick={(event) => {
                  event.cancelBubble = true;
                  onSelectedBoxIndexChange(index);
                }}
                onTap={(event) => {
                  event.cancelBubble = true;
                  onSelectedBoxIndexChange(index);
                }}
                onDragEnd={(event) => updateDraggedBox(index, event.target.x(), event.target.y())}
                x={canvasBox.x}
                y={canvasBox.y}
              >
                <Rect
                  width={canvasBox.width}
                  height={canvasBox.height}
                  stroke={color}
                  strokeWidth={isSelected ? 3 : 2}
                  dash={isSelected ? [8, 4] : undefined}
                />
                <Text
                  y={-18}
                  text={box.label}
                  fill={color}
                  fontSize={14}
                  fontStyle="bold"
                />
              </Group>
            );
          })}
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
