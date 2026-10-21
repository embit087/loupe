import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArchiveShell } from "@/components/archive-shell";
import { CustomStudyList } from "@/components/custom-study-list";
import { AddToStudyButton } from "@/components/add-to-study";
import { LabSavedPosts } from "@/components/lab-saved-posts";
import { card } from "@/lib/cards";
import { authors, categoryHref, formatDate, getCategoryPosts, getPost, posterHref } from "@/lib/atlas";
import { getLabStudiesForCategory, labSlideSummary, labStudyHref } from "@/lib/experiment-lab";
import { SelectableSection } from "@/components/selection-scope";
import { AssetName } from "@/components/asset-name";
import { serverTr } from "@/lib/i18n-server";

export const metadata: Metadata = {
  title: "KOL Exp Lab · 2026 collection",
  description: "Saved KOL posts from the 2026 collection, separate from Design frame studies.",
};

export default async function KolExperimentLabPage() {
  const tr = await serverTr();
  const posts = getCategoryPosts("kol");
  const studies = getLabStudiesForCategory("kol");
  return <ArchiveShell authors={authors} selectedAuthor={null} category="kol" labView filter="all" counts={{ all: posts.length, video: posts.filter((post) => post.kind === "video").length, post: posts.filter((post) => post.kind !== "video").length }}>
    <div className="asset-page lab-page">
      <nav className="breadcrumbs" aria-label={tr("Breadcrumbs", "導覽路徑")}><Link href={categoryHref("kol")}>{tr("KOL creators", "KOL 創作者")}</Link><span>/</span><span>{tr("Exp Lab", "實驗室")}</span></nav>
      <div className="asset-heading"><div><p className="eyebrow">{tr("KOL collection / 2026", "KOL 收藏／2026")}</p><h1>{tr("KOL Exp Lab", "KOL 實驗室")}</h1></div></div>
      <p className="lab-intro">{tr("Save KOL posts to study them here. Your Design saved posts and frame studies are in the", "將 KOL 貼文存到這裡研究。設計貼文與畫面研究則位於")}{" "}<Link href="/exp-lab">{tr("Design Exp Lab ↗", "設計實驗室 ↗")}</Link></p>
      <CustomStudyList category="kol" />
      {studies.length > 0 && <>
        <div className="lab-frames-heading lab-featured-heading"><div><p className="eyebrow">{tr("KOL video analysis", "KOL 影片分析")}</p><h2>{tr(`${studies.length} ${studies.length === 1 ? "study" : "studies"}`, `${studies.length} 項研究`)}</h2></div><p>{tr("Open a study for deduplicated visuals, on-screen text, and a timed narration summary.", "開啟研究以查看去重後的畫面、畫面文字和附時間的旁白摘要。")}</p></div>
        <SelectableSection name="studies:kol" noun="study" nouns="studies" ids={studies.map((study) => `${study.author}/${study.asset}`)}>
        <div className="lab-study-grid">
          {studies.map((study, index) => {
            const post = getPost(study.author, study.asset);
            return <article key={`${study.author}/${study.asset}`} className="lab-study-card-wrap" data-select-id={`${study.author}/${study.asset}`}><Link className="lab-study-card" href={labStudyHref(study)} prefetch={false}>
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
            </Link><AddToStudyButton className="lab-study-add-to-study" category="kol" author={study.author} asset={study.asset} kind="post" explanation={tr("Choose a study to attach this source post, or create a new one.", "選擇研究以加入這則來源貼文，或建立新研究。")} /></article>;
          })}
        </div>
        </SelectableSection>
      </>}
      <LabSavedPosts collection="kol" cards={posts.map(card)} />
    </div>
  </ArchiveShell>;
}
