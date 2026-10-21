"use client";

import Image from "next/image";
import { useState } from "react";
import type { MediaKind } from "@/lib/atlas";
import { useI18n } from "@/lib/i18n";

export function AssetViewer({
  kind,
  poster,
  video,
  image,
  source,
  alt,
}: {
  kind: MediaKind;
  poster: string;
  video: string;
  image?: string;
  source: string;
  alt: string;
}) {
  const { tr } = useI18n();
  const [imageFailed, setImageFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <div className="asset-viewer">
      {kind === "video" ? (
        <>
          <video src={video} poster={poster} controls playsInline preload="metadata" onError={() => setVideoFailed(true)} aria-label={alt} />
          {videoFailed && <p className="viewer-error">{tr("The saved video source is unavailable.", "無法播放已收藏的影片來源。")} {source && <a href={source} target="_blank" rel="noopener noreferrer">{tr("Open the original post ↗", "開啟原始貼文 ↗")}</a>}</p>}
        </>
      ) : (
        <Image src={image && !imageFailed ? image : poster} alt={alt} width={1000} height={1250} sizes="(max-width: 900px) 100vw, 65vw" unoptimized onError={() => setImageFailed(true)} />
      )}
    </div>
  );
}
