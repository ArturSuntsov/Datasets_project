import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { annotatorAPI } from "../services/api";
import { useAuthStore } from "../store";
import type { InstructionAsset, InstructionBundle } from "../types";

type InstructionPanelProps = {
  projectId?: string;
  bundle?: InstructionBundle | null;
  fallbackText?: string;
  compact?: boolean;
  autoOpen?: boolean;
  buttonLabel?: string;
};

type ExampleBox = { x: number; y: number; width: number; height: number; label?: string; color?: string };
type FocusRect = { x: number; y: number; width: number; height: number } | null;
type ViewportSize = { width: number; height: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function useElementSize(ref: RefObject<HTMLElement>): ViewportSize {
  const [size, setSize] = useState<ViewportSize>({ width: 1, height: 1 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setSize({ width: Math.max(element.clientWidth, 1), height: Math.max(element.clientHeight, 1) });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [ref]);
  return size;
}

function normalizeExampleBox(raw: Record<string, unknown>, imageWidth: number, imageHeight: number): ExampleBox | null {
  let x = Number(raw.x ?? raw.left ?? raw.x_min ?? raw.x1 ?? 0);
  let y = Number(raw.y ?? raw.top ?? raw.y_min ?? raw.y1 ?? 0);
  let width = Number(raw.width ?? raw.w ?? 0);
  let height = Number(raw.height ?? raw.h ?? 0);
  const x2 = Number(raw.x2 ?? raw.right ?? raw.x_max ?? Number.NaN);
  const y2 = Number(raw.y2 ?? raw.bottom ?? raw.y_max ?? Number.NaN);

  if ((!width || !height) && Number.isFinite(x2) && Number.isFinite(y2)) {
    width = x2 - x;
    height = y2 - y;
  }

  const values = [x, y, width, height].map(Math.abs);
  const looksNormalized = imageWidth > 10 && imageHeight > 10 && values.every((value) => value <= 1.0001);
  if (looksNormalized) {
    x *= imageWidth;
    y *= imageHeight;
    width *= imageWidth;
    height *= imageHeight;
  }

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 0) {
    x += width;
    width = Math.abs(width);
  }
  if (height < 0) {
    y += height;
    height = Math.abs(height);
  }
  if (width <= 0 || height <= 0) return null;

  const left = clamp(x, 0, imageWidth);
  const top = clamp(y, 0, imageHeight);
  const right = clamp(x + width, 0, imageWidth);
  const bottom = clamp(y + height, 0, imageHeight);
  if (right <= left || bottom <= top) return null;
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    label: String(raw.label || raw.class_name || raw.category || ""),
    color: typeof raw.color === "string" ? raw.color : undefined,
  };
}

function boxesBoundingRect(boxes: ExampleBox[]): FocusRect {
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function paddedRect(rect: FocusRect, imageWidth: number, imageHeight: number): FocusRect {
  if (!rect) return null;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const targetWidth = Math.min(imageWidth, Math.max(rect.width * 4.2, imageWidth * 0.16));
  const targetHeight = Math.min(imageHeight, Math.max(rect.height * 4.2, imageHeight * 0.16));
  const left = clamp(centerX - targetWidth / 2, 0, Math.max(imageWidth - targetWidth, 0));
  const top = clamp(centerY - targetHeight / 2, 0, Math.max(imageHeight - targetHeight, 0));
  return { x: left, y: top, width: Math.max(targetWidth, 1), height: Math.max(targetHeight, 1) };
}

function clampPan(value: number, viewportSize: number, imageSize: number) {
  if (imageSize <= viewportSize) return (viewportSize - imageSize) / 2;
  return clamp(value, viewportSize - imageSize, 0);
}

function assetKindLabel(asset: InstructionAsset) {
  const labels: Record<string, string> = {
    instruction: "Инструкция",
    link: "Ссылка",
    embedded: "Блок",
    good_example: "Хороший пример",
    bad_example: "Плохой пример",
    annotated_example: "Размеченный пример",
  };
  return labels[asset.asset_type] || asset.asset_type;
}

function isHtmlInstruction(asset: InstructionAsset) {
  const value = `${asset.file_name || ""} ${asset.file_uri || ""}`.toLowerCase();
  return value.includes(".html") || value.includes(".htm");
}

function dedupeAssets(assets: InstructionAsset[]) {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    const key = asset.file_uri || asset.url || `${asset.asset_type}:${asset.file_name || asset.title || asset.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ExampleImage({ asset }: { asset: InstructionAsset }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewport = useElementSize(containerRef);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const boxes = Array.isArray((asset.label_data as any)?.boxes)
    ? ((asset.label_data as any).boxes as Array<Record<string, unknown>>)
    : [];
  const width = Math.max(Number(naturalSize?.width || (asset.label_data as any)?.width || 1), 1);
  const height = Math.max(Number(naturalSize?.height || (asset.label_data as any)?.height || 1), 1);
  const hasImageDimensions = Boolean(naturalSize || ((asset.label_data as any)?.width && (asset.label_data as any)?.height));
  const normalizedBoxes = useMemo(
    () => boxes.map((box) => normalizeExampleBox(box, width, height)).filter(Boolean) as ExampleBox[],
    [boxes, height, width],
  );
  const rect = boxesBoundingRect(normalizedBoxes);
  const target = paddedRect(rect, width, height);
  const baseFitScale = Math.min(viewport.width / width, viewport.height / height);
  const targetScale = target ? Math.min(viewport.width / target.width, viewport.height / target.height) : baseFitScale;
  const scale = clamp(target ? targetScale : baseFitScale, baseFitScale * 0.75, baseFitScale * 10);
  const centerX = target ? target.x + target.width / 2 : width / 2;
  const centerY = target ? target.y + target.height / 2 : height / 2;
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const left = clampPan(viewport.width / 2 - centerX * scale, viewport.width, scaledWidth);
  const top = clampPan(viewport.height / 2 - centerY * scale, viewport.height, scaledHeight);
  const boxColor = asset.asset_type === "bad_example" ? "#f87171" : "#34d399";

  useEffect(() => {
    setNaturalSize(null);
    setImageFailed(false);
  }, [asset.file_uri]);

  if (!asset.file_uri || !boxes.length) return null;
  return (
    <div className="mt-3 overflow-hidden rounded-md border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900">
      <div ref={containerRef} className="relative h-80 w-full overflow-hidden">
        {!imageFailed ? (
          <img
            src={asset.file_uri}
            alt={asset.title || "instruction example"}
            className="absolute select-none"
            draggable={false}
            onLoad={(event) => {
              const image = event.currentTarget;
              setImageFailed(false);
              if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
              }
            }}
            onError={() => setImageFailed(true)}
            style={{ left, top, width: scaledWidth, height: scaledHeight, maxWidth: "none", maxHeight: "none" }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-gray-500">
            Не удалось загрузить изображение примера.
          </div>
        )}
        {hasImageDimensions && normalizedBoxes.map((box, index) => (
          <div
            key={`${asset.id}-${index}`}
            className="absolute border-2 border-emerald-400"
            style={{
              left: left + box.x * scale,
              top: top + box.y * scale,
              width: box.width * scale,
              height: box.height * scale,
              borderColor: box.color || boxColor,
              boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
            }}
          >
            {box.label ? <span className="absolute -top-6 left-0 rounded bg-black/80 px-2 py-0.5 text-xs text-white">{String(box.label)}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function AssetItem({ asset, projectId }: { asset: InstructionAsset; projectId?: string }) {
  const hasVisualLabels = Boolean(asset.file_uri && Array.isArray((asset.label_data as any)?.boxes) && (asset.label_data as any).boxes.length);
  const labelData = !hasVisualLabels && Object.keys(asset.label_data || {}).length ? JSON.stringify(asset.label_data, null, 2) : "";
  return (
    <div className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-gray-900 dark:text-white">{asset.title || asset.file_name || asset.url || assetKindLabel(asset)}</div>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">{assetKindLabel(asset)}</span>
      </div>
      {asset.body ? <div className="mt-2 whitespace-pre-wrap text-gray-700 dark:text-gray-300">{asset.body}</div> : null}
      <ExampleImage asset={asset} />
      {asset.url ? (
        <a className="mt-2 inline-block text-blue-600 hover:underline dark:text-blue-400" href={asset.url} target="_blank" rel="noreferrer">
          Открыть ссылку
        </a>
      ) : null}
      {asset.file_uri && isHtmlInstruction(asset) ? (
        <a className="mt-2 inline-block text-blue-600 hover:underline dark:text-blue-400" href={asset.file_uri} target="_blank" rel="noreferrer">
          Открыть инструкцию в новой вкладке
        </a>
      ) : asset.file_uri && !hasVisualLabels ? (
        <a className="mt-2 inline-block text-blue-600 hover:underline dark:text-blue-400" href={asset.file_uri} target="_blank" rel="noreferrer">
          {asset.file_name || "Открыть файл"}
        </a>
      ) : null}
      {labelData ? <pre className="mt-2 max-h-40 overflow-auto rounded bg-gray-950 p-2 text-xs text-green-200">{labelData}</pre> : null}
    </div>
  );
}

export function InstructionPanel({ projectId, bundle, fallbackText = "", compact = false, autoOpen = false, buttonLabel }: InstructionPanelProps) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [open, setOpen] = useState(false);
  const assets = useMemo(() => dedupeAssets(bundle?.assets ?? []), [bundle?.assets]);
  const instructions = bundle?.instructions ?? fallbackText;
  const acknowledged = Boolean(bundle?.acknowledgement?.acknowledged);
  const hasContent = Boolean(bundle || instructions || assets.length);
  const canManageExamples = user?.role === "customer" || user?.role === "admin";

  const groupedAssets = useMemo(() => {
    const good = assets.filter((asset) => asset.asset_type === "good_example" || asset.asset_type === "annotated_example");
    const bad = assets.filter((asset) => asset.asset_type === "bad_example");
    const instructionAssets = assets.filter((asset) => !["good_example", "bad_example", "annotated_example"].includes(asset.asset_type));
    return { instructionAssets, good, bad };
  }, [assets]);

  const ackMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("projectId missing");
      return annotatorAPI.acknowledgeInstructions(projectId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["annotator-project-detail", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-instructions", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["annotator-assignment"] });
      await queryClient.invalidateQueries({ queryKey: ["interval-chunk-queue"] });
      await queryClient.invalidateQueries({ queryKey: ["interval-validation-queue"] });
      await queryClient.invalidateQueries({ queryKey: ["bbox-validation-queue"] });
    },
  });

  useEffect(() => {
    if (autoOpen && hasContent && !acknowledged) {
      setOpen(true);
    }
  }, [autoOpen, acknowledged, hasContent, bundle?.instructions_version]);

  return (
    <>
      <button type="button" className={compact ? "btn-secondary" : "btn-primary"} onClick={() => setOpen(true)} disabled={!hasContent}>
        {buttonLabel || "Инструкция"}
        {acknowledged ? "" : " *"}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/70 p-4">
          <section className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Инструкция и примеры</h2>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Версия {bundle?.instructions_version ?? 0}
                  {bundle?.instructions_updated_at ? ` · ${new Date(bundle.instructions_updated_at).toLocaleString()}` : ""}
                  {acknowledged ? " · прочитано" : ""}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {projectId && !acknowledged ? (
                  <button type="button" className="btn-primary" onClick={() => ackMutation.mutate()} disabled={ackMutation.isPending}>
                    {ackMutation.isPending ? "Сохраняем..." : "Подтвердить чтение"}
                  </button>
                ) : null}
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                  Закрыть
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
              <div className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                {instructions || "Инструкция пока не добавлена."}
              </div>
              {groupedAssets.instructionAssets.length ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Материалы</div>
                  {groupedAssets.instructionAssets.map((asset) => <AssetItem key={asset.id} asset={asset} projectId={projectId} />)}
                </div>
              ) : null}
              {groupedAssets.good.length ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Хорошая разметка</div>
                  {groupedAssets.good.map((asset) => <AssetItem key={asset.id} asset={asset} projectId={projectId} />)}
                </div>
              ) : null}
              {groupedAssets.bad.length ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-red-700 dark:text-red-300">Плохая разметка</div>
                  {groupedAssets.bad.map((asset) => <AssetItem key={asset.id} asset={asset} projectId={projectId} />)}
                </div>
              ) : null}
              {!groupedAssets.good.length && !groupedAssets.bad.length && projectId ? (
                <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
                  <div className="font-medium text-gray-900 dark:text-white">Примеры разметки ещё не добавлены</div>
                  {canManageExamples ? (
                    <Link className="btn-secondary mt-3 inline-block" to={`/projects/${projectId}/golden`}>
                      Создать примеры Golden dataset
                    </Link>
                  ) : null}
                </div>
              ) : null}
              {ackMutation.isError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Не удалось сохранить подтверждение.</div> : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function InstructionGate({ projectId, bundle, fallbackText }: InstructionPanelProps) {
  if (!bundle || bundle.acknowledgement.acknowledged) {
    return null;
  }
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <div className="font-semibold">Перед стартом нужно прочитать инструкцию</div>
      <div className="mt-2 text-sm">Откройте инструкцию и подтвердите чтение текущей версии. После обновления инструкции подтверждение потребуется снова.</div>
      <div className="mt-3">
        <InstructionPanel projectId={projectId} bundle={bundle} fallbackText={fallbackText} compact />
      </div>
    </div>
  );
}
