import { collectionsWorkerUrl } from "@/lib/collections-worker";
import type { LabStudy, LabStudyAnalysis } from "@/lib/experiment-lab";

type Passage = LabStudyAnalysis["transcript"][number];
type OcrSample = LabStudyAnalysis["ocrSamples"][number];

const workerUrl = collectionsWorkerUrl;

function isPassage(value: unknown): value is Passage {
  if (!value || typeof value !== "object") return false;
  const passage = value as Record<string, unknown>;
  return typeof passage.startSeconds === "number" && Number.isFinite(passage.startSeconds)
    && typeof passage.endSeconds === "number" && Number.isFinite(passage.endSeconds)
    && typeof passage.text === "string";
}

function isOcrSample(value: unknown): value is OcrSample {
  if (!value || typeof value !== "object") return false;
  const sample = value as Record<string, unknown>;
  return typeof sample.timeSeconds === "number" && Number.isFinite(sample.timeSeconds)
    && Array.isArray(sample.strings) && sample.strings.every((item) => typeof item === "string");
}

export async function getPersistedLabAnalysis(study: LabStudy): Promise<LabStudyAnalysis | undefined> {
  const fallback = study.analysis;
  if (!fallback) return undefined;

  try {
    const url = new URL(`${workerUrl}/api/lab-analysis`);
    url.searchParams.set("author", study.author);
    url.searchParams.set("asset", study.asset);
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!response.ok) return fallback;
    const value: unknown = await response.json();
    if (!value || typeof value !== "object") return fallback;
    const result = value as Record<string, unknown>;
    if (!Array.isArray(result.transcript) || !result.transcript.every(isPassage)
      || !Array.isArray(result.ocrSamples) || !result.ocrSamples.every(isOcrSample)
      || typeof result.audioMethod !== "string"
      || typeof result.ocrIntervalSeconds !== "number") return fallback;
    return {
      ...fallback,
      audioMethod: result.audioMethod,
      ocrIntervalSeconds: result.ocrIntervalSeconds,
      transcript: result.transcript,
      ocrSamples: result.ocrSamples,
    };
  } catch {
    // Keep the reviewed source manifest usable while the local D1 Worker is offline.
    return fallback;
  }
}
