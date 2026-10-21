"use client";

import Image from "next/image";
import { useState } from "react";

export function TopicsArticleImage({ src, reader = false }: { src: string; reader?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return <div className={reader ? "news-reader-image" : "topics-story-image"}>
    <Image src={src} alt="" width={reader ? 1200 : 680} height={reader ? 675 : 380} unoptimized
      style={{ visibility: loaded ? "visible" : "hidden" }}
      onLoad={(event) => { if (event.currentTarget.naturalWidth > 0) setLoaded(true); }}
      onError={() => setFailed(true)} />
  </div>;
}
