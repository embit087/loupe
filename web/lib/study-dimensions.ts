import { studyMeasures } from "@/content/study-measures";
import { studyAssessments } from "@/content/study-dimensions";
import studyReferences from "@/content/study-references.json";
import { getAuthor, getPost, formatCount, formatDate } from "@/lib/atlas";
import { assetTitle } from "@/lib/asset-label";
import type { LabStudy, LabStudyAnalysis } from "@/lib/experiment-lab";

// The study-dimensions framework: one fixed set of dimensions, filled for every studied post so
// studies can be compared and used as generation prompts for web assets of similar quality.
// Each dimension states how it is known: measured from the files, read from frames (OCR),
// classified by a vision model, judged by a person or model, or taken from metadata.

export type DimensionMethod = "measured" | "ocr" | "vision" | "judged" | "metadata";
export type Confidence = "high" | "medium" | "low";
export type Dimension = { key: string; label: string; method: DimensionMethod; value: string | null; confidence?: Confidence; detail?: string };
export type DimensionGroup = { key: string; label: string; dimensions: Dimension[] };
export type StudyDimensions = {
  author: string; asset: string; title: string; kind: LabStudy["kind"]; assessedAt: string | null; assessedBy: string | null;
  groups: DimensionGroup[]; palette: { hex: string; weight: number }[]; brightnessArc: number[] | null;
  generation: { keep: string[]; vary: string[]; avoid: string[] };
  // Representative frames published to the reference-asset origin (R2) for use as prompt references.
  references: StudyReference[]; prompt: string;
};
export type StudyReference = { id: string; url: string; label: string; width: number; height: number };

type Assessment = {
  author: string; asset: string; assessedAt: string; assessedBy: string;
  values: Record<string, { value: string; confidence?: Confidence; detail?: string }>;
  keep: string[]; vary: string[]; avoid: string[];
};
type Measures = { author: string; asset: string; summary: { brightness: number; brightnessArc: number[]; contrast: number; saturation: number; colourfulness: number; monochrome: boolean; sharpness: number; palette: { hex: string; weight: number }[] } };

// The catalogue: every study is described against these, in this order.
export const dimensionCatalogue: { key: string; label: string; dimensions: { key: string; label: string; method: DimensionMethod }[] }[] = [
  { key: "time", label: "Time & rhythm", dimensions: [
    { key: "duration", label: "Length & frame rate", method: "measured" },
    { key: "cutRate", label: "Cut rate", method: "measured" },
    { key: "holdLength", label: "Hold length", method: "measured" },
    { key: "pacingArc", label: "Pacing arc", method: "measured" },
    { key: "repetition", label: "Repetition", method: "measured" },
    { key: "loop", label: "Loop design", method: "measured" },
    { key: "transitions", label: "Transitions", method: "judged" },
    { key: "motionInFrame", label: "Motion inside frames", method: "judged" },
  ] },
  { key: "colour", label: "Colour & tone", dimensions: [
    { key: "palette", label: "Palette", method: "measured" },
    { key: "saturation", label: "Saturation", method: "measured" },
    { key: "brightnessArc", label: "Tonal arc", method: "measured" },
    { key: "contrast", label: "Contrast", method: "measured" },
    { key: "texture", label: "Texture & finish", method: "judged" },
  ] },
  { key: "composition", label: "Composition & layout", dimensions: [
    { key: "format", label: "Format", method: "measured" },
    { key: "markPlacement", label: "Mark placement & scale", method: "judged" },
    { key: "negativeSpace", label: "Negative space & grid", method: "judged" },
    { key: "framing", label: "Framing", method: "judged" },
  ] },
  { key: "typography", label: "Typography", dimensions: [
    { key: "typeFamilies", label: "Families", method: "judged" },
    { key: "typeSetting", label: "Setting & hierarchy", method: "judged" },
    { key: "onScreenText", label: "On-screen text", method: "ocr" },
  ] },
  { key: "content", label: "Content inventory", dimensions: [
    { key: "motif", label: "Mark or motif", method: "judged" },
    { key: "contexts", label: "Mockup contexts", method: "judged" },
    { key: "photography", label: "Photography", method: "judged" },
    { key: "subjects", label: "Subjects per frame", method: "vision" },
  ] },
  { key: "sound", label: "Sound", dimensions: [
    { key: "audio", label: "Music & sound", method: "judged" },
    { key: "speech", label: "Speech", method: "ocr" },
  ] },
  { key: "meaning", label: "Meaning & voice", dimensions: [
    { key: "genre", label: "Genre & purpose", method: "judged" },
    { key: "communication", label: "What the structure says", method: "judged" },
    { key: "voice", label: "Brand voice", method: "judged" },
    { key: "references", label: "References & trend", method: "judged" },
  ] },
  { key: "context", label: "Context", dimensions: [
    { key: "source", label: "Author & date", method: "metadata" },
    { key: "tag", label: "Collection tag", method: "metadata" },
    { key: "caption", label: "Caption", method: "metadata" },
    { key: "engagement", label: "Engagement at collection", method: "metadata" },
  ] },
  { key: "use", label: "Use & limits", dimensions: [
    { key: "relevance", label: "Relevance to the business", method: "judged" },
    { key: "limits", label: "Evidence & limits", method: "judged" },
  ] },
];

const key = (author: string, asset: string) => `${author}/${asset}`;
const measuresIndex = new Map((studyMeasures as Measures[]).map((item) => [key(item.author, item.asset), item]));
const assessmentIndex = new Map((studyAssessments as Assessment[]).map((item) => [key(item.author, item.asset), item]));

const pct = (value: number) => `${Math.round(value * 100)}%`;
const seconds = (value: number) => `${value.toFixed(2)}s`;

function timeline(study: LabStudy) {
  return study.frames.flatMap((frame) => frame.occurrences.map((occurrence) => ({ id: frame.id, ...occurrence }))).sort((a, b) => a.startFrame - b.startFrame);
}

// Everything that can be computed from the study files.
function measured(study: LabStudy, measures: Measures | undefined): Record<string, Omit<Dimension, "key" | "label" | "method">> {
  const values: Record<string, Omit<Dimension, "key" | "label" | "method">> = {};
  if (study.kind === "video" && study.durationSeconds > 0) {
    const runs = timeline(study);
    const fps = study.totalFrames / study.durationSeconds;
    const holds = runs.map((run) => run.endFrame - run.startFrame);
    const counts = new Map<number, number>();
    for (const hold of holds) counts.set(hold, (counts.get(hold) ?? 0) + 1);
    const [modeHold, modeCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
    const half = runs.length ? runs[Math.floor(runs.length / 2)].startFrame : 0;
    const avg = (items: number[]) => items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : 0;
    const first = avg(runs.filter((run) => run.startFrame < half).map((run) => run.endFrame - run.startFrame));
    const second = avg(runs.filter((run) => run.startFrame >= half).map((run) => run.endFrame - run.startFrame));
    const trend = second > first * 1.3 ? "slows down" : second < first * 0.77 ? "speeds up" : "holds a steady pace";
    const repeats = study.frames.filter((frame) => frame.occurrences.length > 1);
    const lateRepeats = runs.filter((run, index) => index > 0 && runs.slice(0, index).some((earlier) => earlier.id === run.id));
    const settled = study.segmentation === "settled moments";
    values.duration = { value: `${study.durationSeconds}s · ${study.totalFrames} frames at ${Math.round(fps * 100) / 100} fps`, confidence: "high" };
    values.cutRate = { value: settled
      ? `${runs.length} settled moments in ${study.durationSeconds}s (${(runs.length / study.durationSeconds).toFixed(1)} per second); continuous motion between them`
      : `${runs.length} picture changes · ${(runs.length / study.durationSeconds).toFixed(1)} per second`, confidence: "high" };
    values.holdLength = { value: settled
      ? `Settled moments last ${seconds(Math.min(...holds) / fps)}–${seconds(Math.max(...holds) / fps)}`
      : `${modeCount} of ${holds.length} images held ${modeHold} frames (${seconds(modeHold / fps)})${modeHold === 2 ? " — “on twos”" : ""}; longest ${Math.max(...holds)} frames`, confidence: "high" };
    values.pacingArc = { value: `First half averages ${first.toFixed(1)} frames per image, second half ${second.toFixed(1)}: ${trend}`, confidence: "high",
      detail: `Hold sequence: ${holds.join(" ")}` };
    values.repetition = { value: repeats.length ? `${repeats.length} images return (${lateRepeats.length} reappearances), mostly ${lateRepeats.filter((run) => run.startFrame >= half).length > lateRepeats.length / 2 ? "in the second half" : "spread through"}` : "No image repeats", confidence: "high" };
    const last = runs.at(-1);
    values.loop = { value: last ? `Opens on image ${runs[0].id}, ends on ${last.id}${last.id === runs[0].id ? " — returns to the start" : ""}` : "—", confidence: "medium" };
  } else {
    const note = study.kind === "carousel" ? `A ${study.frames.length}-image carousel viewed one swipe at a time` : "A single still image";
    for (const field of ["duration", "cutRate", "holdLength", "pacingArc", "repetition", "loop"]) values[field] = { value: field === "duration" ? note : "Not applicable to a still", confidence: "high" };
  }
  const ratio = study.width / study.height;
  const named = Math.abs(ratio - 9 / 16) < 0.02 ? "9:16" : Math.abs(ratio - 4 / 5) < 0.03 ? "4:5" : Math.abs(ratio - 3 / 4) < 0.03 ? "3:4" : Math.abs(ratio - 1) < 0.02 ? "1:1" : ratio.toFixed(2);
  values.format = { value: `${named} · ${study.width}×${study.height}`, confidence: "high" };
  if (measures) {
    const summary = measures.summary;
    values.palette = { value: summary.palette.slice(0, 5).map((colour) => colour.hex).join(" · "), confidence: "high", detail: "Dominant colours across all frames, weighted by area." };
    values.saturation = { value: summary.monochrome ? `Monochrome (colourfulness ${summary.colourfulness}, saturation ${pct(summary.saturation)})` : `Colour (colourfulness ${summary.colourfulness}, saturation ${pct(summary.saturation)})`, confidence: "high" };
    const [start, middle, end] = summary.brightnessArc;
    const direction = end < start - 0.15 ? "light to dark" : end > start + 0.15 ? "dark to light" : "even tone";
    values.brightnessArc = { value: `${direction}: brightness ${pct(start)} → ${pct(middle)} → ${pct(end)} across the thirds`, confidence: "high" };
    values.contrast = { value: `${summary.contrast >= 0.35 ? "High" : summary.contrast >= 0.2 ? "Medium" : "Low"} contrast (${summary.contrast})`, confidence: "high" };
  }
  return values;
}

function fromAnalysis(analysis: LabStudyAnalysis | undefined): Record<string, Omit<Dimension, "key" | "label" | "method">> {
  if (!analysis) return {};
  const values: Record<string, Omit<Dimension, "key" | "label" | "method">> = {};
  const strings = [...new Set(analysis.ocrSamples.flatMap((sample) => sample.strings))];
  if (strings.length) values.onScreenText = { value: strings.slice(0, 12).join(" · "), confidence: "medium", detail: `${strings.length} distinct strings read from ${analysis.ocrSamples.length} samples.` };
  if (analysis.transcript.length) values.speech = { value: analysis.transcript.map((line) => line.text).join(" ").slice(0, 280), confidence: "medium", detail: analysis.audioMethod };
  return values;
}

function metadata(study: LabStudy): Record<string, Omit<Dimension, "key" | "label" | "method">> {
  const post = getPost(study.author, study.asset);
  if (!post) return {};
  const name = getAuthor(study.author)?.name ?? study.author;
  const counts = [post.likeCount !== null ? `${formatCount(post.likeCount)} likes` : null, post.playCount != null ? `${formatCount(post.playCount)} plays` : null, post.commentCount !== null ? `${formatCount(post.commentCount)} comments` : null].filter(Boolean);
  return {
    source: { value: `${name} (@${study.author}) · ${formatDate(post.date)}`, confidence: "high" },
    tag: { value: post.category || "Untagged", confidence: "high" },
    caption: { value: post.caption.trim() ? post.caption.trim().slice(0, 240) : "No caption", confidence: "high" },
    engagement: { value: counts.length ? counts.join(" · ") : "Not collected for this post", confidence: "high" },
  };
}

function buildPrompt(record: Omit<StudyDimensions, "prompt">): string {
  const value = (dimension: string) => record.groups.flatMap((group) => group.dimensions).find((item) => item.key === dimension)?.value;
  const line = (label: string, keys: string[]) => {
    const parts = keys.map(value).filter((item): item is string => Boolean(item) && item !== "Not applicable to a still");
    return parts.length ? `${label}: ${parts.join("; ")}.` : null;
  };
  return [
    `Create a web asset with the quality and style of “${record.title}” by @${record.author}${value("genre") ? ` — ${value("genre")}` : ""}.`,
    record.references.length ? [
      "Reference images (style anchors: match their look, pacing and finish; do not copy their logos, people or text):",
      ...record.references.map((reference, index) => `${index + 1}. ${reference.label} — ${reference.url}`),
    ].join("\n") : null,
    line("Format", ["format", "duration"]),
    line("Motion", ["cutRate", "holdLength", "pacingArc", "repetition", "loop", "transitions", "motionInFrame"]),
    line("Colour", ["saturation", "palette", "brightnessArc", "contrast", "texture"]),
    line("Composition", ["markPlacement", "negativeSpace", "framing"]),
    line("Typography", ["typeFamilies", "typeSetting"]),
    line("Content", ["motif", "contexts", "photography"]),
    line("Voice", ["voice", "references"]),
    record.generation.keep.length ? `Keep: ${record.generation.keep.join("; ")}.` : null,
    record.generation.vary.length ? `Vary: ${record.generation.vary.join("; ")}.` : null,
    record.generation.avoid.length ? `Avoid: ${record.generation.avoid.join("; ")}.` : null,
  ].filter(Boolean).join("\n");
}

export function getStudyDimensions(study: LabStudy, analysis?: LabStudyAnalysis): StudyDimensions {
  const measures = measuresIndex.get(key(study.author, study.asset));
  const assessment = assessmentIndex.get(key(study.author, study.asset));
  const filled = { ...measured(study, measures), ...fromAnalysis(analysis ?? study.analysis), ...metadata(study) };
  if (study.kind !== "video" && !filled.speech) filled.speech = { value: "None (still image)", confidence: "high" };
  const groups = dimensionCatalogue.map((group) => ({
    key: group.key, label: group.label,
    dimensions: group.dimensions.map((dimension) => {
      const known = filled[dimension.key] ?? assessment?.values[dimension.key];
      return { ...dimension, value: known?.value ?? null, confidence: known?.confidence, detail: known?.detail };
    }),
  }));
  const post = getPost(study.author, study.asset);
  const record = {
    author: study.author, asset: study.asset, kind: study.kind,
    title: analysis?.title ?? study.analysis?.title ?? assetTitle({ asset: study.asset, caption: post?.caption, authorName: getAuthor(study.author)?.name ?? study.author }),
    assessedAt: assessment?.assessedAt ?? null, assessedBy: assessment?.assessedBy ?? null,
    groups, palette: measures?.summary.palette ?? [], brightnessArc: measures?.summary.brightnessArc ?? null,
    generation: { keep: assessment?.keep ?? [], vary: assessment?.vary ?? [], avoid: assessment?.avoid ?? [] },
    references: ((studyReferences as Record<string, StudyReference[]>)[key(study.author, study.asset)] ?? [])
      .map(({ id, url, label, width, height }) => ({ id, url, label, width, height })),
  };
  return { ...record, prompt: buildPrompt(record) };
}
