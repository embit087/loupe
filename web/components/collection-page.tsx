import { ArchiveShell } from "@/components/archive-shell";
import { FollowButton } from "@/components/follow-button";
import { CollectionLayout } from "@/components/collection-layout";
import { PostGrid } from "@/components/post-grid";
import { card } from "@/lib/cards";
import { serverTr } from "@/lib/i18n-server";
import {
  authors,
  filterPosts,
  getAuthorPosts,
  getCategoryAuthors,
  getCategoryPosts,
  type Author,
  type CollectionCategory,
  type MediaFilter,
} from "@/lib/atlas";

export async function CollectionPage({ author, category = "design", filter }: { author?: Author; category?: CollectionCategory; filter: MediaFilter }) {
  const tr = await serverTr();
  const activeCategory = author?.collection ?? category;
  const categoryAuthors = getCategoryAuthors(activeCategory);
  const source = author ? getAuthorPosts(author.username) : getCategoryPosts(activeCategory);
  const selected = filterPosts(source, filter);
  const counts = {
    all: source.length,
    video: source.filter((post) => post.kind === "video").length,
    post: source.filter((post) => post.kind !== "video").length,
  };
  const cards = selected.map(card);
  const isSeed = author?.username === "demo.studio";

  return (
    <ArchiveShell authors={authors} selectedAuthor={author?.username || null} category={activeCategory} filter={filter} counts={counts}>
      <CollectionLayout
        title={author ? author.name : activeCategory === "kol" ? tr("KOL creators", "KOL 創作者") : tr("Design creators", "設計創作者")}
        context={
          <>
            <div className="collection-heading">
              <p className="eyebrow">{author ? tr(`${activeCategory} creator / 2026`, `${activeCategory} 創作者／2026`) : tr(`${activeCategory} archive / 2026`, `${activeCategory} 收藏／2026`)}</p>
              <h1>{author ? author.name : activeCategory === "kol" ? tr("KOL creators", "KOL 創作者") : tr("Design creators", "設計創作者")}</h1>
              <div className="collection-summary">
                <strong>{author ? `@${author.username}` : tr(`${categoryAuthors.length} collected creators`, `已收藏 ${categoryAuthors.length} 位創作者`)}</strong>
                <span>{tr(`${source.length} collected 2026 posts · ${selected.length} shown`, `收藏 ${source.length} 則 2026 年貼文 · 顯示 ${selected.length} 則`)}</span>
                {author && <FollowButton key={author.username} author={author.username} />}
              </div>
            </div>
            <div className="collection-intro">
              <strong>{isSeed ? tr("Graphic work in motion.", "動態中的平面設計。") : author ? tr(`Collected posts by @${author.username}.`, `@${author.username} 的收藏貼文。`) : activeCategory === "kol" ? tr("Outdoor style and gear creators.", "戶外風格與裝備創作者。") : tr("A single stream across the design collection.", "整合設計收藏的貼文列表。")}</strong>
              <p>{isSeed ? tr("Layered poster collage, expressive type, restrained identity systems, and campaign imagery. All 6 pieces are local videos from 2026.", "層疊海報拼貼、鮮明字體、簡潔識別系統與形象視覺。6 件作品皆為本機保存的 2026 年影片。") : author ? tr("Posts outside 2026 are omitted. The saved source response remains in the local archive.", "此處不顯示 2026 年以外的貼文；來源回應仍保存在本機收藏中。") : activeCategory === "kol" ? tr("Instagram suggestions for @demo.trail were reviewed for outdoor clothing, equipment, hiking and gear overlap. Posts are sorted newest first.", "已依戶外服飾、裝備、健行與用品相關性檢視 @demo.trail 的 Instagram 建議帳號。貼文依時間由新到舊排序。") : tr("Posts are sorted newest first. Use the sidebar to show videos or image posts, open an author archive, or follow an asset into its own route.", "貼文依時間由新到舊排序。可用側欄篩選影片或圖片貼文、開啟創作者收藏，或進入各素材頁。")}</p>
            </div>
          </>
        }
      >
        <div className="collection-posts">
          <PostGrid key={`${author?.username || "all"}:${filter}`} items={cards} showAuthor={!author} filter={filter} collapseDisliked={Boolean(author)} viewToggleCategory={activeCategory} />
        </div>
        <footer className="collection-footer">{tr("Select a preview or View post to open its asset page · Videos play in the grid view", "選取預覽或點選「查看貼文」可開啟素材頁 · 影片可在網格檢視中播放")}</footer>
      </CollectionLayout>
    </ArchiveShell>
  );
}
