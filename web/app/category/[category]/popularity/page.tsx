import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveShell } from "@/components/archive-shell";
import { KolMetrics } from "@/components/kol-metrics";
import { authors, categoryHref, getCategoryAuthors, getCategoryPosts } from "@/lib/atlas";
import { serverTr } from "@/lib/i18n-server";

type Props = { params: Promise<{ category: string }> };

// Follower counts were captured for the KOL collection only.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  return { title: category === "kol" ? "KOL popularity · 2026 collection" : "Popularity not found" };
}

export default async function PopularityPage({ params }: Props) {
  const tr = await serverTr();
  const { category } = await params;
  if (category !== "kol") notFound();
  const posts = getCategoryPosts("kol");
  const counts = { all: posts.length, video: posts.filter((post) => post.kind === "video").length, post: posts.filter((post) => post.kind !== "video").length };

  return <ArchiveShell authors={authors} selectedAuthor={null} category="kol" popularityView filter="all" counts={counts}>
    <div className="asset-page popularity-page">
      <nav className="breadcrumbs" aria-label={tr("Breadcrumbs", "導覽路徑")}><Link href={categoryHref("kol")}>{tr("KOL creators", "KOL 創作者")}</Link><span>/</span><span>{tr("Popularity", "熱門程度")}</span></nav>
      <div className="asset-heading"><div><p className="eyebrow">{tr("KOL collection / 2026", "KOL 收藏／2026")}</p><h1>{tr("Popularity", "熱門程度")}</h1></div></div>
      <p className="lab-intro">{tr("Compare the collected KOL creators by audience and engagement, ordered by follower count.", "依追蹤者人數排序，比較已收藏 KOL 創作者的受眾與互動表現。")} <Link href={categoryHref("kol")}>{tr("Browse their posts ↗", "瀏覽其貼文 ↗")}</Link></p>
      <KolMetrics authors={getCategoryAuthors("kol")} />
    </div>
  </ArchiveShell>;
}
