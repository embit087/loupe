import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveShell } from "@/components/archive-shell";
import { serverTr } from "@/lib/i18n-server";
import {
  authors,
  getAuthor,
  getAuthorPosts,
  getCategoryAuthors,
  getCategoryPosts,
  parseCategory,
  parseFilter,
  posterHref,
  type Author,
  type CollectionCategory,
  type MediaFilter,
  type Post,
} from "@/lib/atlas";

export const metadata: Metadata = {
  title: "Focused profiles · 2026 collection",
  description: "Why Demo Studio and @demo.trail are the starting profiles for the Design and KOL collections.",
};

async function FocusCard({
  author,
  post,
  category,
  relatedCount,
  reasons,
  study,
}: {
  author: Author;
  post?: Post;
  category: CollectionCategory;
  relatedCount: number;
  reasons: string[];
  study: string;
}) {
  const tr = await serverTr();
  return <article className={`focus-card focus-card-${category}`}>
    <div className="focus-card-media">
      {post && <Image src={posterHref(post)} alt={tr(`Collected post by ${author.name}`, `${author.name} 的收藏貼文`)} width={400} height={640} sizes="(max-width: 760px) 100vw, 28vw" unoptimized />}
      <span>{category === "design" ? "01 / Design" : "02 / KOL"}</span>
    </div>
    <div className="focus-card-content">
      <p className="eyebrow">{category === "design" ? tr("Design starting profile", "設計收藏起點") : tr("KOL starting profile", "KOL 收藏起點")}</p>
      <h2>{author.name}</h2>
      <p className="focus-handle">@{author.username}</p>
      <div className="focus-card-stats">
        <span><strong>{author.count}</strong> {tr("collected 2026 posts", "則 2026 年收藏貼文")}</span>
        <span><strong>{relatedCount}</strong> {tr("related accounts in this collection", "個相關帳號")}</span>
      </div>
      <h3>{tr("Why this account is in focus", "選入這個帳號的原因")}</h3>
      <ol className="focus-reasons">
        {reasons.map((reason) => <li key={reason}>{reason}</li>)}
      </ol>
      <div className="focus-card-links">
        <Link href={`/${author.username}`}>{tr("Explore posts ↗", "瀏覽貼文 ↗")}</Link>
        <Link href={study}>{tr("Open video study ↗", "開啟影片研究 ↗")}</Link>
      </div>
    </div>
  </article>;
}

export default async function FocusedProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[]; type?: string | string[] }>;
}) {
  const tr = await serverTr();
  const { category, type } = await searchParams;
  const activeCategory = parseCategory(category);
  const filter: MediaFilter = parseFilter(type);
  const design = getAuthor("demo.studio");
  const kol = getAuthor("demo.trail");
  if (!design || !kol) notFound();

  const categoryPosts = getCategoryPosts(activeCategory);
  const counts = {
    all: categoryPosts.length,
    video: categoryPosts.filter((post) => post.kind === "video").length,
    post: categoryPosts.filter((post) => post.kind !== "video").length,
  };

  return <ArchiveShell authors={authors} selectedAuthor={null} category={activeCategory} focusedView filter={filter} counts={counts}>
    <div className="asset-page focus-page">
      <div className="focus-heading">
        <p className="eyebrow">{tr("Two directions / two starting profiles", "兩個方向／兩位起點創作者")}</p>
        <h1>{tr("Focused profiles", "精選創作者")}</h1>
        <p>{tr("Demo Studio and @demo.trail are the starting points for two separate 2026 social collections. Each account gives its collection a clear subject, a path to adjacent creators, and material for closer post studies.", "Demo Studio 與 @demo.trail 分別是兩個 2026 年社群收藏的起點。兩位創作者讓收藏有清楚的主題，也提供探索相關創作者與深入研究貼文的素材。")}</p>
      </div>

      <div className="focus-cards">
        <FocusCard
          author={design}
          post={getAuthorPosts(design.username)[0]}
          category="design"
          relatedCount={getCategoryAuthors("design").length - 1}
          reasons={[
            tr("Its six locally saved motion posts started the Design archive.", "其六則已儲存的動態貼文是設計收藏的起點。"),
            tr("The collected videos show poster collage, expressive type, identity work, and campaign imagery that can be inspected frame by frame.", "收藏影片涵蓋海報拼貼、表現性字體、識別設計與活動視覺，可逐格檢視。"),
            tr("Its related profiles were the starting point for finding the other Design accounts.", "其相關創作者也是探索其他設計帳號的起點。"),
          ]}
          study="/exp-lab/demo.studio/20260517_DEMO00001.mp4"
        />
        <FocusCard
          author={kol}
          post={getAuthorPosts(kol.username)[0]}
          category="kol"
          relatedCount={getCategoryAuthors("kol").length - 1}
          reasons={[
            tr("This account seeded the KOL collection; three adjacent accounts were selected from its related profiles.", "這個帳號是 KOL 收藏的起點；另有三個相關帳號從其推薦資料中選出。"),
            tr("The selection centers on outdoor clothing, equipment, hiking, and gear commentary.", "挑選重點是戶外服裝、裝備、健行及產品評論。"),
            tr("One collected video already has a timed scene summary, reviewed transcript, on-screen text, and grouped product visuals in Exp Lab.", "其中一則影片已在實驗室整理時間軸場景摘要、已校對逐字稿、畫面文字與產品畫面。"),
          ]}
          study="/exp-lab/demo.trail/DEMO00101.mp4"
        />
      </div>

      <section className="focus-discovery" aria-labelledby="focus-discovery-title">
        <div className="focus-discovery-heading">
          <p className="eyebrow">{tr("Collection method / creator discovery", "收藏方法／創作者探索")}</p>
          <h2 id="focus-discovery-title">{tr("How we found similar creators", "如何找到相似創作者")}</h2>
          <p>{tr("Both collections began with one focused profile and Instagram's related-profile suggestions. The two directions used those suggestions differently.", "兩個收藏都從一位精選創作者及 Instagram 的相關創作者建議開始，但使用建議的方式不同。")}</p>
        </div>
        <div className="focus-discovery-grid">
          <article className="focus-discovery-path">
            <span className="focus-discovery-path-label">01 / Design · @demo.studio</span>
            <ol>
              <li><strong>{tr("Start with Demo Studio.", "從 Demo Studio 開始。")}</strong> {tr("Its public profile supplied the original six Design motion posts.", "其公開個人檔案提供最初六則設計動態貼文。")}</li>
              <li><strong>{tr("Ask for related profiles.", "取得相關創作者。")}</strong> {tr("The saved Instagram Looter", "儲存的 Instagram Looter")} <code>/related-profiles</code> {tr("response for the account produced five suggested profiles.", "回應提供五位建議創作者。")}</li>
              <li><strong>{tr("Build the archive.", "建立收藏。")}</strong> {tr("All five suggestions became Design candidates. We fetched each account's feed and kept its 2026 posts for this collection.", "五位建議創作者都成為設計收藏候選；擷取各帳號的貼文，並保留其 2026 年貼文。")}</li>
            </ol>
            <p>{tr("Selection rule: include the saved suggestion set; visual similarity was not independently checked.", "選取原則：納入已儲存的建議名單；尚未獨立驗證視覺相似度。")}</p>
          </article>
          <article className="focus-discovery-path">
            <span className="focus-discovery-path-label">02 / KOL · @demo.trail</span>
            <ol>
              <li><strong>{tr("Start with Demo Trail.", "從 Demo Trail 開始。")}</strong> {tr("This account was the seed for the outdoor KOL direction.", "這個帳號是戶外 KOL 收藏的起點。")}</li>
              <li><strong>{tr("Ask for related profiles.", "取得相關創作者。")}</strong> {tr("We saved the", "已儲存 @demo.trail 的")} <code>/related-profiles</code> {tr("response for @demo.trail and selected three suggested accounts with overlap in outdoor clothing, equipment, hiking, and gear commentary.", "回應，並選出三個與戶外服裝、裝備、健行及產品評論相關的帳號。")}</li>
              <li><strong>{tr("Build the archive.", "建立收藏。")}</strong> {tr("We saved one feed response for each of the four accounts, including Demo Trail, and kept their 2026 posts.", "包含 Demo Trail 在內，每個帳號各儲存一份貼文回應，並保留其 2026 年貼文。")}</li>
            </ol>
            <p>{tr("Selection rule: topic overlap within the suggested accounts, rather than a visual similarity score.", "選取原則：依建議帳號的主題重疊度挑選，而非視覺相似度分數。")}</p>
          </article>
        </div>
        <div className="focus-discovery-sources">{tr("Read the", "參閱")} <Link href="/sources/instagram-looter">{tr("related-profile and feed source notes ↗", "相關創作者與貼文來源說明 ↗")}</Link> {tr("and", "及")} <Link href="/sources/profile-page">{tr("Demo Studio profile capture notes ↗", "Demo Studio 個人檔案擷取說明 ↗")}</Link>.</div>
      </section>

    </div>
  </ArchiveShell>;
}
