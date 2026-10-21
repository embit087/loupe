"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArchiveShell } from "@/components/archive-shell";
import { CollectionLayout } from "@/components/collection-layout";
import { PostGrid, type CardPost } from "@/components/post-grid";
import type { Annotation, ReactionPost } from "@/components/reactions";
import { categoryHref, withMediaFilter, type Author, type CollectionCategory, type MediaFilter } from "@/lib/atlas";
import { useI18n } from "@/lib/i18n";

function key(post: ReactionPost) { return `${post.author}/${post.asset}`; }

export function DislikedCollection({ authors, cards, category, filter }: { authors: Author[]; cards: CardPost[]; category: CollectionCategory; filter: MediaFilter }) {
  const { tr } = useI18n();
  const [disliked, setDisliked] = useState<ReactionPost[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/disliked", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Disliked posts are unavailable right now.");
        const data = await response.json() as { posts: ReactionPost[] };
        if (!Array.isArray(data.posts)) throw new Error("Disliked posts are unavailable right now.");
        setDisliked(data.posts);
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Disliked posts are unavailable right now.");
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  const dislikedKeys = new Set((disliked ?? []).map(key));
  const dislikedCards = cards.filter((post) => dislikedKeys.has(key(post)));
  const selected = dislikedCards.filter((post) => filter === "all" || (filter === "video" ? post.kind === "video" : post.kind !== "video"));
  const counts = {
    all: dislikedCards.length,
    video: dislikedCards.filter((post) => post.kind === "video").length,
    post: dislikedCards.filter((post) => post.kind !== "video").length,
  };

  function onVoteSaved(annotation: Annotation) {
    if (annotation.myReaction !== -1) {
      setDisliked((current) => current?.filter((post) => key(post) !== key(annotation)) ?? null);
    }
  }

  const emptyMessage = filter === "video" ? tr("No disliked videos yet.", "還沒有略過的影片。") : tr("No disliked image posts yet.", "還沒有略過的圖片貼文。");

  return (
    <ArchiveShell authors={authors} selectedAuthor={null} category={category} dislikedView filter={filter} counts={counts}>
      <CollectionLayout
        title={tr("Disliked posts", "略過的貼文")}
        context={<>
          <div className="collection-heading">
            <p className="eyebrow">{tr("Your collection / 2026", "你的收藏／2026")}</p>
            <h1>{tr("Disliked posts", "略過的貼文")}</h1>
            <div className="collection-summary">
              <strong>{disliked === null && !error ? tr("Loading your dislikes…", "正在載入略過的貼文…") : tr(`${dislikedCards.length} disliked posts`, `${dislikedCards.length} 則略過的貼文`)}</strong>
              <span>{tr(`${selected.length} shown`, `顯示 ${selected.length} 則`)}</span>
            </div>
          </div>
          <div className="collection-intro">
            <strong>{tr("Posts you set aside.", "你略過的貼文。")}</strong>
            <p>{tr("Use the media pills to narrow this collection. Remove a dislike to restore a post to its creator grid.", "可依媒體類型篩選。取消略過後，貼文會重新出現在創作者的貼文列表。")}</p>
          </div>
        </>}
      >
        <div className="collection-posts">
        {error ? (
          <div className="empty-state" role="status">
            <span>{error}</span>
            <button type="button" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>{tr("Try again", "重試")}</button>
          </div>
        ) : disliked === null ? (
          <div className="empty-state" role="status">{tr("Loading disliked posts…", "正在載入略過的貼文…")}</div>
        ) : dislikedCards.length === 0 ? (
          <div className="empty-state">
            <span>{tr("No disliked posts yet. Select dislike on any post to add it here.", "還沒有略過的貼文。點選貼文上的略過按鈕即可加入。")}</span>
            <Link href={withMediaFilter(categoryHref(category), filter)}>{tr("Browse all posts ↗", "瀏覽所有貼文 ↗")}</Link>
          </div>
        ) : (
          <PostGrid key={filter} items={selected} showAuthor filter={filter} emptyMessage={emptyMessage} onVoteSaved={onVoteSaved} />
        )}
        </div>
        <footer className="collection-footer">{tr("Dislikes are saved for this browser · View post opens its asset page", "略過的貼文會保存在此瀏覽器 · 查看貼文可開啟素材頁面")}</footer>
      </CollectionLayout>
    </ArchiveShell>
  );
}
