import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveShell } from "@/components/archive-shell";
import { FrameIdentifier } from "@/components/frame-identifier";
import { AddToStudyButton } from "@/components/add-to-study";
import { authors, getAuthor, getPost, postHref } from "@/lib/atlas";
import { assetTitle } from "@/lib/asset-label";
import { serverTr } from "@/lib/i18n-server";
import { formatTimestamp, getLabFrame, getLabStudy, isStillStudy, labFrameHref, labFrameUid, labImageHref, labStudyCategory, labStudyCounts, labStudyHref } from "@/lib/experiment-lab";

type Props = { params: Promise<{ author: string; asset: string; frame: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tr = await serverTr();
  const { author, asset, frame: id } = await params;
  const study = getLabStudy(author, asset);
  const frame = study && getLabFrame(study, id);
  if (!frame) return { title: tr("Lab frame not found", "找不到實驗室畫面") };
  const uid = labFrameUid(study, frame);
  const source = study.analysis?.title ?? assetTitle({ asset, caption: getPost(author, asset)?.caption, authorName: getAuthor(author)?.name ?? author });
  if (isStillStudy(study)) return { title: `${tr("Item", "項目")} ${frame.id} · ${source} · ${tr("Exp Lab", "實驗室")}`, description: `${tr("Item", "項目")} ${frame.id} / ${study.frames.length} · ${source}`, other: { "collections:frame-id": uid } };
  return { title: `${tr("Slide", "畫面")} ${frame.id} · ${source} · ${tr("Exp Lab", "實驗室")}`, description: `${tr("Frame at", "畫面時間")} ${formatTimestamp(frame.timeSeconds)} · ${source}`, other: { "collections:frame-id": uid } };
}

export default async function LabFramePage({ params }: Props) {
  const tr = await serverTr();
  const { author, asset, frame: id } = await params;
  const study = getLabStudy(author, asset);
  if (!study) notFound();
  const frame = getLabFrame(study, id);
  if (!frame) notFound();
  const position = study.frames.findIndex((item) => item.id === id);
  const previous = position > 0 ? study.frames[position - 1] : null;
  const next = position < study.frames.length - 1 ? study.frames[position + 1] : null;
  const post = getPost(author, asset);
  const category = labStudyCategory(study);
  const labHome = category === "kol" ? "/exp-lab/kol" : "/exp-lab";
  const scene = study.analysis?.scenes.find((item) => item.frameId === frame.id);
  const still = isStillStudy(study);
  const itemLabel = still ? tr("Item", "項目") : tr("Slide", "畫面");
  const kindLabel = study.kind === "carousel" ? tr("carousel", "輪播") : study.kind === "photo" ? tr("photo", "照片") : tr("video", "影片");
  const frameUid = labFrameUid(study, frame);

  return (
    <ArchiveShell authors={authors} selectedAuthor={null} category={category} labView filter="all" counts={labStudyCounts(category)}>
      <article className="asset-page lab-page">
        <nav className="breadcrumbs" aria-label={tr("Breadcrumbs", "導覽路徑")}>
          <Link href={category === "kol" ? "/category/kol" : "/"}>{category === "kol" ? tr("KOL creators", "KOL 創作者") : tr("All creators", "所有創作者")}</Link><span>/</span><Link href={labHome}>{category === "kol" ? tr("KOL Exp Lab", "KOL 實驗室") : tr("Exp Lab", "實驗室")}</Link><span>/</span><Link href={labStudyHref(study)}>{study.analysis?.title ?? assetTitle({ asset, caption: post?.caption, authorName: getAuthor(author)?.name ?? author })}</Link><span>/</span><span>{itemLabel} {frame.id}</span>
        </nav>
        <div className="asset-heading">
          <div><p className="eyebrow">{still ? `${study.kind === "carousel" ? tr("Carousel item", "輪播項目") : tr("Photo", "照片")} / ${frame.id} / ${study.frames.length}` : `${tr("Frame extraction", "擷取畫面")} / ${formatTimestamp(frame.timeSeconds)}`}</p><h1>{scene?.title ?? `${itemLabel} ${frame.id}`}</h1></div>
          <span className="lab-study-count">{frame.id} / {study.frames.length}</span>
        </div>
        <div className="asset-layout lab-layout">
          <div className="asset-viewer lab-frame-viewer">
            <Image src={labImageHref(study, frame.id, "full")} alt={`${itemLabel} ${frame.id} from @${author} ${kindLabel}`} width={study.width} height={study.height} sizes="(max-width: 900px) 100vw, 70vw" unoptimized />
          </div>
          <aside className="asset-details" aria-label={tr("Frame details", "畫面資訊")}>
            <div className="detail-section study-asset-action"><span className="detail-label">{still ? tr("Saved item", "已儲存項目") : tr("Extracted frame", "已擷取畫面")}</span><AddToStudyButton category={category} author={author} asset={asset} kind="frame" frameId={frame.id} /></div>
            <div className="detail-section">
              <span className="detail-label">{tr("Unique frame ID", "畫面唯一識別碼")}</span>
              <FrameIdentifier value={frameUid} />
              <p>{still ? tr("Derived from the source image fingerprint and decoded frame number.", "依來源圖片指紋與解碼後的畫面編號產生。") : tr("Derived from the source video fingerprint and decoded frame number.", "依來源影片指紋與解碼後的畫面編號產生。")}</p>
            </div>
            <div className="detail-section">
              <span className="detail-label">{still ? tr("Source post", "來源貼文") : tr("Source video", "來源影片")}</span>
              <Link href={labStudyHref(study)}>@{author} · {asset} ↗</Link>
            </div>
            {still ? (
              <div className="detail-section"><span className="detail-label">{study.kind === "carousel" ? tr("Carousel item", "輪播項目") : tr("Photo", "照片")}</span><strong>{frame.id} / {String(study.frames.length).padStart(2, "0")}</strong><p>{tr("Saved from the collected feed at", "從收藏動態儲存，尺寸為")} {study.width}×{study.height}。</p></div>
            ) : (
              <>
                <div className="detail-section"><span className="detail-label">{tr("Source frame", "來源畫面")}</span><strong>{frame.sourceFrame} / {study.totalFrames - 1}</strong><p>{tr("Captured at", "擷取時間")} {formatTimestamp(frame.timeSeconds)}。</p></div>
                <div className="detail-section">
                  <span className="detail-label">{study.segmentation === "settled moments" ? tr("Settled in the video", "影片中的穩定片段") : tr("Appearances in the video", "影片中的出現次數")}</span>
                  <strong>{frame.occurrences.length} {tr(frame.occurrences.length === 1 ? "appearance" : "appearances", "次")}</strong>
                  <ol className="lab-occurrences">{frame.occurrences.map((occurrence) => <li key={occurrence.startFrame}>{formatTimestamp(occurrence.startSeconds)}–{formatTimestamp(occurrence.endSeconds)} <span>({occurrence.durationSeconds.toFixed(2)}s)</span></li>)}</ol>
                </div>
              </>
            )}
            {scene && <div className="detail-section"><span className="detail-label">{tr("Timed scene", "計時場景")}</span><strong>{formatTimestamp(scene.startSeconds)}–{formatTimestamp(scene.endSeconds)}</strong><p>{scene.narration}</p><p><b>{tr("On-screen:", "畫面文字：")}</b> {scene.onScreen.join(" · ")}</p></div>}
            <Link className="source-link" href={`${labStudyHref(study)}#lab-frames-heading`}>{still ? tr("Back to all items", "返回所有項目") : tr("Back to all slides", "返回所有畫面")} ↗</Link>
            {post && <Link className="lab-original-link" href={postHref(post)} prefetch={false}>{tr("View source post", "查看來源貼文")} ↗</Link>}
            <div className="asset-nav"><span className="detail-label">{still ? tr("Browse items", "瀏覽項目") : tr("Browse slides", "瀏覽畫面")}</span><div>{previous ? <Link href={labFrameHref(study, previous.id)} prefetch={false}>← {tr("Previous", "上一項")}</Link> : <span />}{next ? <Link href={labFrameHref(study, next.id)} prefetch={false}>{tr("Next", "下一項")} →</Link> : <span />}</div></div>
          </aside>
        </div>
      </article>
    </ArchiveShell>
  );
}
