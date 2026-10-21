import type { Metadata } from "next";
import Link from "next/link";
import { ArchiveShell } from "@/components/archive-shell";
import { authors, posts } from "@/lib/atlas";
import { dataSources, localizeDataSource, sourceHref } from "@/lib/data-sources";
import { serverTr } from "@/lib/i18n-server";

export const metadata: Metadata = {
  title: "Data sources · 2026 collection",
  description: "How the collection's posts were fetched: providers, endpoints, saved files and rebuild steps.",
};

export default async function SourcesPage() {
  const tr = await serverTr();
  const sources = dataSources.map((source) => localizeDataSource(source, tr("en", "zh-Hant") as "en" | "zh-Hant"));
  const counts = { all: posts.length, video: 0, post: 0 };
  return <ArchiveShell authors={authors} selectedAuthor={null} sourcesView="overview" filter="all" counts={counts}>
    <div className="asset-page sources-page">
      <nav className="breadcrumbs" aria-label={tr("Breadcrumbs", "導覽路徑")}><span>{tr("Data sources", "資料來源")}</span></nav>
      <div className="asset-heading"><div><p className="eyebrow">{tr("Methods / data fetching", "方法／資料擷取")}</p><h1>{tr("Data sources", "資料來源")}</h1></div></div>
      <p className="lab-intro">{tr("Where every post in the collection came from, how it was requested, and where the raw responses are kept. What the posts show, and what we learn from them, belongs in Exp Lab.", "此處記錄收藏中每則貼文的來源、擷取方式及原始回應的保存位置。貼文內容與研究發現則整理在實驗室。")}</p>
      <div className="lab-frames-heading sources-heading"><div><p className="eyebrow">{tr("Methods", "方法")}</p><h2>{sources.length} {tr("sources", "個來源")}</h2></div><p>{tr("Paths are relative to the sibling archive (COLLECTIONS_SOURCE_ROOT, default ../sample-archive).", "路徑以相鄰的封存目錄為準（COLLECTIONS_SOURCE_ROOT，預設 ../sample-archive）。")}</p></div>
      <div className="sources-grid">
        {sources.map((source) => (
          <Link key={source.slug} href={sourceHref(source)} prefetch={false} className={`source-card${source.status === "planned" ? " planned" : ""}`}>
            <span className="source-card-top"><span className="source-card-icon" aria-hidden="true">{source.icon}</span><span className={`source-status ${source.status === "planned" ? "planned" : "in-use"}`}>{source.status === "planned" ? tr("planned", "規劃中") : tr("in use", "使用中")}</span></span>
            <strong>{source.name}</strong>
            <span className="source-provider">{source.provider}</span>
            <p>{source.summary}</p>
            <span className="source-card-meta">{[source.endpoints.length && tr(`${source.endpoints.length} endpoints`, `${source.endpoints.length} 個端點`), source.files.length && tr(`${source.files.length} file groups`, `${source.files.length} 組檔案`)].filter(Boolean).join(" · ") || tr("Not documented yet", "尚未記錄")}</span>
          </Link>
        ))}
      </div>
      <section className="source-section">
        <div className="lab-frames-heading"><div><p className="eyebrow">{tr("Adding a source", "新增來源")}</p><h2>{tr("Document before you fetch", "擷取前先記錄")}</h2></div></div>
        <ol className="source-steps">
          <li>{tr("Add an entry to", "在")} <code>lib/data-sources.ts</code> {tr("with the provider, endpoints and quota.", "新增供應商、端點與額度紀錄。")}</li>
          <li>{tr("Save each raw response with its request metadata (time, endpoint, query, HTTP status, rate headers) before parsing it.", "解析前先保存每筆原始回應及請求中繼資料（時間、端點、查詢、HTTP 狀態與速率限制標頭）。")}</li>
          <li>{tr("Record the run in a manifest: which accounts, why they were chosen, and the request policy.", "在清單中記錄每次執行的帳號、挑選原因與請求規則。")}</li>
          <li>{tr("Download any media that must outlast signed URLs, then rebuild the collection index.", "下載需要長期保存的媒體，再重新建立收藏索引。")}</li>
        </ol>
      </section>
    </div>
  </ArchiveShell>;
}
