import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveShell } from "@/components/archive-shell";
import { SocialcrawlMonitor } from "@/components/socialcrawl-monitor";
import { authors, posts } from "@/lib/atlas";
import { dataSources, getDataSource, localizeDataSource } from "@/lib/data-sources";
import { serverTr } from "@/lib/i18n-server";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return dataSources.map((source) => ({ slug: source.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tr = await serverTr();
  const { slug } = await params;
  const source = getDataSource(slug);
  return source ? { title: `${source.name} · ${tr("Data sources", "資料來源")}`, description: localizeDataSource(source, tr("en", "zh-Hant") as "en" | "zh-Hant").summary } : { title: tr("Data source not found", "找不到資料來源") };
}

function Section({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return <section className="source-section">
    <div className="lab-frames-heading"><div><p className="eyebrow">{label}</p><h2>{title}</h2></div></div>
    {children}
  </section>;
}

export default async function DataSourcePage({ params }: Props) {
  const tr = await serverTr();
  const { slug } = await params;
  const original = getDataSource(slug);
  if (!original) notFound();
  const source = localizeDataSource(original, tr("en", "zh-Hant") as "en" | "zh-Hant");
  const counts = { all: posts.length, video: 0, post: 0 };

  return <ArchiveShell authors={authors} selectedAuthor={null} sourcesView={source.slug} filter="all" counts={counts}>
    <article className="asset-page sources-page">
      <nav className="breadcrumbs" aria-label={tr("Breadcrumbs", "導覽路徑")}><Link href="/sources">{tr("Data sources", "資料來源")}</Link><span>/</span><span>{source.name}</span></nav>
      <div className="asset-heading">
        <div><p className="eyebrow">{source.provider} / {source.status === "planned" ? tr("planned", "規劃中") : tr("in use", "使用中")}</p><h1>{source.name}</h1></div>
        <span className={`source-status ${source.status === "planned" ? "planned" : "in-use"}`}>{source.status === "planned" ? tr("planned", "規劃中") : tr("in use", "使用中")}</span>
      </div>
      <p className="lab-intro">{source.summary}</p>

      {source.slug === "socialcrawl" && <SocialcrawlMonitor />}

      {source.usedFor.length > 0 && <Section label={tr("Coverage", "涵蓋範圍")} title={tr("What it fetched", "擷取內容")}>
        <ul className="source-list">{source.usedFor.map((item) => <li key={item}>{item}</li>)}</ul>
      </Section>}

      {source.endpoints.length > 0 && <Section label={tr("Endpoints", "端點")} title={tr(`${source.endpoints.length} requests`, `${source.endpoints.length} 種請求`)}>
        <div className="kol-metrics-scroll source-table"><table><thead><tr><th>{tr("Request", "請求")}</th><th>{tr("Parameters", "參數")}</th><th>{tr("Returns", "回傳內容")}</th></tr></thead><tbody>
          {source.endpoints.map((endpoint) => <tr key={endpoint.path}><th><code>{endpoint.method} {endpoint.path}</code></th><td>{endpoint.params}</td><td>{endpoint.returns}</td></tr>)}
        </tbody></table></div>
      </Section>}

      {source.files.length > 0 && <Section label={tr("Saved files", "已儲存檔案")} title={tr("Where the raw data lives", "原始資料位置")}>
        <dl className="source-files">{source.files.map((file) => <div key={file.path}><dt><code>{file.path}</code></dt><dd>{file.holds}</dd></div>)}</dl>
      </Section>}

      {source.policy.length > 0 && <Section label={tr("Policy", "規則")} title={tr("Request rules", "請求規則")}>
        <ul className="source-list">{source.policy.map((item) => <li key={item}>{item}</li>)}</ul>
      </Section>}

      {source.steps.length > 0 && <Section label={source.status === "planned" ? tr("To do", "待辦") : tr("Tutorial", "操作步驟")} title={source.status === "planned" ? tr("Before first use", "首次使用前") : tr("Fetch and rebuild", "擷取並重建")}>
        <ol className="source-steps">{source.steps.map((item) => <li key={item}>{item}</li>)}</ol>
      </Section>}

      {source.caveats.length > 0 && <Section label={tr("Caveats", "注意事項")} title={tr("Known limits", "已知限制")}>
        <ul className="source-list">{source.caveats.map((item) => <li key={item}>{item}</li>)}</ul>
      </Section>}
    </article>
  </ArchiveShell>;
}
