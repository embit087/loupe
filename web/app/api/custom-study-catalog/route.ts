import { NextRequest, NextResponse } from "next/server";
import { getAuthor, getCategoryPosts, posterHref } from "@/lib/atlas";
import { getLabStudy, labFrameUid, labImageHref } from "@/lib/experiment-lab";
import { assetTitle } from "@/lib/asset-label";

const noStore = { "Cache-Control": "no-store" };

export function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");
  if (category !== "design" && category !== "kol")
    return NextResponse.json({ error: "Invalid category" }, { status: 400, headers: noStore });
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().toLocaleLowerCase().slice(0, 100);
  const items = getCategoryPosts(category)
    .filter((post) => !query || [post.author, getAuthor(post.author)?.name ?? "", post.asset, post.caption]
      .some((value) => value.toLocaleLowerCase().includes(query)))
    .slice(0, 36)
    .map((post) => {
      const study = getLabStudy(post.author, post.asset);
      return {
        author: post.author,
        asset: post.asset,
        authorName: getAuthor(post.author)?.name ?? post.author,
        title: assetTitle({ asset: post.asset, caption: post.caption, authorName: getAuthor(post.author)?.name ?? post.author }),
        // Preview material for the picker, so each option shows what will be added.
        caption: post.caption.slice(0, 2000),
        video: post.kind === "video" ? `/media/${encodeURIComponent(post.author)}/${encodeURIComponent(post.asset)}/video` : "",
        transcriptPreview: (study?.analysis?.transcript ?? []).map((line) => line.text).join(" ").slice(0, 1200),
        ocrPreview: (study?.analysis?.ocrSamples ?? []).flatMap((sample) => sample.strings).filter((value, index, all) => all.indexOf(value) === index).slice(0, 40),
        kind: post.kind,
        date: post.date,
        poster: posterHref(post),
        hasCaption: Boolean(post.caption.trim()),
        hasPoster: Boolean(post.posterPath),
        hasVideo: post.kind === "video",
        hasTranscript: Boolean(study?.analysis?.transcript.length),
        hasOcr: Boolean(study?.analysis?.ocrSamples.length),
        frames: study?.frames.map((frame) => ({ id: frame.id, uid: labFrameUid(study, frame), sourceFrame: frame.sourceFrame, timeSeconds: frame.timeSeconds,
          image: labImageHref(study, frame.id, "thumb") })) ?? [],
      };
    });
  return NextResponse.json({ items }, { headers: noStore });
}
