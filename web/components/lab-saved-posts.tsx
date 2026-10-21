"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLabPosts } from "@/components/lab-posts";
import { PostGrid, type CardPost } from "@/components/post-grid";
import { labCategories, type LabCategory } from "@/lib/lab-categories";
import { categoryHref, type CollectionCategory } from "@/lib/atlas";
import { useI18n } from "@/lib/i18n";

function LabCategoryControls({ post }: { post: CardPost }) {
  const { tr } = useI18n();
  const { posts, pending, setCategory } = useLabPosts();
  const [error, setError] = useState("");
  const id = `${post.author}/${post.asset}`;
  const active = posts.find((item) => `${item.author}/${item.asset}` === id)?.categories ?? [];

  async function toggle(category: LabCategory) {
    setError("");
    try { await setCategory(post, category, !active.includes(category)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update Lab category"); }
  }

  return <div className="lab-post-categories" aria-label={tr(`Lab categories for ${post.asset}`, `${post.asset} 的實驗室分類`)}>
    {labCategories.map((category) => <button key={category} type="button" aria-pressed={active.includes(category)}
      className={active.includes(category) ? "selected" : ""} disabled={Boolean(pending[id])}
      onClick={() => void toggle(category)}>{category}</button>)}
    {error && <span role="status" className="lab-action-error">{error}</span>}
  </div>;
}

export function LabSavedPosts({ cards, collection }: { cards: CardPost[]; collection: CollectionCategory }) {
  const { tr } = useI18n();
  const { posts, ready, error } = useLabPosts();
  const [category, setCategory] = useState<LabCategory | "all">("all");
  const selected = useMemo(() => {
    const byKey = new Map(cards.map((card) => [`${card.author}/${card.asset}`, card]));
    return posts.map((post) => byKey.get(`${post.author}/${post.asset}`)).filter((post): post is CardPost => Boolean(post));
  }, [cards, posts]);
  const filtered = category === "all" ? selected : selected.filter((post) =>
    posts.some((saved) => saved.author === post.author && saved.asset === post.asset && saved.categories.includes(category)));
  const selectedKeys = new Set(selected.map((post) => `${post.author}/${post.asset}`));
  const counts = Object.fromEntries(labCategories.map((name) => [name,
    posts.filter((post) => selectedKeys.has(`${post.author}/${post.asset}`) && post.categories.includes(name)).length])) as Record<LabCategory, number>;

  return <section className="lab-saved" aria-labelledby="lab-saved-heading">
    <div className="lab-frames-heading">
      <div><p className="eyebrow">{collection === "kol" ? tr("KOL collection", "KOL 收藏") : tr("Design collection", "設計收藏")}</p><h2 id="lab-saved-heading">{tr("Saved posts", "已存貼文")}</h2></div>
      <div className="lab-saved-actions">
        <span aria-live="polite">{tr(`${selected.length} ${selected.length === 1 ? "post" : "posts"} shared across clients.`, `已跨裝置共用 ${selected.length} 則貼文。`)}</span>
        <Link href={categoryHref(collection)}>{tr("Browse posts ↗", "瀏覽貼文 ↗")}</Link>
      </div>
    </div>
    {ready && selected.length > 0 && <div className="lab-category-filters" aria-label={tr("Filter saved posts by Lab category", "依實驗室分類篩選已存貼文")}>
      <button type="button" className={category === "all" ? "selected" : ""} aria-pressed={category === "all"}
        onClick={() => setCategory("all")}>{tr("All", "全部")} <span>{selected.length}</span></button>
      {labCategories.map((name) => <button key={name} type="button" className={category === name ? "selected" : ""}
        aria-pressed={category === name} onClick={() => setCategory(name)}>{name} <span>{counts[name]}</span></button>)}
    </div>}
    {!ready ? <div className="empty-state" role="status">{error || tr("Loading saved posts…", "正在載入已存貼文…")}</div>
      : selected.length === 0 ? <div className="empty-state">{tr("Choose Add to Lab on any post to save it here.", "在任一貼文點選「加入實驗室」，即可存到這裡。")}</div>
      : filtered.length === 0 ? <div className="empty-state">{tr(`No posts in ${category} yet.`, `${category} 分類尚無貼文。`)}<button type="button" onClick={() => setCategory("all")}>{tr("Show all saved posts", "顯示所有已存貼文")}</button></div>
      : <PostGrid items={filtered} showAuthor renderExtra={(post) => <LabCategoryControls post={post} />} emptyMessage={tr("No saved posts yet.", "尚無已存貼文。")} />}
  </section>;
}
