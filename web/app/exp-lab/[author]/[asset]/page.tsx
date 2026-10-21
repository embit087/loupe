import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveShell } from "@/components/archive-shell";
import { AssetViewer } from "@/components/asset-viewer";
import { AssetReactions } from "@/components/reactions";
import { LabFrameGrid } from "@/components/lab-frame-grid";
import { AddToStudyButton } from "@/components/add-to-study";
import { LabToggle } from "@/components/lab-posts";
import { LabProcessedOutput } from "@/components/lab-processed-output";
import { LabScenePlayback, LabScenePlayButton } from "@/components/lab-scene-playback";
import { authors, formatDate, getAuthor, getPost, postHref, posterHref, videoHref } from "@/lib/atlas";
import { AssetName } from "@/components/asset-name";
import { StudyDimensionsSection } from "@/components/study-dimensions-section";
import { getStudyDimensions } from "@/lib/study-dimensions";
import { assetTitle } from "@/lib/asset-label";
import { getPersistedLabAnalysis } from "@/lib/lab-analysis";
import { serverTr } from "@/lib/i18n-server";
import { formatTimestamp, getLabStudiesForCategory, getLabStudy, isStillStudy, labFrameHref, labFrameUid, labImageHref, labSlideSummary, labStudyCategory, labStudyCounts, type LabStudyAnalysis, type LabStudyScene } from "@/lib/experiment-lab";

type Props = { params: Promise<{ author: string; asset: string }> };

function closestTranscriptPassage(scene: LabStudyScene, transcript: LabStudyAnalysis["transcript"]): number | null {
  let bestIndex: number | null = null;
  let longestOverlap = 0;
  transcript.forEach((passage, index) => {
    const overlap = Math.min(scene.endSeconds, passage.endSeconds) - Math.max(scene.startSeconds, passage.startSeconds);
    if (overlap > longestOverlap) {
      longestOverlap = overlap;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { author, asset } = await params;
  const study = getLabStudy(author, asset);
  if (!study) return { title: "Lab study not found" };
  const post = getPost(author, asset);
  const title = study.analysis?.title ?? assetTitle({ asset, caption: post?.caption, authorName: getAuthor(author)?.name ?? author });
  return { title: `${title} · Exp Lab`, description: study.analysis?.summary ?? `${labSlideSummary(study)} from @${author}` };
}

export default async function LabStudyPage({ params }: Props) {
  const tr = await serverTr();
  const { author, asset } = await params;
  const study = getLabStudy(author, asset);
  if (!study) notFound();
  const post = getPost(author, asset);
  if (!post) notFound();
  const category = labStudyCategory(study);
  const labHome = category === "kol" ? "/exp-lab/kol" : "/exp-lab";
  const studyNumber = String(getLabStudiesForCategory(category).indexOf(study) + 1).padStart(2, "0");
  const still = isStillStudy(study);
  const kindLabel = study.kind === "video" ? tr("Video", "影片") : study.kind === "carousel" ? tr("Carousel", "輪播") : tr("Photo", "照片");
  const heading = labSlideSummary(study);
  const analysis = await getPersistedLabAnalysis(study);
  const title = analysis?.title ?? assetTitle({ asset, caption: post.caption, authorName: getAuthor(author)?.name ?? author });
  const sceneTranscriptMatches = analysis?.scenes.map((scene) => closestTranscriptPassage(scene, analysis.transcript)) ?? [];
  const summary =
    study.kind === "photo"
      ? tr("The photo was saved at full resolution from the collected feed.", "照片已從收藏貼文中以完整解析度儲存。")
      : study.kind === "carousel"
        ? tr(`All ${study.uniqueSlides} items were saved at full resolution from the collected feed, in posting order.`, `全部 ${study.uniqueSlides} 張圖片已依貼文順序以完整解析度儲存。`)
        : study.segmentation === "visual scenes"
          ? tr(`All ${study.totalFrames} frames were inspected. ${study.heldStates} candidate moments and ${analysis?.frameSampleCount ?? 0} OCR samples were reviewed, then repeated product visuals were grouped into ${study.uniqueSlides} scenes.`, `已檢查全部 ${study.totalFrames} 個畫面，校對 ${study.heldStates} 個候選片段與 ${analysis?.frameSampleCount ?? 0} 個 OCR 樣本，並將重複的產品畫面歸為 ${study.uniqueSlides} 個場景。`)
        : study.segmentation === "settled moments"
          ? tr(`All ${study.totalFrames} source frames were inspected. The footage moves continuously, so ${study.heldStates} settled moments were kept and the motion between them treated as transition.`, `已檢查全部 ${study.totalFrames} 個原始畫面。影片持續移動，因此保留 ${study.heldStates} 個穩定畫面，其間動作視為轉場。`)
          : tr(`All ${study.totalFrames} source frames were inspected. ${study.heldStates} held states were found; repeated visuals were grouped with their first appearance.`, `已檢查全部 ${study.totalFrames} 個原始畫面，找到 ${study.heldStates} 個定格狀態；重複畫面與首次出現的畫面合併。`);

  return (
    <ArchiveShell authors={authors} selectedAuthor={null} category={category} labView filter="all" counts={labStudyCounts(category)}>
      <article className="asset-page lab-page">
        <nav className="breadcrumbs" aria-label={tr("Breadcrumbs", "導覽路徑")}>
          <Link href={category === "kol" ? "/category/kol" : "/"}>{category === "kol" ? tr("KOL creators", "KOL 創作者") : tr("All creators", "所有創作者")}</Link><span>/</span><Link href={labHome}>{category === "kol" ? tr("KOL Exp Lab", "KOL 實驗室") : tr("Exp Lab", "實驗室")}</Link><span>/</span><span>{title}</span>
        </nav>
        <div className="asset-heading">
          <div><p className="eyebrow">{tr("Selected", "精選")}{still ? tr(" work", "作品") : tr(" motion", "動態")} / {tr("Study", "研究")} {studyNumber}</p><h1>{title}</h1><AssetName asset={asset} className="asset-name-heading" /></div>
          <div className="lab-study-actions">
            <span className="lab-study-count">{studyNumber} / {kindLabel.toUpperCase()}</span>
            <Link className="lab-back-link" href={labHome}>← {tr("Back to", "返回")} {category === "kol" ? "KOL " : ""}{tr("Exp Lab", "實驗室")}</Link>
          </div>
        </div>
        <p className="lab-intro">
          {still ? tr("Inspect this collected post item by item.", "逐項檢視這則收藏貼文。") : tr("Play this collected motion piece and inspect its frames.", "播放收藏影片並檢視各個畫面。")}{" "}
          {analysis ? <a href="#lab-analysis-heading">{tr("Read the timed study ↓", "閱讀時間軸研究 ↓")}</a> : study.kind !== "photo" && <a href="#lab-frames-heading">{tr("Browse", "瀏覽")} {heading} ↓</a>}
        </p>
        <div className="asset-layout lab-layout">
          {still ? (
            <AssetViewer kind="photo" poster={posterHref(post)} video="" image={labImageHref(study, study.frames[0].id, "full")} source={post.permalink} alt={`${kindLabel} by @${author}`} />
          ) : (
            <AssetViewer kind="video" poster={posterHref(post)} video={videoHref(post)} image="" source={post.permalink} alt={`Video by @${author}`} />
          )}
          <aside className="asset-details" aria-label={tr("Study details", "研究資訊")}>
            <div className="detail-section study-asset-action"><span className="detail-label">{tr("Save", "收藏")}</span><LabToggle collection={category} author={author} asset={asset} favorite /></div>
            <div className="detail-section study-asset-action"><span className="detail-label">{tr("Add post to a study", "將貼文加入研究")}</span><AddToStudyButton category={category} author={author} asset={asset} kind="post" /></div>
            <div className="detail-section study-asset-action"><span className="detail-label">{still ? tr("Saved image", "已儲存圖片") : tr("Source video", "原始影片")}</span><AddToStudyButton category={category} author={author} asset={asset} kind={still ? "poster" : "video"} /></div>
            {!still && <div className="detail-section study-asset-action"><span className="detail-label">{tr("Cover image", "封面圖片")}</span><AddToStudyButton category={category} author={author} asset={asset} kind="poster" /></div>}
            {!still && <div className="detail-section study-asset-action"><span className="detail-label">{tr("Audio track", "音訊")}</span><AddToStudyButton category={category} author={author} asset={asset} kind="audio" /></div>}
            <div className="detail-section">
              <span className="detail-label">{tr("Study", "研究")} {studyNumber} · @{author}</span>
              <AssetName asset={asset} />
              <p>{formatDate(post.date)} · {post.category}</p>
            </div>
            <AssetReactions author={author} asset={asset} />
            <div className="detail-section">
              <span className="detail-label">{tr("Source", "來源")}</span>
              <p>{tr("Collected from", "收藏自")} <Link href={`/${author}`}>@{author}</Link>.</p>
            </div>
            <Link className="source-link" href={postHref(post)} prefetch={false}>{tr("View post in collection ↗", "在收藏中查看貼文 ↗")}</Link>
            {post.permalink && <a className="lab-original-link" href={post.permalink} target="_blank" rel="noopener noreferrer">{tr("Open original Instagram post ↗", "開啟原始 Instagram 貼文 ↗")}</a>}
          </aside>
        </div>
        {analysis && <LabScenePlayback videoSrc={videoHref(post)} posterSrc={posterHref(post)}><section className="lab-analysis" aria-labelledby="lab-analysis-heading">
          <div className="lab-frames-heading"><div><p className="eyebrow">{tr("Video study", "影片研究")}</p><h2 id="lab-analysis-heading">{tr("What the video covers", "影片內容概覽")}</h2></div><p>{analysis.summary}</p></div>
          <p className="lab-analysis-method">{study.method} {tr("Audio", "音訊")}：{analysis.audioMethod} {tr("Each scene shows the reviewed speech passage with which it overlaps most.", "每個場景顯示時間最相近的已校對語音片段。")}</p>
          <ol className="lab-scene-timeline">
            {analysis.scenes.map((scene, sceneIndex) => {
              const passageIndex = sceneTranscriptMatches[sceneIndex];
              const passage = passageIndex === null ? null : analysis.transcript[passageIndex];
              return <li key={scene.frameId} id={`scene-${scene.frameId}`}>
              <div className="lab-scene-visual"><Link className="lab-scene-image" href={labFrameHref(study, scene.frameId)} prefetch={false} aria-label={tr(`Inspect ${scene.title} frame at ${formatTimestamp(scene.startSeconds)}`, `檢視 ${formatTimestamp(scene.startSeconds)} 的「${scene.title}」畫面`)}>
                <Image src={labImageHref(study, scene.frameId, "thumb")} alt={scene.visual} width={144} height={256} sizes="(max-width: 760px) 76px, 110px" unoptimized loading="lazy" />
              </Link><AddToStudyButton className="lab-scene-add-to-study" category={category} author={author} asset={asset} kind="frame" frameId={scene.frameId} /></div>
              <div className="lab-scene-content">
                <div className="lab-scene-heading"><LabScenePlayButton title={scene.title} startSeconds={scene.startSeconds} endSeconds={scene.endSeconds} timeLabel={`${formatTimestamp(scene.startSeconds)}–${formatTimestamp(scene.endSeconds)}`} /><h3>{scene.title}</h3></div>
                <p>{scene.narration}</p>
                <LabProcessedOutput kind="screen" text={scene.onScreen.join(" · ")} />
                {passage && <LabProcessedOutput kind="speech" text={passage.text} timeRange={`${formatTimestamp(passage.startSeconds)}–${formatTimestamp(passage.endSeconds)}`} />}
              </div>
            </li>})}
          </ol>
          <div className="study-evidence-action"><span>{tr("Speech transcript", "語音逐字稿")}</span><AddToStudyButton category={category} author={author} asset={asset} kind="transcript" /></div>
          <details className="lab-evidence">
            <summary>{tr("Reviewed speech transcript", "已校對語音逐字稿")} · {analysis.transcript.length} {tr("timed passages", "段定時內容")}</summary>
            <ol>{analysis.transcript.map((passage, passageIndex) => <li key={passage.startSeconds}><time>{formatTimestamp(passage.startSeconds)}–{formatTimestamp(passage.endSeconds)}</time><p>{passage.text}</p><span className="lab-transcript-frames">{tr("Frames", "畫面")} {analysis.scenes.flatMap((scene, sceneIndex) => sceneTranscriptMatches[sceneIndex] === passageIndex ? [<a key={scene.frameId} href={`#scene-${scene.frameId}`}>{scene.frameId}</a>] : [])}</span></li>)}</ol>
          </details>
          <div className="study-evidence-action"><span>{tr("Frame OCR results", "畫面 OCR 結果")}</span><AddToStudyButton category={category} author={author} asset={asset} kind="ocr" /></div>
          <details className="lab-evidence">
            <summary>{tr("Raw frame OCR", "原始畫面 OCR")} · {analysis.ocrSamples.length} {tr(`samples at ${analysis.ocrIntervalSeconds} second intervals`, `個樣本，每 ${analysis.ocrIntervalSeconds} 秒擷取一次`)}</summary>
            <p className="lab-evidence-note">{tr("Raw recognition is kept for audit. It includes transient subtitle fragments and occasional OCR errors; the scene timeline above uses reviewed wording.", "保留原始辨識結果供核對，其中可能有短暫出現的字幕片段或 OCR 錯誤；上方場景時間軸使用已校對的文字。")}</p>
            <ol>{analysis.ocrSamples.map((sample) => <li key={sample.timeSeconds}><time>{formatTimestamp(sample.timeSeconds)}</time><p>{sample.strings.length ? sample.strings.join(" · ") : tr("No text detected", "未偵測到文字")}</p></li>)}</ol>
          </details>
          <div className="lab-analysis-caption"><div className="study-evidence-action"><span className="detail-label">{tr("Original post caption", "原始貼文文字")}</span>{post.caption && <AddToStudyButton category={category} author={author} asset={asset} kind="caption" />}</div><p>{analysis.caption}</p></div>
        </section></LabScenePlayback>}
        <StudyDimensionsSection record={getStudyDimensions(study, analysis)} />
        <section className="lab-frames" aria-labelledby="lab-frames-heading">
          <div className="lab-frames-heading">
            <div><p className="eyebrow">{still ? tr("Saved items", "已儲存項目") : tr("Frame extraction", "畫面擷取")}</p><h2 id="lab-frames-heading">{heading}</h2></div>
            <p>{summary}</p>
          </div>
          <LabFrameGrid author={author} asset={asset} category={category} kind={study.kind} width={study.width} height={study.height}
            frames={study.frames.map((frame) => ({ id: frame.id, uid: labFrameUid(study, frame), timeSeconds: frame.timeSeconds,
              href: labFrameHref(study, frame.id), image: labImageHref(study, frame.id, "thumb") }))} />
        </section>
      </article>
    </ArchiveShell>
  );
}
