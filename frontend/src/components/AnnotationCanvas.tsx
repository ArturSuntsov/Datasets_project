import { Group, Image as KonvaImage, Layer, Rect, Stage, Text } from "react-konva";
import { useEffect, useMemo, useRef, useState } from "react";
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
  onPreviousFrame,
  onNextFrame,
  onPreviousFrameWithAnnotations,
  onNextFrameWithAnnotations,
  onPreviousEmptyFrame,
  onNextEmptyFrame,
  onFitToViewport,
}: {
  imageUrl: string;
  value: BoundingBox[];
  labels: ProjectLabel[];
  currentLabel: string;
  selectedBoxIndex: number | null;
  onSelectedBoxIndexChange: (index: number | null) => void;
  onBoxesChange: (boxes: BoundingBox[]) => void;
  onPreviousFrame?: () => void;
  onNextFrame?: () => void;
  onPreviousFrameWithAnnotations?: () => void;
  onNextFrameWithAnnotations?: () => void;
  onPreviousEmptyFrame?: () => void;
  onNextEmptyFrame?: () => void;
  onFitToViewport?: () => void;
}) {
  const stageRef = useRef<any>(null);
  const contentRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const [tool, setTool] = useState<"draw" | "pan">("draw");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewportWidth, setViewportWidth] = useState(1100);
  const [viewportHeight, setViewportHeight] = useState(760);
  const [history, setHistory] = useState<BoundingBox[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [copiedBox, setCopiedBox] = useState<BoundingBox | null>(null);
   const { image, loading, error } = useImageLoader(imageUrl);

  const maxHeight = 760;

  const imageWidth = image?.width || 1;
  const imageHeight = image?.height || 1;

  // Auto-focus the canvas when it mounts or when image loads
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.focus();
    }
  }, [containerRef, image]);

   // Undo/redo functionality
   useEffect(() => {
     // Save current state to history when boxes change
     // But only if we're not currently undoing/redoing (to avoid polluting history)
     if (historyIndex < history.length - 1) {
       // Truncate forward history
       setHistory(history.slice(0, historyIndex + 1));
     }
     
     // Add current state to history
     setHistory(prev => [...prev, value]);
     setHistoryIndex(prev => Math.min(prev + 1, 19)); // Limit to 20 actions
   }, [value, history, historyIndex]);

  // Keyboard event handling
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if focus is on input, textarea, or select elements
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      // Handle modifier keys
      const ctrlKey = event.ctrlKey;
      const shiftKey = event.shiftKey;
      const key = event.key;

      // Navigation (highest priority)
      if (key === 'F') {
        event.preventDefault();
        onPreviousFrame?.();
        return;
      }
      if (key === 'D') {
        event.preventDefault();
        onNextFrame?.();
        return;
      }
      if (key === 'ArrowLeft') {
        event.preventDefault();
        onPreviousFrameWithAnnotations?.();
        return;
      }
      if (key === 'ArrowRight') {
        event.preventDefault();
        onNextFrameWithAnnotations?.();
        return;
      }
      if (ctrlKey && key === 'ArrowLeft') {
        event.preventDefault();
        onPreviousEmptyFrame?.();
        return;
      }
      if (ctrlKey && key === 'ArrowRight') {
        event.preventDefault();
        onNextEmptyFrame?.();
        return;
      }

      // Medium priority actions
      if (key === 'Delete' && selectedBoxIndex !== null) {
        event.preventDefault();
        onBoxesChange(value.filter((_, index) => index !== selectedBoxIndex));
        onSelectedBoxIndexChange(null);
        return;
      }
      if (key === 'Escape') {
        event.preventDefault();
        // Cancel current drawing action / deselect all
        setDrawing(false);
        setStartPos(null);
        setCurrentPos(null);
        onSelectedBoxIndexChange(null);
        return;
      }
      if (ctrlKey && key === 'c' && selectedBoxIndex !== null) {
        event.preventDefault();
        setCopiedBox(value[selectedBoxIndex]);
        return;
      }
      if (ctrlKey && key === 'v' && copiedBox) {
        event.preventDefault();
        onBoxesChange([...value, copiedBox]);
        onSelectedBoxIndexChange(value.length); // Select the newly pasted box
        return;
      }
      if (ctrlKey && key === 'z') {
        event.preventDefault();
        // Undo
        if (historyIndex > 0) {
          setHistoryIndex(prev => prev - 1);
          onBoxesChange(history[historyIndex - 1]);
          // Update selected box index to maintain selection if possible
          const newBoxes = history[historyIndex - 1];
          if (selectedBoxIndex !== null && selectedBoxIndex < newBoxes.length) {
            onSelectedBoxIndexChange(selectedBoxIndex);
          } else if (newBoxes.length > 0) {
            onSelectedBoxIndexChange(0);
          } else {
            onSelectedBoxIndexChange(null);
          }
        }
        return;
      }
      if (ctrlKey && shiftKey && key === 'Z') {
        event.preventDefault();
        // Redo
        if (historyIndex < history.length - 1) {
          setHistoryIndex(prev => prev + 1);
          onBoxesChange(history[historyIndex + 1]);
          // Update selected box index to maintain selection if possible
          const newBoxes = history[historyIndex + 1];
          if (selectedBoxIndex !== null && selectedBoxIndex < newBoxes.length) {
            onSelectedBoxIndexChange(selectedBoxIndex);
          } else if (newBoxes.length > 0) {
            onSelectedBoxIndexChange(0);
          } else {
            onSelectedBoxIndexChange(null);
          }
        }
        return;
      }
      if (shiftKey && key === 'N' && selectedBoxIndex !== null) {
        event.preventDefault();
        // Redraw selected box with same properties
        const box = value[selectedBoxIndex];
        onBoxesChange([
          ...value.slice(0, selectedBoxIndex),
          { ...box }, // Create a new object with same properties
          ...value.slice(selectedBoxIndex + 1)
        ]);
        return;
      }
       if (key === 'F1') {
         event.preventDefault();
         onFitToViewport?.();
         return;
       }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [value, selectedBoxIndex, onBoxesChange, onSelectedBoxIndexChange, copiedBox]);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      const width = containerRef.current?.clientWidth || 1100;
      const maxAllowedHeight = typeof window !== "undefined" ? Math.max(520, window.innerHeight - 240) : 760;
      setViewportWidth(width);
      setViewportHeight(Math.min(maxHeight, maxAllowedHeight));
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const { canvasWidth, canvasHeight, fitScale, stageWidth, stageHeight, imageOffset } = useMemo(() => {
    if (!image) {
      const fallbackHeight = Math.min(640, viewportHeight);
      return {
        canvasWidth: viewportWidth,
        canvasHeight: fallbackHeight,
        fitScale: 1,
        stageWidth: viewportWidth,
        stageHeight: fallbackHeight,
        imageOffset: { x: 0, y: 0 },
      };
    }
    const ratio = Math.min(viewportWidth / image.width, viewportHeight / image.height, 1);
    const nextCanvasWidth = image.width * ratio;
    const nextCanvasHeight = image.height * ratio;
    const nextStageWidth = Math.max(viewportWidth, nextCanvasWidth);
    const nextStageHeight = Math.max(viewportHeight, nextCanvasHeight);
    return {
      canvasWidth: nextCanvasWidth,
      canvasHeight: nextCanvasHeight,
      fitScale: ratio,
      stageWidth: nextStageWidth,
      stageHeight: nextStageHeight,
      imageOffset: {
        x: Math.max(0, (nextStageWidth - nextCanvasWidth) / 2),
        y: Math.max(0, (nextStageHeight - nextCanvasHeight) / 2),
      },
    };
  }, [image, maxHeight, viewportHeight, viewportWidth]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: imageOffset.x, y: imageOffset.y });
  }, [imageUrl, canvasWidth, canvasHeight, imageOffset.x, imageOffset.y]);

  const labelColorMap = useMemo(() => {
    return new Map(labels.map((label) => [label.name, label.color || "#ef4444"]));
  }, [labels]);

  const toImageCoords = (x: number, y: number) => ({
    x: clamp(x / fitScale, 0, imageWidth),
    y: clamp(y / fitScale, 0, imageHeight),
  });

  const toCanvasCoords = (box: BoundingBox) => ({
    x: box.x * fitScale,
    y: box.y * fitScale,
    width: box.width * fitScale,
    height: box.height * fitScale,
  });

  const getPointerOnCanvas = () => {
    const position = contentRef.current?.getRelativePointerPosition();
    if (!position) return null;
    return {
      x: clamp(position.x, 0, canvasWidth),
      y: clamp(position.y, 0, canvasHeight),
    };
  };

   const handleMouseDown = (event: any) => {
     // Extract the native event from Konva event object
     const nativeEvent = event.evt || event;
     
     console.log('handleMouseDown called:', {
       button: nativeEvent.button,
       tool: tool,
       targetClassName: event.target?.className,
       clientX: nativeEvent.clientX,
       clientY: nativeEvent.clientY
     });
     
     // Right click: enter pan mode
     if (nativeEvent.button === 2) {
       console.log('Right mouse button down - entering pan mode');
       if (nativeEvent.preventDefault) nativeEvent.preventDefault();
       if (nativeEvent.stopPropagation) nativeEvent.stopPropagation();
       setTool("pan");
       return;
     }
     
     // If already in pan mode, ignore further mouse events for drawing/selection
     if (tool === "pan") {
       console.log('Already in pan mode, ignoring mouse down for drawing');
       return;
     }
     
     // Left click: proceed with drawing/selection logic
     const targetClassName = event.target?.className;
     if (targetClassName && targetClassName !== "Stage" && targetClassName !== "Image") {
       console.log('Ignoring mouse down on non-stage/image element:', targetClassName);
       return;
     }
     if (!currentLabel) {
       console.log('No current label, ignoring mouse down');
       return;
     }
     const pos = getPointerOnCanvas();
     if (!pos) {
       console.log('Could not get pointer position, ignoring mouse down');
       return;
     }
     console.log('Starting drawing at:', pos);
     setDrawing(true);
     setStartPos(pos);
     setCurrentPos(pos);
     onSelectedBoxIndexChange(null);
   };

   const handleMouseMove = () => {
     if (tool === "pan") return;
     if (!drawing) return;
     const pos = getPointerOnCanvas();
     if (!pos) return;
     setCurrentPos(pos);
   };

   const handleMouseUp = () => {
     // Switch back to draw tool when releasing right mouse button
     if (tool === "pan") {
       setTool("draw");
       return;
     }
 
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
              x: clamp(nextX / fitScale, 0, Math.max(0, imageWidth - box.width)),
              y: clamp(nextY / fitScale, 0, Math.max(0, imageHeight - box.height)),
            }
          : box
      )
    );
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: imageOffset.x, y: imageOffset.y });
  };

  const applyZoom = (nextZoom: number) => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    const clampedZoom = clamp(nextZoom, 1, 5);
    if (!pointer) {
      setZoom(clampedZoom);
      return;
    }
    const mousePointTo = {
      x: (pointer.x - pan.x) / zoom,
      y: (pointer.y - pan.y) / zoom,
    };
    setZoom(clampedZoom);
    setPan({
      x: pointer.x - mousePointTo.x * clampedZoom,
      y: pointer.y - mousePointTo.y * clampedZoom,
    });
  };

  const handleWheel = (event: any) => {
    event.evt.preventDefault();
    const direction = event.evt.deltaY > 0 ? -1 : 1;
    const nextZoom = zoom + direction * 0.15;
    applyZoom(nextZoom);
  };

  if (loading) {
    return <div className="flex h-[560px] items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500">Загрузка изображения...</div>;
  }

  if (error || !imageUrl) {
    return (
      <div className="flex h-[560px] items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">
        {error || "Кадр недоступен"}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-950">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`btn-secondary ${tool === "draw" ? "ring-2 ring-blue-400" : ""}`}
            onClick={() => setTool("draw")}
          >
            Разметка
          </button>
          <button
            type="button"
            className={`btn-secondary ${tool === "pan" ? "ring-2 ring-blue-400" : ""}`}
            onClick={() => setTool("pan")}
          >
            Перемещение
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary" onClick={() => applyZoom(zoom - 0.2)}>
            -
          </button>
          <div className="min-w-[74px] text-center text-xs font-medium text-gray-600 dark:text-gray-300">{Math.round(zoom * 100)}%</div>
          <button type="button" className="btn-secondary" onClick={() => applyZoom(zoom + 0.2)}>
            +
          </button>
          <button type="button" className="btn-secondary" onClick={resetView}>
            Сброс
          </button>
        </div>
      </div>

       <div
         ref={containerRef}
         tabIndex={0}
         onClick={() => containerRef.current?.focus()}
         onContextMenu={(e) => e.preventDefault()}
         className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950"
       >
         <Stage
           ref={stageRef}
           width={stageWidth}
           height={stageHeight}
           onMouseDown={handleMouseDown}
           onMouseMove={handleMouseMove}
           onMouseUp={handleMouseUp}
           onWheel={handleWheel}
           className={tool === "pan" ? "cursor-grab" : "cursor-crosshair"}
           // Prevent mouse events from interfering with panning
           onMouseEnter={tool === "pan" ? () => { /* Do nothing */ } : undefined}
           onMouseLeave={tool === "pan" ? () => { /* Do nothing */ } : undefined}
         >
          <Layer>
            <Group
              ref={contentRef}
              x={pan.x}
              y={pan.y}
              scaleX={zoom}
              scaleY={zoom}
              draggable={tool === "pan"}
              onDragEnd={(event) => setPan({ x: event.target.x(), y: event.target.y() })}
            >
              {image ? <KonvaImage image={image} width={canvasWidth} height={canvasHeight} /> : null}
              {value.map((box, index) => {
                const canvasBox = toCanvasCoords(box);
                const color = labelColorMap.get(box.label) || "#ef4444";
                const isSelected = selectedBoxIndex === index;
                return (
               <Group
                     key={`${box.label}-${index}`}
                     draggable={tool === "draw"}
                     onClick={(event) => {
                       // Don't select boxes when in pan mode or right-clicking
                       if (tool === "pan" || event.button === 2) {
                         return;
                       }
                       event.cancelBubble = true;
                       onSelectedBoxIndexChange(index);
                     }}
                     onTap={(event) => {
                       // Don't select boxes when in pan mode or right-clicking
                       if (tool === "pan" || event.button === 2) {
                         return;
                       }
                       event.cancelBubble = true;
                       onSelectedBoxIndexChange(index);
                     }}
                     onDragEnd={(event) => {
                       // Only update box position when in draw mode
                       if (tool === "draw") {
                         updateDraggedBox(index, event.target.x(), event.target.y());
                       }
                     }}
                     x={canvasBox.x}
                     y={canvasBox.y}
                   >
                     <Rect
                       width={canvasBox.width}
                       height={canvasBox.height}
                       stroke={color}
                       strokeWidth={isSelected ? 1.5 : 2}
                       dash={isSelected ? [8, 4] : undefined}
                     />
                    <Text y={-18} text={box.label} fill={color} fontSize={14} fontStyle="bold" />
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
            </Group>
          </Layer>
        </Stage>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500 dark:text-gray-400">
        <span>Активная метка: {currentLabel || "сначала выберите метку"}</span>
        <span>{value.length} рамок</span>
      </div>
    </div>
  );
}
