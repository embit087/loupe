import cache from "@/content/media-cache.json";

const defaultOrigin = "http://127.0.0.1:8788";

export function cachedMediaUrl(key: string, kind: "post" | "frame" | "visual"): string | null {
  const entries = kind === "post" ? cache.posts : kind === "frame" ? cache.frames : cache.visual;
  const object = (entries as Record<string, string>)[key];
  if (!object || !/^[a-f0-9]{64}\.(jpg|png|mp4)$/.test(object)) return null;
  const origin = (process.env.COLLECTIONS_MEDIA_ORIGIN || defaultOrigin).replace(/\/$/, "");
  return `${origin}/objects/${object}`;
}
