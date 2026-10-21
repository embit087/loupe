// Asset file names (20260517_DEMO00001.mp4) are identifiers for code, not for people.
// The UI shows a human title plus a file-type chip; the full name stays in the chip's title and data attribute.

export type AssetType = { extension: string; kind: "video" | "photo" | "carousel" | "file"; label: string };

export function assetType(asset: string): AssetType {
  const extension = (/\.([a-z0-9]+)$/i.exec(asset)?.[1] ?? "").toLowerCase();
  if (extension === "mp4" || extension === "mov" || extension === "webm") return { extension: `.${extension}`, kind: "video", label: "Video" };
  if (extension === "jpg" || extension === "jpeg" || extension === "png" || extension === "webp") return { extension: `.${extension}`, kind: "photo", label: "Photo" };
  if (extension === "carousel") return { extension: "carousel", kind: "carousel", label: "Carousel" };
  return { extension: extension ? `.${extension}` : "file", kind: "file", label: "File" };
}

// A readable title: the caption's opening line when there is one, otherwise "Video by Name".
export function assetTitle({ asset, caption, authorName }: { asset: string; caption?: string | null; authorName: string }): string {
  const line = (caption ?? "").split("\n").map((part) => part.replace(/#\S+/g, "").trim()).find(Boolean) ?? "";
  if (line.length >= 8) return line.length > 72 ? `${line.slice(0, 71).trimEnd()}…` : line;
  return `${assetType(asset).label} by ${authorName}`;
}
