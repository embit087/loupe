import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArchiveShell } from "@/components/archive-shell";
import { CustomStudyList } from "@/components/custom-study-list";
import { AddToStudyButton } from "@/components/add-to-study";
import { LabSavedPosts } from "@/components/lab-saved-posts";
import { card } from "@/lib/cards";
import { authors, formatDate, getCategoryPosts, getPost, posterHref } from "@/lib/atlas";
import { getLabStudiesForCategory, labSlideSummary, labStudyCounts, labStudyHref } from "@/lib/experiment-lab";
import { SelectableSection } from "@/components/selection-scope";
import { AssetName } from "@/components/asset-name";
import { serverTr } from "@/lib/i18n-server";

export const metadata: Metadata = {
  title: "Design Exp Lab · 2026 collection",
  description: "Saved Design posts and frame studies from the 2026 collection.",
};

export default async function ExperimentLabPage() {
  const tr = await serverTr();
  const studies = getLabStudiesForCategory("design");
  return (
    <ArchiveShell authors={authors} selectedAuthor={null} labView filter="all" counts={labStudyCounts()}>
      <div className="asset-page lab-page">
        <nav className="breadcrumbs" aria-label={tr("Breadcrumbs", "導覽路徑")}><Link href="/category/design">{tr("Design creators", "設計創作者")}</Link><span>/</span><span>{tr("Exp Lab", "實驗室")}</span></nav>
        <div className="asset-heading">
          <div><p className="eyebrow">{tr("Selected Design work / 2026", "精選設計作品／2026")}</p><h1>{tr("Design Exp Lab", "設計實驗室")}</h1></div>
        </div>
        <p className="lab-intro">{tr("Save Design posts for closer study. Each study breaks a saved post into slides: extracted frames and timing for videos, full-resolution items for carousels and photos.", "將設計貼文存入實驗室深入研究。每項研究會把貼文拆成畫面：影片包含擷取畫面與時間，圖集和照片則保留完整解析度素材。")}{" "}<Link href="/category/design">{tr("Browse posts to add to Lab ↗", "瀏覽貼文並加入實驗室 ↗")}</Link></p>
        <CustomStudyList category="design" />
        <div className="lab-frames-heading lab-featured-heading"><div><p className="eyebrow">{tr("Frame analysis", "畫面分析")}</p><h2>{tr(`${studies.length} studies`, `${studies.length} 項研究`)}</h2></div><p>{tr("Open a study to view its source asset and inspect its slides.", "開啟研究以查看來源素材和各個畫面。")}</p></div>
        <SelectableSection name="studies:design" noun="study" nouns="studies" ids={studies.map((study) => `${study.author}/${study.asset}`)}>
        <div className="lab-study-grid">
          {studies.map((study, index) => {
            const post = getPost(study.author, study.asset);
            return (
              <article key={`${study.author}/${study.asset}`} className="lab-study-card-wrap" data-select-id={`${study.author}/${study.asset}`}>
              <Link className="lab-study-card" href={labStudyHref(study)} prefetch={false}>
                <div className="lab-study-poster">
                  {post && <Image src={posterHref(post)} alt={tr(`Poster for ${study.asset}`, `${study.asset} 的預覽圖`)} width={360} height={640} sizes="(max-width: 760px) 100vw, 240px" unoptimized />}
                  <span>{tr("Open study ↗", "開啟研究 ↗")}</span>
                </div>
                <div className="lab-study-info">
                  <span className="eyebrow">{tr("Study", "研究")} {String(index + 1).padStart(2, "0")} · {post ? formatDate(post.date) : tr("Collected asset", "收藏素材")}</span>
                  <strong>@{study.author}</strong>
                  <AssetName asset={study.asset} />
                  <span>{labSlideSummary(study)}</span>
                </div>
              </Link>
              <AddToStudyButton className="lab-study-add-to-study" category="design" author={study.author} asset={study.asset} kind="post" explanation={tr("Choose a study to attach this source post, or create a new one.", "選擇研究以加入這則來源貼文，或建立新研究。")} />
              </article>
            );
          })}
        </div>
        </SelectableSection>
        <LabSavedPosts collection="design" cards={getCategoryPosts("design").map(card)} />
      </div>
    </ArchiveShell>
  );
}
