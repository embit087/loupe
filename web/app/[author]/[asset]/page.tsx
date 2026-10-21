import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveShell } from "@/components/archive-shell";
import { AssetViewer } from "@/components/asset-viewer";
import { AssetReactions } from "@/components/reactions";
import { LabToggle } from "@/components/lab-posts";
import { AddToStudyButton } from "@/components/add-to-study";
import { FollowButton } from "@/components/follow-button";
import { AssetName } from "@/components/asset-name";
import { assetTitle } from "@/lib/asset-label";
import {
  authorHref,
  authors,
  categoryHref,
  formatCount,
  formatDate,
  getAuthor,
  getAuthorPosts,
  getPost,
  postHref,
  posterHref,
  videoHref,
} from "@/lib/atlas";
import { getLabStudy, labSlideSummary, labStudyHref } from "@/lib/experiment-lab";
import { serverTr } from "@/lib/i18n-server";

type Props = { params: Promise<{ author: string; asset: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { author, asset } = await params;
  const post = getPost(author, asset);
  if (!post) return { title: "Asset not found" };
  return {
    title: `${assetTitle({ asset: post.asset, caption: post.caption, authorName: getAuthor(author)?.name ?? author })} · @${post.author}`,
    description: post.caption ? post.caption.slice(0, 160) : `${post.kind} by @${post.author}, ${formatDate(post.date)}`,
    openGraph: { images: [{ url: posterHref(post) }] },
  };
}

export default async function AssetPage({ params }: Props) {
  const tr = await serverTr();
  const { author, asset } = await params;
  const profile = getAuthor(author);
  const post = getPost(author, asset);
  if (!profile || !post) notFound();
  const title = assetTitle({ asset: post.asset, caption: post.caption, authorName: profile.name });
  const labStudy = getLabStudy(author, asset);

  const authorPosts = getAuthorPosts(author);
  const index = authorPosts.findIndex((item) => item.asset === asset);
  const previous = index > 0 ? authorPosts[index - 1] : null;
  const next = index < authorPosts.length - 1 ? authorPosts[index + 1] : null;
  const counts = {
    all: authorPosts.length,
    video: authorPosts.filter((item) => item.kind === "video").length,
    post: authorPosts.filter((item) => item.kind !== "video").length,
  };
  const type = post.kind === "carousel" ? tr(`Carousel · ${post.carouselCount} slides`, `輪播 · ${post.carouselCount} 張`) : post.kind === "video" ? tr("Video", "影片") : tr("Photo", "照片");

  return (
    <ArchiveShell authors={authors} selectedAuthor={author} filter="all" counts={counts}>
      <article className="asset-page">
        <nav className="breadcrumbs" aria-label={tr("Breadcrumbs", "導覽路徑")}>
          <Link href={categoryHref(profile.collection)}>{profile.collection === "kol" ? tr("KOL creators", "KOL 創作者") : tr("Design creators", "設計創作者")}</Link><span>/</span><Link href={authorHref(author)}>@{author}</Link><span>/</span><span>{title}</span>
        </nav>
        <div className="asset-heading">
          <div><p className="eyebrow">{type} / {formatDate(post.date)}</p><h1>{title}</h1><AssetName asset={post.asset} className="asset-name-heading" /></div>
          <div className="asset-heading-actions"><Link href={authorHref(author)} className="author-pill">{profile.name}<span>@{author}</span></Link><FollowButton key={author} author={author} /></div>
        </div>
        <div className="asset-layout">
          <AssetViewer kind={post.kind} poster={posterHref(post)} video={post.kind === "video" ? videoHref(post) : ""} source={post.permalink} alt={`${type} by ${profile.name}`} />
          <aside className="asset-details">
            <div className="detail-section study-asset-action"><span className="detail-label">{tr("Save", "收藏")}</span><LabToggle collection={profile.collection} author={author} asset={asset} favorite /></div>
            <div className="detail-section study-asset-action"><span className="detail-label">{post.kind === "video" ? tr("Source video", "原始影片") : tr("Cover image", "封面圖片")}</span><AddToStudyButton category={profile.collection} author={author} asset={asset} kind={post.kind === "video" ? "video" : "poster"} /></div>
            {post.kind === "video" && <div className="detail-section study-asset-action"><span className="detail-label">{tr("Cover image", "封面圖片")}</span><AddToStudyButton category={profile.collection} author={author} asset={asset} kind="poster" /></div>}
            {post.kind === "video" && <div className="detail-section study-asset-action"><span className="detail-label">{tr("Audio track", "音訊")}</span><AddToStudyButton category={profile.collection} author={author} asset={asset} kind="audio" /></div>}
            <AssetReactions author={author} asset={asset} />
            <div className="detail-section study-asset-action"><span className="detail-label">{tr("Add post to a study", "將貼文加入研究")}</span><AddToStudyButton category={profile.collection} author={author} asset={asset} kind="post" /></div>
            <div className="detail-section"><span className="detail-label">{tr("Asset", "素材")}</span><strong>{type}</strong><p>{tr("Collected from", "收藏自")} @{author} · {formatDate(post.date)}</p></div>
            {post.caption && <div className="detail-section"><div className="study-asset-action"><span className="detail-label">{tr("Caption", "貼文文字")}</span><AddToStudyButton category={profile.collection} author={author} asset={asset} kind="caption" /></div><p className="asset-caption">{post.caption}</p></div>}
            {(post.likeCount !== null || post.commentCount !== null || post.countsHidden || post.playCount != null || post.shareCount != null) && <div className="detail-section"><span className="detail-label">{tr("Instagram at collection", "收藏時的 Instagram 數據")}</span><p>{[
              post.countsHidden ? tr("Likes and views hidden in Instagram feed", "Instagram 未公開喜歡數與觀看數") : null,
              !post.countsHidden && post.likeCount !== null ? tr(`${formatCount(post.likeCount)} likes`, `${formatCount(post.likeCount)} 個喜歡`) : null,
              !post.countsHidden && post.kind === "video" && post.playCount != null ? tr(`${formatCount(post.playCount)} plays`, `${formatCount(post.playCount)} 次播放`) : null,
              post.commentCount !== null ? tr(`${formatCount(post.commentCount)} comments`, `${formatCount(post.commentCount)} 則留言`) : null,
              post.shareCount != null ? tr(`${formatCount(post.shareCount)} shares`, `${formatCount(post.shareCount)} 次分享`) : null,
            ].filter(Boolean).join(" · ")}</p>{post.countsSource && <p className="detail-source">{tr("From", "資料來源")} {post.countsSource}, {formatDate(post.countsAt?.replaceAll("-", "") ?? "")}{post.source && post.source !== post.countsSource ? tr(` · first collected by ${post.source}`, ` · 首次由 ${post.source} 收藏`) : ""}</p>}</div>}
            {(post.durationSeconds || post.pinned || post.coauthors?.length || post.language) && <div className="detail-section"><span className="detail-label">{tr("Post details", "貼文資訊")}</span><p>{[
              post.durationSeconds ? tr(`${Math.floor(post.durationSeconds / 60)}:${String(Math.round(post.durationSeconds % 60)).padStart(2, "0")} long`, `長度 ${Math.floor(post.durationSeconds / 60)}:${String(Math.round(post.durationSeconds % 60)).padStart(2, "0")}`) : null,
              post.pinned ? tr("Pinned to the profile", "已置頂於個人檔案") : null,
              post.language ? tr(`Caption language: ${post.language}`, `貼文語言：${post.language}`) : null,
            ].filter(Boolean).join(" · ")}</p>{post.coauthors?.length ? <p>{tr("Collaboration with", "共同創作")} {post.coauthors.map((name, index) => <span key={name}>{index ? ", " : ""}<a href={`https://www.instagram.com/${name}/`} target="_blank" rel="noopener noreferrer">@{name}</a></span>)}</p> : null}</div>}
            {post.kind === "carousel" && <div className="detail-section"><span className="detail-label">{tr("Carousel", "輪播")}</span><p>{labStudy ? tr(`All ${post.carouselCount} slides are saved in its Exp Lab study.`, `全部 ${post.carouselCount} 張圖片已存入實驗室研究。`) : tr(`The local archive contains the cover preview. The original post has ${post.carouselCount} slides.`, `本機封存包含封面預覽；原始貼文共有 ${post.carouselCount} 張圖片。`)}</p></div>}
            {labStudy && <Link className="source-link" href={labStudyHref(labStudy)} prefetch={false}>{tr("Open Exp Lab study", "開啟實驗室研究")} · {labSlideSummary(labStudy)} ↗</Link>}
            {post.permalink && <a className="source-link" href={post.permalink} target="_blank" rel="noopener noreferrer">{tr("Open original post ↗", "開啟原始貼文 ↗")}</a>}
            <div className="asset-nav"><span className="detail-label">{tr("Within", "在")} @{author}</span><div>{previous ? <Link href={postHref(previous)} prefetch={false}>← {tr("Newer", "較新")}</Link> : <span />}{next ? <Link href={postHref(next)} prefetch={false}>{tr("Older", "較舊")} →</Link> : <span />}</div></div>
          </aside>
        </div>
      </article>
    </ArchiveShell>
  );
}
