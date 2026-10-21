import featuredSource from "@/content/experiment-lab.json";
import { builtStudies } from "@/content/lab-studies";
import { getAuthor, getPost, type CollectionCategory } from "@/lib/atlas";

export type LabOccurrence = {
  startFrame: number;
  endFrame: number;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
};

export type LabFrame = {
  id: string;
  sourceFrame: number;
  timeSeconds: number;
  totalVisibleSeconds: number;
  occurrences: LabOccurrence[];
};

export type LabStudyKind = "video" | "carousel" | "photo";

export type LabStudyScene = {
  frameId: string;
  startSeconds: number;
  endSeconds: number;
  title: string;
  visual: string;
  onScreen: string[];
  narration: string;
};

export type LabStudyAnalysis = {
  title: string;
  summary: string;
  frameSampleCount: number;
  ocrIntervalSeconds: number;
  audioMethod: string;
  caption: string;
  scenes: LabStudyScene[];
  transcript: { startSeconds: number; endSeconds: number; text: string }[];
  ocrSamples: { timeSeconds: number; strings: string[] }[];
};

export type LabStudy = {
  author: string;
  asset: string;
  kind: LabStudyKind;
  sourceSha256: string | string[];
  width: number;
  height: number;
  // Downloaded source video relative to the archive root, when the post has no local video.
  sourceFile: string | null;
  segmentation: string;
  method?: string;
  durationSeconds: number;
  totalFrames: number;
  heldStates: number;
  uniqueSlides: number;
  frames: LabFrame[];
  analysis?: LabStudyAnalysis;
};

// The reviewed Demo Studio study comes first; scripts/build-lab-studies.py adds the
// others to content/lab-studies, newest post first. Routes and media stay scoped to each asset.
const featuredStudy: LabStudy = { ...featuredSource, kind: "video", width: 540, height: 960, sourceFile: null, segmentation: "held states" };
const postDate = (study: LabStudy) => getPost(study.author, study.asset)?.date ?? "";
export const labStudies: LabStudy[] = [
  featuredStudy,
  ...(builtStudies as LabStudy[]).sort((a, b) => postDate(b).localeCompare(postDate(a))),
];

const studyIndex = new Map(labStudies.map((study) => [`${study.author}/${study.asset}`, study]));

export function getLabStudy(author: string, asset: string): LabStudy | undefined {
  return studyIndex.get(`${author}/${asset}`);
}

export function labStudyCategory(study: LabStudy): CollectionCategory {
  return getAuthor(study.author)?.collection ?? "design";
}

export function getLabStudiesForCategory(category: CollectionCategory): LabStudy[] {
  return labStudies.filter((study) => labStudyCategory(study) === category);
}

export function getLabFrame(study: LabStudy, id: string): LabFrame | undefined {
  return study.frames.find((frame) => frame.id === id);
}

export function labFrameSourceHash(study: LabStudy, frame: LabFrame): string {
  const hashes = Array.isArray(study.sourceSha256) ? study.sourceSha256 : [study.sourceSha256];
  return study.kind === "video" ? hashes[0] : hashes[frame.sourceFrame];
}

// Content-addressed frame ID. The source hash and decoded frame number remain
// the same when a study is rebuilt with different slide grouping or numbering.
export function labFrameUid(study: LabStudy, frame: LabFrame): string {
  return `cf1:${encodeURIComponent(study.author)}:${encodeURIComponent(study.asset)}:${labFrameSourceHash(study, frame)}:${frame.sourceFrame}`;
}

export function labStudyHref(study: LabStudy): string {
  return `/exp-lab/${encodeURIComponent(study.author)}/${encodeURIComponent(study.asset)}`;
}

export function labFrameHref(study: LabStudy, id: string): string {
  return `${labStudyHref(study)}/frames/${encodeURIComponent(id)}`;
}

export function labImageHref(study: LabStudy, id: string, variant: "thumb" | "full"): string {
  return `/media/exp-lab/${encodeURIComponent(study.author)}/${encodeURIComponent(study.asset)}/${encodeURIComponent(id)}/${variant}`;
}

export function isStillStudy(study: LabStudy): boolean {
  return study.kind !== "video";
}

export function labStudyCounts(category: CollectionCategory = "design") {
  const studies = getLabStudiesForCategory(category);
  const video = studies.filter((study) => study.kind === "video").length;
  return { all: studies.length, video, post: studies.length - video };
}

export function labSlideSummary(study: LabStudy): string {
  if (study.kind === "photo") return "1 photo";
  if (study.kind === "carousel") return `${study.uniqueSlides} carousel items`;
  return `${study.uniqueSlides} distinct ${study.segmentation === "visual scenes" ? "visual scenes" : "slides"}`;
}

export function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}
