import { collectionsWorkerUrl } from "@/lib/collections-worker";
import { getAuthor, getPost, postHref, posterHref, videoHref, type CollectionCategory } from "@/lib/atlas";
import { getPersistedLabAnalysis } from "@/lib/lab-analysis";
import { getLabFrame, getLabStudy, labFrameHref, labFrameUid, labImageHref } from "@/lib/experiment-lab";
import { labWorkspaceId } from "@/lib/lab-workspace";

export const customLabWorkerUrl = collectionsWorkerUrl;

export type StudyCategory = CollectionCategory | "topics";

export type CustomStudy = {
  id: string;
  category: StudyCategory;
  title: string;
  createdAt: string;
  updatedAt: string;
  assetCount?: number;
};

export type CustomStudyAsset = {
  id: string;
  studyId: string;
  kind: string;
  author: string | null;
  asset: string | null;
  frameId: string | null;
  textContent: string | null;
  externalUrl: string | null;
  objectKey: string | null;
  fileName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  topicItemId: string | null;
  sourceTitle: string | null;
  createdAt: string;
};

export type DisplayAsset = CustomStudyAsset & {
  label: string;
  sourceLabel: string;
  frameUid?: string;
  href?: string;
  poster?: string;
  mediaUrl?: string;
  text?: string;
  transcript?: { startSeconds: number; endSeconds: number; text: string }[];
  ocrSamples?: { timeSeconds: number; strings: string[] }[];
};

export type CustomStudyDetail = { study: CustomStudy; assets: DisplayAsset[] };

export async function customLabFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("X-Collections-Viewer", labWorkspaceId);
  return fetch(`${customLabWorkerUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(10000),
  });
}

export async function getCustomStudy(id: string): Promise<CustomStudyDetail | null> {
  try {
    const response = await customLabFetch(`/api/custom-studies?id=${encodeURIComponent(id)}`);
    if (!response.ok) return null;
    const value = await response.json() as { study: CustomStudy; assets: CustomStudyAsset[] };
    if (!value.study || !Array.isArray(value.assets)) return null;
    const analysisCache = new Map<string, ReturnType<typeof getPersistedLabAnalysis>>();
    const assets = await Promise.all(value.assets.map(async (item): Promise<DisplayAsset> => {
      const post = item.author && item.asset ? getPost(item.author, item.asset) : null;
      const study = item.author && item.asset ? getLabStudy(item.author, item.asset) : undefined;
      const sourceLabel = post ? `@${post.author} · ${post.asset}` : item.kind === "article" && item.externalUrl
        ? new URL(item.externalUrl).hostname.replace(/^www\./, "") : item.fileName || "Added material";
      const display: DisplayAsset = { ...item, label: item.fileName || item.kind, sourceLabel };
      if (item.kind === "article") {
        display.label = item.sourceTitle || "Saved news source";
        display.href = item.externalUrl || undefined;
        display.text = item.textContent || undefined;
        return display;
      }
      if (item.objectKey) {
        display.label = item.fileName || "Uploaded file";
        display.mediaUrl = `/api/custom-study-files/${encodeURIComponent(item.id)}`;
        return display;
      }
      if (item.externalUrl) {
        display.label = `${item.kind[0].toUpperCase()}${item.kind.slice(1)} URL`;
        display.mediaUrl = item.externalUrl;
        display.href = item.externalUrl;
        return display;
      }
      if (item.textContent) {
        display.label = item.kind === "note" ? "Study note" : `Pasted ${item.kind}`;
        display.text = item.textContent;
        return display;
      }
      if (!post) return display;
      display.href = postHref(post);
      display.poster = posterHref(post);
      if (item.kind === "post") display.label = `Collected ${post.kind}`;
      if (item.kind === "caption") { display.label = "Post wording"; display.text = post.caption; }
      if (item.kind === "poster") { display.label = "Cover image"; display.mediaUrl = posterHref(post); }
      if (item.kind === "video" || item.kind === "audio") {
        display.label = item.kind === "audio" ? "Audio track" : "Source video";
        display.mediaUrl = videoHref(post);
      }
      if (item.kind === "frame" && study && item.frameId) {
        display.label = `Frame ${item.frameId}`;
        display.mediaUrl = labImageHref(study, item.frameId, "full");
        display.href = labFrameHref(study, item.frameId);
        const frame = getLabFrame(study, item.frameId);
        if (frame) display.frameUid = labFrameUid(study, frame);
      }
      if ((item.kind === "transcript" || item.kind === "ocr") && study) {
        const key = `${post.author}/${post.asset}`;
        if (!analysisCache.has(key)) analysisCache.set(key, getPersistedLabAnalysis(study));
        const analysis = await analysisCache.get(key);
        display.label = item.kind === "transcript" ? "Speech transcript" : "Frame OCR results";
        if (item.kind === "transcript") display.transcript = analysis?.transcript;
        else display.ocrSamples = analysis?.ocrSamples;
      }
      return display;
    }));
    return { study: value.study, assets };
  } catch {
    return null;
  }
}

export function postInCustomStudyCategory(author: string, asset: string, category: CollectionCategory): boolean {
  return Boolean(getPost(author, asset) && getAuthor(author)?.collection === category);
}
