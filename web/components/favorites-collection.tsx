"use client";

import Link from "next/link";
import { ArchiveShell } from "@/components/archive-shell";
import { CollectionLayout } from "@/components/collection-layout";
import { useLabPosts } from "@/components/lab-posts";
import { PostGrid, type CardPost } from "@/components/post-grid";
import { categoryHref, withMediaFilter, type Author, type CollectionCategory, type MediaFilter } from "@/lib/atlas";
import { useI18n } from "@/lib/i18n";

export function FavoritesCollection({ authors, cards, category, filter }: {
  authors: Author[]; cards: CardPost[]; category: CollectionCategory; filter: MediaFilter;
}) {
  const { tr } = useI18n();
  const { posts, ready, error } = useLabPosts();
  const picked = new Set(posts.map((post) => `${post.author}/${post.asset}`));
  const favorites = cards.filter((post) => picked.has(`${post.author}/${post.asset}`));
  const selected = favorites.filter((post) => filter === "all" || (filter === "video" ? post.kind === "video" : post.kind !== "video"));
  const counts = { all: favorites.length, video: favorites.filter((post) => post.kind === "video").length,
    post: favorites.filter((post) => post.kind !== "video").length };
  return <ArchiveShell authors={authors} selectedAuthor={null} category={category} favoritesView filter={filter} counts={counts}>
    <CollectionLayout title={tr("Favorites", "收藏夾")} context={<>
      <div className="collection-heading"><p className="eyebrow">{tr("YOUR COLLECTION / 2026", "你的收藏／2026")}</p>
        <h1>{tr("Favorites", "收藏夾")}</h1><div className="collection-summary"><strong>{tr(`${favorites.length} saved posts`, `已收藏 ${favorites.length} 則貼文`)}</strong><span>{tr(`${selected.length} shown`, `顯示 ${selected.length} 則`)}</span></div></div>
      <div className="collection-intro"><strong>{tr("Keep posts close for later.", "把想再看的貼文收在這裡。")}</strong>
        <p>{tr("Saved posts are shared with your Exp Lab selection. Use the save control on a post to remove it.", "已收藏貼文與實驗室選取共用；按貼文上的收藏按鈕即可移除。")}</p></div>
    </>}>
      <div className="collection-posts">
      {!ready ? <div className="empty-state" role="status">{error || tr("Loading favorites…", "正在載入收藏夾…")}</div> :
        favorites.length ? <PostGrid key={filter} items={selected} showAuthor filter={filter} favoriteActions emptyMessage={tr("No favorites match this filter.", "此篩選條件下沒有收藏貼文。")} /> :
        <div className="empty-state"><span>{tr("No favorites yet.", "收藏夾目前沒有貼文。")}</span><Link href={withMediaFilter(categoryHref(category), filter)}>{tr("Browse posts ↗", "瀏覽貼文 ↗")}</Link></div>}
      </div>
    </CollectionLayout>
  </ArchiveShell>;
}
