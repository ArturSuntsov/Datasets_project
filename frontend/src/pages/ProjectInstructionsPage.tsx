import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { projectsAPI } from "../services/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuthStore } from "../store";
import type { InstructionAsset } from "../types";

function isHtmlFile(name?: string, uri?: string) {
  const value = `${name || ""} ${uri || ""}`.toLowerCase();
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

function InstructionExampleCard({ asset }: { asset: InstructionAsset }) {
  const boxes = Array.isArray((asset.label_data as any)?.boxes) ? ((asset.label_data as any).boxes as Array<Record<string, unknown>>) : [];
  const width = Math.max(Number((asset.label_data as any)?.width || 1), 1);
  const height = Math.max(Number((asset.label_data as any)?.height || 1), 1);
  const bad = asset.asset_type === "bad_example";
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div className="border-b border-gray-200 p-3 dark:border-gray-800">
        <div className="font-medium text-gray-900 dark:text-white">{asset.title || (bad ? "Плохой пример" : "Хороший пример")}</div>
        {asset.body ? <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{asset.body}</div> : null}
      </div>
      {asset.file_uri ? (
        <div className="bg-neutral-950 p-3">
          <div className="relative mx-auto max-h-[420px] max-w-4xl">
            <img src={asset.file_uri} alt={asset.title || "instruction example"} className="block max-h-[420px] w-full object-contain" />
            {boxes.map((box, index) => (
              <div
                key={`${asset.id}-${index}`}
                className="absolute border-2"
                style={{
                  left: `${(Number(box.x || 0) / width) * 100}%`,
                  top: `${(Number(box.y || 0) / height) * 100}%`,
                  width: `${(Number(box.width || 0) / width) * 100}%`,
                  height: `${(Number(box.height || 0) / height) * 100}%`,
                  borderColor: bad ? "#f87171" : "#34d399",
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.45)",
                }}
              >
                {box.label ? <span className="absolute -top-6 left-0 rounded bg-black/80 px-2 py-0.5 text-xs text-white">{String(box.label)}</span> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ProjectInstructionsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const user = useAuthStore((state) => state.user);
  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectsAPI.get(projectId!),
    enabled: !!projectId,
  });
  const instructionsQuery = useQuery({
    queryKey: ["project-instructions", projectId],
    queryFn: () => projectsAPI.instructions(projectId!),
    enabled: !!projectId,
  });

  if (projectQuery.isLoading) return <LoadingSpinner />;
  if (projectQuery.isError || !projectQuery.data) {
    return <div className="card text-sm text-red-600">Инструкция недоступна.</div>;
  }

  const project = projectQuery.data;
  const fileUri = project.instructions_file_uri || "";
  const fileName = project.instructions_file_name || "instruction";
  const html = isHtmlFile(fileName, fileUri);
  const bundle = instructionsQuery.data ?? project.instructions_bundle;
  const assets = dedupeAssets(bundle?.assets ?? []);
  const goodExamples = assets.filter((asset) => asset.asset_type === "good_example" || asset.asset_type === "annotated_example");
  const badExamples = assets.filter((asset) => asset.asset_type === "bad_example");
  const canManageExamples = user?.role === "customer" || user?.role === "admin";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Инструкция проекта</h1>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{project.title}</div>
        </div>
        <Link className="btn-secondary" to={`/projects/${project.id}`}>
          К проекту
        </Link>
      </div>

      {fileUri ? (
        <div className="card">
          <div className="font-medium text-gray-900 dark:text-white">{fileName}</div>
          <a className="mt-3 inline-flex text-blue-600 hover:underline dark:text-blue-400" href={fileUri} target="_blank" rel="noreferrer">
            {html ? "Открыть инструкцию в новой вкладке" : `Открыть файл ${fileName}`}
          </a>
        </div>
      ) : (
        <div className="card whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
          {project.instructions || "Инструкция пока не загружена."}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Примеры разметки</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Активные кейсы Golden dataset с назначением для инструкции отображаются здесь автоматически.</p>
          </div>
          {canManageExamples ? (
            <Link className="btn-secondary" to={`/projects/${project.id}/golden`}>
              Создать примеры Golden dataset
            </Link>
          ) : null}
        </div>

        {goodExamples.length ? (
          <div className="space-y-3">
            <div className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Хорошая разметка</div>
            {goodExamples.map((asset) => <InstructionExampleCard key={asset.id} asset={asset} />)}
          </div>
        ) : null}

        {badExamples.length ? (
          <div className="space-y-3">
            <div className="text-sm font-medium text-red-700 dark:text-red-300">Плохая разметка</div>
            {badExamples.map((asset) => <InstructionExampleCard key={asset.id} asset={asset} />)}
          </div>
        ) : null}

        {!instructionsQuery.isLoading && !goodExamples.length && !badExamples.length ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-5 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
            {canManageExamples
              ? "Примеров пока нет. Создайте пару активных кейсов Golden dataset и отметьте назначение для инструкции."
              : "Примеры разметки пока не добавлены."}
          </div>
        ) : null}
      </section>
    </div>
  );
}
