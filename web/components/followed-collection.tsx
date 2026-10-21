"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArchiveShell } from "@/components/archive-shell";
import { CollectionLayout } from "@/components/collection-layout";
import { FollowButton } from "@/components/follow-button";
import { PostGrid, type CardPost } from "@/components/post-grid";
import { categoryHref, withMediaFilter, type Author, type CollectionCategory, type MediaFilter } from "@/lib/atlas";
import { followChangeEvent, type FollowChange } from "@/lib/profile-events";
import { useI18n } from "@/lib/i18n";

export function FollowedCollection({ authors, cards, category, filter }: { authors: Author[]; cards: CardPost[]; category: CollectionCategory; filter: MediaFilter }) {
  const { tr } = useI18n();
  const [followed, setFollowed] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/follows", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Followed accounts are unavailable right now.");
        const data = await response.json() as { authors: string[] };
        if (!Array.isArray(data.authors)) throw new Error("Followed accounts are unavailable right now.");
        setFollowed(data.authors);
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Followed accounts are unavailable right now.");
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    function onFollowChange(event: Event) {
      const { author, following } = (event as CustomEvent<FollowChange>).detail;
      setFollowed((current) => current === null ? null : following
        ? current.includes(author) ? current : [...current, author]
        : current.filter((username) => username !== author));
    }
    window.addEventListener(followChangeEvent, onFollowChange);
    return () => window.removeEventListener(followChangeEvent, onFollowChange);
  }, []);

  const followedSet = new Set(followed ?? []);
  const followedAuthors = authors.filter((author) => author.collection === category && followedSet.has(author.username));
  const followedCards = cards.filter((post) => followedSet.has(post.author));
  const selected = followedCards.filter((post) => filter === "all" || (filter === "video" ? post.kind === "video" : post.kind !== "video"));
  const counts = {
    all: followedCards.length,
    video: followedCards.filter((post) => post.kind === "video").length,
    post: followedCards.filter((post) => post.kind !== "video").length,
  };

  return (
    <ArchiveShell authors={authors} selectedAuthor={null} category={category} followedView filter={filter} counts={counts}>
      <CollectionLayout
        title={tr("Followed", "追蹤中")}
        context={<>
          <div className="collection-heading">
            <p className="eyebrow">{tr("Your collection / 2026", "你的收藏／2026")}</p>
            <h1>{tr("Followed", "追蹤中")}</h1>
            <div className="collection-summary">
              <strong>{followed === null && !error ? tr("Loading followed accounts…", "正在載入追蹤帳號…") : tr(`${followedAuthors.length} followed accounts`, `已追蹤 ${followedAuthors.length} 個帳號`)}</strong>
              <span>{tr(`${selected.length} posts shown`, `顯示 ${selected.length} 則貼文`)}</span>
            </div>
          </div>
          <div className="collection-intro">
            <strong>{tr("Posts from accounts you follow.", "已追蹤帳號的貼文。")}</strong>
            <p>{tr("Follow a creator from their archive or a post page. Unfollow here to remove their posts from this view.", "可在創作者頁面或貼文頁面追蹤帳號。在此取消追蹤即可移除其貼文。")}</p>
          </div>
          {followedAuthors.length > 0 && <div className="followed-profiles" aria-label={tr("Followed accounts", "已追蹤帳號")}>
            {followedAuthors.map((author) => <div className="followed-profile" key={author.username}>
              <Link href={withMediaFilter(`/${encodeURIComponent(author.username)}`, filter)} prefetch={false}><strong>{author.name}</strong><span>@{author.username}</span></Link>
              <FollowButton author={author.username} initialFollowing onChange={(following) => {
                if (!following) setFollowed((current) => current?.filter((username) => username !== author.username) ?? null);
              }} />
            </div>)}
          </div>}
        </>}
      >
        <div className="collection-posts">
        {error ? (
          <div className="empty-state" role="status"><span>{error}</span><button type="button" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>{tr("Try again", "重試")}</button></div>
        ) : followed === null ? (
          <div className="empty-state" role="status">{tr("Loading followed accounts…", "正在載入追蹤帳號…")}</div>
        ) : followedAuthors.length === 0 ? (
          <div className="empty-state"><span>{tr("No followed accounts yet. Open a creator and select Follow.", "尚未追蹤任何帳號。開啟創作者頁面即可追蹤。")}</span><Link href={withMediaFilter(categoryHref(category), filter)}>{tr("Browse creators ↗", "瀏覽創作者 ↗")}</Link></div>
        ) : <PostGrid key={filter} items={selected} showAuthor filter={filter} emptyMessage={filter === "video" ? tr("No videos from followed accounts.", "已追蹤帳號沒有影片。") : filter === "post" ? tr("No image posts from followed accounts.", "已追蹤帳號沒有圖片貼文。") : tr("No collected 2026 posts from followed accounts.", "已追蹤帳號沒有 2026 年收藏貼文。")} />}
        </div>
        <footer className="collection-footer">{tr("Follows are saved for this browser · View post opens its asset page", "追蹤紀錄會保存在此瀏覽器 · 查看貼文可開啟素材頁面")}</footer>
      </CollectionLayout>
    </ArchiveShell>
  );
}
