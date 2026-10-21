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

export function LikedCollection({ authors, cards, category, filter }: { authors: Author[]; cards: CardPost[]; category: CollectionCategory; filter: MediaFilter }) {
  const { tr } = useI18n();
  const [liked, setLiked] = useState<ReactionPost[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/liked", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Liked posts are unavailable right now.");
        const data = await response.json() as { posts: ReactionPost[] };
        if (!Array.isArray(data.posts)) throw new Error("Liked posts are unavailable right now.");
        setLiked(data.posts);
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Liked posts are unavailable right now.");
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  const likedKeys = new Set((liked ?? []).map(key));
  const likedCards = cards.filter((post) => likedKeys.has(key(post)));
  const selected = likedCards.filter((post) => filter === "all" || (filter === "video" ? post.kind === "video" : post.kind !== "video"));
  const counts = {
    all: likedCards.length,
    video: likedCards.filter((post) => post.kind === "video").length,
    post: likedCards.filter((post) => post.kind !== "video").length,
  };

  function onVoteSaved(annotation: Annotation) {
    if (annotation.myReaction !== 1) {
      setLiked((current) => current?.filter((post) => key(post) !== key(annotation)) ?? null);
    }
  }

  const emptyMessage = filter === "video" ? tr("No liked videos yet.", "還沒有喜歡的影片。") : tr("No liked image posts yet.", "還沒有喜歡的圖片貼文。");

  return (
    <ArchiveShell authors={authors} selectedAuthor={null} category={category} likedView filter={filter} counts={counts}>
      <CollectionLayout
        title={tr("Liked posts", "喜歡的貼文")}
        context={
          <>
            <div className="collection-heading">
              <p className="eyebrow">{tr("Your collection / 2026", "你的收藏／2026")}</p>
              <h1>{tr("Liked posts", "喜歡的貼文")}</h1>
              <div className="collection-summary">
                <strong>{liked === null && !error ? tr("Loading your likes…", "正在載入喜歡的貼文…") : tr(`${likedCards.length} liked posts`, `${likedCards.length} 則喜歡的貼文`)}</strong>
                <span>{tr(`${selected.length} shown`, `顯示 ${selected.length} 則`)}</span>
              </div>
            </div>
            <div className="collection-intro">
              <strong>{tr("Posts you liked.", "你喜歡的貼文。")}</strong>
              <p>{tr("Use the media pills to narrow this collection. Remove a like to take a post out of this view.", "可依媒體類型篩選。取消喜歡即可將貼文移出這個檢視。")}</p>
            </div>
          </>
        }
      >
        <div className="collection-posts">
        {error ? (
          <div className="empty-state" role="status">
            <span>{error}</span>
            <button type="button" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>{tr("Try again", "重試")}</button>
          </div>
        ) : liked === null ? (
          <div className="empty-state" role="status">{tr("Loading liked posts…", "正在載入喜歡的貼文…")}</div>
        ) : likedCards.length === 0 ? (
          <div className="empty-state">
            <span>{tr("No liked posts yet. Select ♥ on any post to add it here.", "還沒有喜歡的貼文。按貼文上的 ♥ 即可加入。")}</span>
            <Link href={withMediaFilter(categoryHref(category), filter)}>{tr("Browse all posts ↗", "瀏覽所有貼文 ↗")}</Link>
          </div>
        ) : (
          <PostGrid key={filter} items={selected} showAuthor filter={filter} emptyMessage={emptyMessage} onVoteSaved={onVoteSaved} />
        )}
        </div>
        <footer className="collection-footer">{tr("Likes are saved for this browser · View post opens its asset page", "喜歡的貼文會保存在此瀏覽器 · 查看貼文可開啟素材頁面")}</footer>
      </CollectionLayout>
    </ArchiveShell>
  );
}
