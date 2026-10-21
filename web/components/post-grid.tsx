"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatCount, withMediaFilter, type CollectionCategory, type MediaFilter, type MediaKind } from "@/lib/atlas";
import { ReactionButtons, useAnnotations, type Annotation, type ReactionPost } from "@/components/reactions";
import { LabToggle } from "@/components/lab-posts";
import { AddToStudyButton } from "@/components/add-to-study";
import { AssetName } from "@/components/asset-name";
import { SelectToggle, SelectionArea, SelectionBar, useSelectionScope } from "@/components/selection-scope";
import { useI18n } from "@/lib/i18n";

export type CardPost = {
  author: string;
  authorName: string;
  authorHref: string;
  asset: string;
  href: string;
  poster: string;
  video: string;
  kind: MediaKind;
  carouselCount: number;
  date: string;
  category: string;
  collection: CollectionCategory;
  likeCount: number | null;
  commentCount: number | null;
  playCount: number | null;
  countsHidden: boolean;
  shareCount: number | null;
};

type VisualResult = { key: string; status: string; probability: number | null; matched: boolean | null; source: string; provider: string; cache: "hit" | "miss";
  model?: string; error?: string | null; retryAfterSeconds?: number; queueSeconds?: number | null; predictSeconds?: number | null;
  replicateCreatedAt?: string; submitMs?: number | null; matchingSlides?: number[]; totalImages?: number };
type VisualProvider = "gpt-6-luna" | "jev-omni";
type VisualCoverage = "cover" | "all-slides";
type VisualLabel = { object: string; provider: VisualProvider; matched: boolean; source: string; matchingSlides?: number[] };
type VisualStageEvent = { type: "stage"; stage: string; elapsedMs?: number; kind?: string; source?: string; cache?: "hit" | "miss";
  slideIndex?: number; slideTotal?: number };
type VisualStageState = { stage: string; enteredAt: number; kind?: string; source?: string; cache?: "hit" | "miss";
  frameCache?: "hit" | "miss";
  mediaMs?: number; prepareMs?: number; cacheMs?: number; submitMs?: number; queueSeconds?: number | null;
  predictSeconds?: number | null; replicateCreatedAt?: string; slideIndex?: number; slideTotal?: number };
type VisualCreateResult = { status: number; result: VisualResult & { error?: string } };
const visualPollIntervalMs = 3_000;
const visualPollMaxAttempts = 300;

async function readVisualStream<T>(response: Response, onStage: (event: VisualStageEvent) => void): Promise<{ status: number; result: T }> {
  if (!response.ok || !response.body) return { status: response.status, result: await response.json() as T };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outcome: { status: number; result: T } | null = null;
  const receive = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as VisualStageEvent | { type: "result"; status: number; result: T };
    if (event.type === "stage") onStage(event);
    else outcome = { status: event.status, result: event.result };
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      receive(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
    if (done) break;
  }
  receive(buffer);
  if (!outcome) throw new Error("Visual request ended before a result was returned");
  return outcome;
}

const readVisualCreate = (response: Response, onStage: (event: VisualStageEvent) => void): Promise<VisualCreateResult> =>
  readVisualStream<VisualCreateResult["result"]>(response, onStage);

type PostView = "grid" | "table";
const viewChangeEvent = "collections-post-view-change";

function subscribeView(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(viewChangeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(viewChangeEvent, callback);
  };
}

function storedView(category?: CollectionCategory): PostView {
  if (!category) return "grid";
  try {
    return window.localStorage.getItem(`collections-post-view-${category}`) === "table" ? "table" : "grid";
  } catch {
    return "grid";
  }
}

function serverView(): PostView { return "grid"; }

function storedColumns(category?: CollectionCategory): number {
  if (!category) return 4;
  try {
    const value = Number(window.localStorage.getItem(`collections-post-columns-${category}`));
    return Number.isInteger(value) && value >= 3 && value <= 7 ? value : 4;
  } catch {
    return 4;
  }
}

function serverColumns(): number { return 4; }

function VisualInfoButton({ labels }: { labels: VisualLabel[] }) {
  const { tr } = useI18n();
  const button = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const tooltip = labels.map((label) => `${label.provider === "gpt-6-luna" ? "GPT-6 Luna" : "Jev-Omni"} · ${tr("Query", "辨識提問")}：${tr("Does the image contain", "畫面是否有")}「${label.object}」？ · ${label.matched ? tr("match", "符合") : tr("no match", "不符合")} · ${label.source}${label.matchingSlides?.length ? ` (${tr("slides", "第")} ${label.matchingSlides.join(", ")}${tr("", " 張")})` : ""}`).join("\n");
  const show = () => {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(320, window.innerWidth - 24);
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: rect.top < 150 ? rect.bottom + 8 : rect.top - 8, below: rect.top < 150 });
  };
  useEffect(() => {
    if (!position) return;
    const hide = () => setPosition(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => { window.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); };
  }, [position]);
  return <>
    <button ref={button} type="button" className="card-visual-info" data-select-ignore
      aria-label={tr(`Image checks: ${labels.map((label) => `${label.object}: ${label.matched ? "yes" : "no"} (${label.provider})`).join("; ")}`, `影像辨識：${labels.map((label) => `${label.object}：${label.matched ? "符合" : "不符合"}（${label.provider}）`).join("；")}`)}
      onMouseEnter={show} onMouseLeave={() => setPosition(null)} onFocus={show} onBlur={() => setPosition(null)} onClick={show}>ⓘ</button>
    {position && createPortal(<div className={`card-visual-tooltip${position.below ? " below" : ""}`} role="tooltip" style={{ left: position.left, top: position.top }}>{tooltip}</div>, document.body)}
  </>;
}

function PostCard({ post, showAuthor, filter, annotation, pending, onVote, renderExtra, onCollapseDisliked, favoriteActions, visualLabels = [], batchPlay = false }: { post: CardPost; showAuthor: boolean; filter: MediaFilter; annotation?: Annotation; pending?: boolean; onVote: (post: ReactionPost, reaction: -1 | 1) => void; renderExtra?: (post: CardPost) => ReactNode; onCollapseDisliked?: () => void; favoriteActions?: boolean; visualLabels?: VisualLabel[]; batchPlay?: boolean }) {
  const { tr } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!batchPlay || post.kind !== "video") return;
    const video = videoRef.current;
    if (!video) return;
    let active = true;
    const wasMuted = video.muted;
    video.muted = true;
    setStarted(true);
    setError(false);
    void video.play().catch(() => { if (active) { setStarted(false); setPlaying(false); setError(true); } });
    return () => { active = false; video.pause(); video.muted = wasMuted; };
  }, [batchPlay, post.kind]);

  function toggleVideo() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      setStarted(true);
      setError(false);
      void video.play().catch(() => { setStarted(false); setPlaying(false); setError(true); });
    } else {
      video.pause();
    }
  }

  const kindLabel = post.kind === "carousel" ? tr("SET", "圖集") : post.kind === "video" ? tr("VIDEO", "影片") : tr("IMG", "圖片");
  return (
    <article className={`post-card ${post.kind}${started ? " started" : ""}`} data-select-id={`${post.author}/${post.asset}`}>
      <div className="card-frame">
        {!started && (post.kind === "video" ? (
          <button type="button" className="card-poster-button" onClick={toggleVideo} aria-label={tr(`Play video by ${post.authorName} in the grid`, `在列表中播放 ${post.authorName} 的影片`)} title={tr("Play video here", "在此播放影片")}>
            <Image src={post.poster} alt={`${post.kind} by ${post.authorName}`} width={480} height={640} sizes="(max-width: 700px) 50vw, (max-width: 1100px) 33vw, 22vw" unoptimized loading="lazy" />
            <span className="preview-indicator" aria-hidden="true">▶</span>
          </button>
        ) : (
          <Link href={post.href} prefetch={false} aria-label={tr(`View ${post.kind} by @${post.author} from ${post.date}`, `查看 @${post.author} 於 ${post.date} 發布的貼文`)} className="card-poster-link">
            <Image src={post.poster} alt={`${post.kind} by ${post.authorName}`} width={480} height={640} sizes="(max-width: 700px) 50vw, (max-width: 1100px) 33vw, 22vw" unoptimized loading="lazy" />
          </Link>
        ))}
        {post.kind === "video" && (
          <video
            ref={videoRef}
            src={post.video}
            className="card-video"
            playsInline
            loop
            preload="none"
            onClick={toggleVideo}
            onPlay={() => { setStarted(true); setPlaying(true); }}
            onPause={() => setPlaying(false)}
            onError={() => { setStarted(false); setPlaying(false); setError(true); }}
            aria-label={tr(`Video by ${post.authorName}`, `${post.authorName} 的影片`)}
          />
        )}
        <AddToStudyButton className="card-add-to-study" category={post.collection} author={post.author} asset={post.asset} kind="post" />
        {visualLabels.length > 0 && <VisualInfoButton labels={visualLabels} />}
      </div>
      <div className="card-meta">
        {post.kind === "video" ? (
          <button type="button" className="card-play" onClick={toggleVideo} aria-label={playing ? tr(`Pause video by ${post.authorName}`, `暫停 ${post.authorName} 的影片`) : tr(`Play video by ${post.authorName}`, `播放 ${post.authorName} 的影片`)} title={playing ? tr("Pause", "暫停") : tr("Play", "播放")}>
            {playing ? "Ⅱ" : "▶"}
          </button>
        ) : <span className="card-kind">{kindLabel}</span>}
        <time>{post.date}</time>
        {showAuthor ? (
          <Link className="card-author" href={withMediaFilter(post.authorHref, filter)} prefetch={false} title={post.authorName}>@{post.author}</Link>
        ) : <span className="card-author" title={post.category || kindLabel}>{post.category || kindLabel}</span>}
        <Link href={post.href} prefetch={false} className="card-open" aria-label={tr(`View post ${post.asset}`, `查看貼文 ${post.asset}`)} title={tr("View post", "查看貼文")}>{tr("View post ↗", "查看貼文 ↗")}</Link>
      </div>
      {post.collection === "kol" && <div className="source-metrics" aria-label={tr("Instagram engagement at collection", "收藏時的 Instagram 互動數據")}>
        <span className="source-metrics-label">IG</span>
        {post.countsHidden ? <span className="source-hidden" title={tr("Instagram feed reports hidden like and view counts for this post", "Instagram 未公開這則貼文的喜歡與觀看次數")}>{tr("Likes and views hidden", "喜歡與觀看次數未公開")}</span> : <>
        <span title={tr("Instagram likes", "Instagram 喜歡數")}>♥ {post.likeCount === null ? "—" : formatCount(post.likeCount)}</span>
          {post.kind === "video" && <span title={tr("Instagram video plays", "Instagram 影片播放數")}>▶ {post.playCount === null ? "—" : formatCount(post.playCount)}</span>}
        </>}
        <span title={tr("Instagram comments", "Instagram 留言數")}>◌ {post.commentCount === null ? "—" : formatCount(post.commentCount)}</span>
        {post.shareCount !== null && <span title={tr("Instagram shares (SocialCrawl)", "Instagram 分享數（SocialCrawl）")}>↗ {formatCount(post.shareCount)}</span>}
      </div>}
      <div className="card-actions">
        <ReactionButtons post={post} annotation={annotation} pending={pending} onVote={onVote} />
        <LabToggle author={post.author} asset={post.asset} collection={post.collection} favorite={favoriteActions} />
      </div>
      {annotation?.myReaction === -1 && onCollapseDisliked && <button type="button" className="post-disliked-collapse" onClick={onCollapseDisliked}>{tr("Collapse disliked post ↑", "收合略過的貼文 ↑")}</button>}
      {renderExtra?.(post)}
      {error && <div className="card-error">{tr("Preview unavailable.", "無法預覽。")} <Link href={post.href} prefetch={false}>{tr("Open asset page ↗", "開啟素材頁 ↗")}</Link></div>}
    </article>
  );
}

function PostTableRow({ post, filter, annotation, pending, onVote, favoriteActions, visualLabels = [] }: { post: CardPost; filter: MediaFilter; annotation?: Annotation; pending?: boolean; onVote: (post: ReactionPost, reaction: -1 | 1) => void; favoriteActions?: boolean; visualLabels?: VisualLabel[] }) {
  const { tr } = useI18n();
  const kindLabel = post.kind === "carousel" ? tr("Set", "圖集") : post.kind === "video" ? tr("Video", "影片") : tr("Image", "圖片");
  return <tr data-select-id={`${post.author}/${post.asset}`}>
    <td><Link className="post-table-preview" href={post.href} prefetch={false} aria-label={tr(`Preview ${post.kind} by @${post.author}`, `預覽 @${post.author} 的貼文`)}>
      <Image src={post.poster} alt="" width={72} height={88} sizes="72px" unoptimized loading="lazy" />
      {post.kind === "video" && <span aria-hidden="true">▶</span>}
    </Link></td>
    <td><Link className="post-table-author" href={withMediaFilter(post.authorHref, filter)} prefetch={false}><strong>{post.authorName}</strong><small>@{post.author}</small></Link></td>
    <td><Link className="post-table-asset" href={post.href} prefetch={false}><AssetName asset={post.asset} /><small>{post.date} · {tr("View post ↗", "查看貼文 ↗")}</small></Link>{visualLabels.length > 0 && <span className="post-table-visual-labels" title={visualLabels.map((label) => `${label.provider} · ${label.object}: ${label.matched ? tr("match", "符合") : tr("no match", "不符合")}`).join("\n")}>ⓘ {visualLabels.length}</span>}</td>
    <td><time>{post.date}</time></td>
    <td><span className="post-table-kind">{kindLabel}</span></td>
    {post.collection === "kol" && <td className="post-table-engagement">{post.countsHidden ? tr("Counts hidden", "數據未公開") : <>
      <span title={tr("Instagram likes", "Instagram 喜歡數")}>♥ {post.likeCount === null ? "—" : formatCount(post.likeCount)}</span>
      {post.kind === "video" && <span title={tr("Instagram video plays", "Instagram 影片播放數")}>▶ {post.playCount === null ? "—" : formatCount(post.playCount)}</span>}
      {post.shareCount !== null && <span title={tr("Instagram shares (SocialCrawl)", "Instagram 分享數（SocialCrawl）")}>↗ {formatCount(post.shareCount)}</span>}
    </>}</td>}
    <td><div className="post-table-actions">
      <ReactionButtons post={post} annotation={annotation} pending={pending} onVote={onVote} />
      <LabToggle author={post.author} asset={post.asset} collection={post.collection} favorite={favoriteActions} />
      <AddToStudyButton category={post.collection} author={post.author} asset={post.asset} kind="post" />
    </div></td>
  </tr>;
}

export function PostGrid({ items, showAuthor, filter = "all", emptyMessage, onVoteSaved, renderExtra, collapseDisliked = false, viewToggleCategory, favoriteActions = false }: { items: CardPost[]; showAuthor: boolean; filter?: MediaFilter; emptyMessage?: string; onVoteSaved?: (annotation: Annotation) => void; renderExtra?: (post: CardPost) => ReactNode; collapseDisliked?: boolean; viewToggleCategory?: CollectionCategory; favoriteActions?: boolean }) {
  const { tr } = useI18n();
  const [visible, setVisible] = useState(48);
  const [visualOpen, setVisualOpen] = useState(false);
  const [visualObject, setVisualObject] = useState("");
  const [visualProvider, setVisualProvider] = useState<VisualProvider>("gpt-6-luna");
  const [visualCoverage, setVisualCoverage] = useState<VisualCoverage>("cover");
  const [visualRunning, setVisualRunning] = useState(false);
  const [visualStopping, setVisualStopping] = useState(false);
  const [visualChecked, setVisualChecked] = useState(0);
  const [visualPending, setVisualPending] = useState(0);
  const [visualStages, setVisualStages] = useState<Record<string, VisualStageState>>({});
  const [visualNow, setVisualNow] = useState(0);
  const [visualErrors, setVisualErrors] = useState(0);
  const [visualErrorDetail, setVisualErrorDetail] = useState("");
  const [visualWait, setVisualWait] = useState("");
  const [visualMatches, setVisualMatches] = useState<Set<string> | null>(null);
  const [visualFilter, setVisualFilter] = useState(false);
  const [visualComplete, setVisualComplete] = useState(false);
  const [visualCached, setVisualCached] = useState(0);
  const [visualJump, setVisualJump] = useState<string | null>(null);
  const visualStop = useRef(false);
  const visualInFlight = useRef(false);
  const visualAbort = useRef<AbortController | null>(null);
  const [visualResults, setVisualResults] = useState<Record<string, VisualResult>>({});
  const [visualLabels, setVisualLabels] = useState<Record<string, VisualLabel[]>>({});
  const [visualSelection, setVisualSelection] = useState<{ object: string; provider: VisualProvider; coverage: VisualCoverage; ids: Set<string> } | null>(null);
  const [visualScopeIds, setVisualScopeIds] = useState<Set<string> | null>(null);
  const [expandedDisliked, setExpandedDisliked] = useState<string[]>([]);
  const [fallbackView, setFallbackView] = useState<PostView | null>(null);
  const [fallbackColumns, setFallbackColumns] = useState<number | null>(null);
  const [batchPlaying, setBatchPlaying] = useState(false);
  const [selectedFirst, setSelectedFirst] = useState(false);
  useEffect(() => {
    if (!visualRunning) return;
    const timer = window.setInterval(() => setVisualNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [visualRunning]);
  const getView = useCallback(() => storedView(viewToggleCategory), [viewToggleCategory]);
  const savedView = useSyncExternalStore(subscribeView, getView, serverView);
  const view = viewToggleCategory ? (fallbackView ?? savedView) : "grid";
  const getColumns = useCallback(() => storedColumns(viewToggleCategory), [viewToggleCategory]);
  const savedColumns = useSyncExternalStore(subscribeView, getColumns, serverColumns);
  const gridColumns = fallbackColumns ?? savedColumns;
  const stageLabels: Record<string, [string, string]> = {
    queued: ["Waiting for a local slot", "等待本機排程"], post_lookup: ["Checking post", "確認貼文資料"],
    media_kind: ["Checking media type", "確認圖片或影片"], video_frame_cache: ["Checking cached video frame", "檢查影片首幀快取"],
    visual_input_cache: ["Checking prepared cover", "檢查預先處理的封面"],
    visual_input_hit: ["Prepared cover loaded", "已載入預先處理的封面"],
    visual_input_miss: ["Prepared cover unavailable", "預先處理的封面無法使用"],
    video_frame_hit: ["Cached video frame found", "已找到影片首幀快取"], video_frame_miss: ["No cached frame", "沒有首幀快取"],
    video_extract: ["Extracting first video frame", "擷取影片首幀"], poster_load: ["Loading cover image", "載入封面圖片"],
    carousel_slide: ["Checking carousel slide", "確認輪播圖片"], carousel_slide_load: ["Loading carousel slide", "載入輪播圖片"],
    carousel_progress: ["Carousel slides checked", "輪播圖片辨識進度"],
    media_ready: ["Media loaded", "畫面已載入"], image_prepare: ["Preparing image", "處理辨識圖片"],
    image_ready: ["Image ready", "圖片已備妥"], prediction_cache: ["Checking saved prediction", "檢查已儲存辨識"],
    prediction_cache_checked: ["Prediction cache checked", "已檢查辨識快取"], replicate_submit: ["Submitting to Replicate", "送出至 Replicate"],
    replicate_accepted: ["Replicate accepted request", "Replicate 已接收請求"], saving_prediction: ["Saving prediction", "儲存辨識請求"],
    openai_submit: ["Preparing OpenAI request", "準備 OpenAI 辨識請求"],
    openai_processing: ["GPT-6 Luna analyzing image", "GPT-6 Luna 正在辨識畫面"],
    openai_completed: ["GPT-6 Luna responded", "GPT-6 Luna 已完成辨識"],
    replicate_refreshing: ["Refreshing saved prediction", "確認先前辨識進度"],
    replicate_starting: ["Queued at Replicate / starting model", "Replicate 排隊或啟動模型中"],
    replicate_processing: ["Model running inference", "模型正在辨識"], rate_limit: ["Waiting for provider retry", "等待服務允許重試"],
    canceling: ["Canceling provider request", "正在取消遠端辨識"],
    done: ["Complete", "已完成"], error: ["Unavailable", "無法辨識"], stopped: ["Stopped", "已停止"],
  };
  const stageEntries = Object.entries(visualStages);
  const activeStages = stageEntries.filter(([, state]) => !["done", "error", "stopped"].includes(state.stage));
  const recentStages = stageEntries.filter(([, state]) => ["done", "error", "stopped"].includes(state.stage))
    .sort((a, b) => b[1].enteredAt - a[1].enteredAt);
  const displayStages = [...activeStages, ...recentStages].slice(0, 4);
  const scopeItems = visualScopeIds ? items.filter((post) => visualScopeIds.has(`${post.author}/${post.asset}`)) : items;
  const videoCount = scopeItems.filter((post) => post.kind === "video").length;
  const photoCount = scopeItems.filter((post) => post.kind === "photo").length;
  const carouselPosts = scopeItems.filter((post) => post.kind === "carousel");
  const carouselSlideCount = carouselPosts.reduce((sum, post) => sum + Math.max(1, post.carouselCount), 0);
  const seconds = (milliseconds: number) => `${(milliseconds / 1000).toFixed(1)}s`;
  const sentinel = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  // Multi-selection (lasso, click, Shift+click); S toggles it on the main collection grids.
  const selection = useSelectionScope(`posts:${viewToggleCategory ?? "list"}`, items.map((post) => `${post.author}/${post.asset}`), { shortcut: Boolean(viewToggleCategory), onExit: () => setSelectedFirst(false) });
  const selectedFirstActive = selectedFirst && selection.selecting && selection.selected.size > 0;
  const orderedItems = selectedFirstActive
    ? [...items.filter((post) => selection.selected.has(`${post.author}/${post.asset}`)), ...items.filter((post) => !selection.selected.has(`${post.author}/${post.asset}`))]
    : items;
  const shown = orderedItems.slice(0, Math.max(visible, selectedFirstActive ? selection.selected.size : 0));
  const displaySelection = selectedFirstActive ? { ...selection, ids: orderedItems.map((post) => `${post.author}/${post.asset}`) } : selection;
  const selectedVideoCount = items.filter((post) => post.kind === "video" && selection.selected.has(`${post.author}/${post.asset}`)).length;
  const recordLabel = (id: string, result: VisualResult, object: string, provider: VisualProvider) => {
    if (result.status !== "succeeded" || result.matched == null) return;
    setVisualLabels((current) => {
      const existing = current[id] ?? [];
      const next = existing.filter((label) => label.provider !== provider || label.object.toLocaleLowerCase() !== object.toLocaleLowerCase());
      return { ...current, [id]: [...next, { object, provider, matched: result.matched === true, source: result.source,
        matchingSlides: result.matchingSlides }] };
    });
  };
  function handleVoteSaved(annotation: Annotation) {
    const id = `${annotation.author}/${annotation.asset}`;
    setExpandedDisliked((current) => current.includes(id) ? current.filter((item) => item !== id) : current);
    onVoteSaved?.(annotation);
  }
  const { annotations, pending, error, vote } = useAnnotations(shown, handleVoteSaved);
  const collapsed = collapseDisliked ? shown.filter((post) => !(selectedFirstActive && selection.selected.has(`${post.author}/${post.asset}`)) && annotations[`${post.author}/${post.asset}`]?.myReaction === -1
    && !expandedDisliked.includes(`${post.author}/${post.asset}`)) : [];
  const collapsedKeys = new Set(collapsed.map((post) => `${post.author}/${post.asset}`));
  const active = (visualFilter && visualMatches ? orderedItems.filter((post) => visualMatches.has(`${post.author}/${post.asset}`)) : shown).filter((post) => !collapsedKeys.has(`${post.author}/${post.asset}`) &&
    (!visualFilter || visualMatches?.has(`${post.author}/${post.asset}`)));

  function stopVisual() {
    if (!visualInFlight.current || visualStop.current) return;
    visualStop.current = true;
    setVisualStopping(true);
    setVisualWait(tr("Stopping active checks and saving completed results…", "正在停止辨識並儲存已完成結果…"));
    // OpenAI foreground responses are canceled by terminating the connection.
    // Replicate creates must finish returning their IDs before they can be canceled remotely.
    if (visualProvider === "gpt-6-luna") visualAbort.current?.abort();
  }

  async function runVisual() {
    const object = visualObject.trim();
    const provider = visualProvider;
    const coverage = visualCoverage;
    if (object.length < 2 || object.length > 80 || visualInFlight.current || !viewToggleCategory || !scopeItems.length) return;
    const targetPosts = scopeItems;
    visualInFlight.current = true;
    visualStop.current = false;
    const controller = new AbortController();
    visualAbort.current = controller;
    const pause = async (milliseconds: number) => {
      for (let elapsed = 0; elapsed < milliseconds && !visualStop.current; elapsed += 250)
        await new Promise((resolve) => setTimeout(resolve, Math.min(250, milliseconds - elapsed)));
    };
    setVisualResults({});
    setVisualMatches(null); setVisualFilter(false); setVisualChecked(0); setVisualPending(0); setVisualStages({}); setVisualNow(Date.now()); setVisualErrors(0); setVisualErrorDetail("");
    setVisualComplete(false); setVisualCached(0); setVisualStopping(false); setVisualWait(tr("Loading saved scan…", "載入已儲存的辨識…")); setVisualRunning(true);
    const found = new Set<string>();
    const scanUrl = `/api/visual-find-scan?category=${encodeURIComponent(viewToggleCategory)}&object=${encodeURIComponent(object)}&provider=${provider}&coverage=${coverage}`;
    const resultMap: Record<string, VisualResult> = {};
    const activePredictionKeys = new Map<string, string>();
    let stopMessage = "";
    const markStage = (id: string, stage: string, extra: Partial<VisualStageState> = {}) => {
      setVisualStages((current) => ({ ...current, [id]: { ...current[id], ...extra, stage,
        enteredAt: current[id]?.stage === stage ? current[id].enteredAt : Date.now() } }));
    };
    const markResult = (id: string, result: VisualResult) => {
      markStage(id, result.status === "starting" ? "replicate_starting" : result.status === "processing" ? "replicate_processing" : result.status === "succeeded" ? "done" : "error",
        { source: result.source, submitMs: result.submitMs ?? undefined, queueSeconds: result.queueSeconds,
          predictSeconds: result.predictSeconds, replicateCreatedAt: result.replicateCreatedAt });
    };
    const updateStage = (id: string, event: VisualStageEvent) => {
      const extra: Partial<VisualStageState> = {};
      if (event.kind) extra.kind = event.kind;
      if (event.source) extra.source = event.source;
      if (event.cache) extra.cache = event.cache;
      if (event.slideIndex) extra.slideIndex = event.slideIndex;
      if (event.slideTotal) extra.slideTotal = event.slideTotal;
      if (event.stage === "video_frame_hit") extra.frameCache = "hit";
      if (event.stage === "video_frame_miss") extra.frameCache = "miss";
      if (event.stage === "media_ready") extra.mediaMs = event.elapsedMs;
      if (event.stage === "image_ready") extra.prepareMs = event.elapsedMs;
      if (event.stage === "prediction_cache_checked") extra.cacheMs = event.elapsedMs;
      if (event.stage === "replicate_accepted" || event.stage === "openai_completed") extra.submitMs = event.elapsedMs;
      markStage(id, event.stage, extra);
    };
    try {
      const savedResponse = await fetch(scanUrl, { cache: "no-store", signal: controller.signal });
      const saved = await savedResponse.json() as { results?: Record<string, VisualResult>; error?: string; complete?: boolean };
      if (!savedResponse.ok) throw new Error(saved.error || tr("Saved scan unavailable", "無法載入已儲存的辨識"));
      const itemIds = new Set(targetPosts.map((post) => `${post.author}/${post.asset}`));
      for (const [id, result] of Object.entries(saved.results || {})) {
        if (itemIds.has(id) && result.status === "succeeded") {
          resultMap[id] = { ...result, cache: "hit" };
          recordLabel(id, result, object, provider);
          if (result.matched) found.add(id);
        }
      }
      setVisualResults({ ...resultMap }); setVisualMatches(new Set(found));
      setVisualChecked(Object.keys(resultMap).length); setVisualCached(Object.keys(resultMap).length);
      if (!visualStop.current) setVisualWait("");
      if (Object.keys(resultMap).length === targetPosts.length) {
        setVisualComplete(true); setVisualRunning(false); setVisualStopping(false); visualAbort.current = null; visualInFlight.current = false;
        if (visualStop.current) setVisualWait(tr("Stopped · all results were already saved", "已停止 · 所有結果先前已儲存"));
        selection.setSelected(new Set(found));
        setVisualSelection({ object, provider, coverage, ids: new Set(found) });
        if (found.size) selection.enter();
        return;
      }
      const remaining = targetPosts.filter((post) => !resultMap[`${post.author}/${post.asset}`]);
      let next = 0;
      let errors = 0;
      let completed = 0;
      let pending = 0;
      let saveChain = Promise.resolve();
      let createChain = Promise.resolve();
      let nextCreateAt = 0;
      const reserve = async (intervalMs: number) => {
        const slot = createChain.then(async () => {
          await pause(Math.max(0, nextCreateAt - Date.now()));
          nextCreateAt = Date.now() + intervalMs;
        });
        createChain = slot.then(() => undefined, () => undefined);
        await slot;
      };
      const create = async (post: CardPost) => {
        await reserve(provider === "gpt-6-luna" ? coverage === "all-slides" ? 60 : 40 : 1_000);
        if (visualStop.current) return null;
        const id = `${post.author}/${post.asset}`;
        const response = await fetch("/api/visual-find?stream=1", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ author: post.author, asset: post.asset, object, provider, coverage }), signal: controller.signal });
        const { status, result } = await readVisualCreate(response, (event) => updateStage(id, event));
        const wait = status === 429 ? Math.max(1, Math.min(300, result.retryAfterSeconds || 2)) + 1 : 0;
        if (wait) {
          nextCreateAt = Math.max(nextCreateAt, Date.now() + wait * 1000);
          markStage(id, "rate_limit");
          setVisualWait(tr(`${provider === "gpt-6-luna" ? "OpenAI" : "Replicate"} rate limit · retrying in ${wait} seconds`,
            `${provider === "gpt-6-luna" ? "OpenAI" : "Replicate"} 已達速率上限，${wait} 秒後重試`));
        } else if (!visualStop.current) setVisualWait("");
        return { status, result };
      };
      const persist = (complete: boolean) => {
        const snapshot = { ...resultMap };
        saveChain = saveChain.then(async () => {
          const response = await fetch("/api/visual-find-scan", { method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category: viewToggleCategory, object, provider, coverage, results: snapshot, complete }) });
          if (!response.ok) throw new Error((await response.json() as { error?: string }).error || "Could not save scan progress");
        });
        return saveChain;
      };
      const check = async (post: CardPost) => {
        const id = `${post.author}/${post.asset}`;
        markStage(id, "queued", { kind: post.kind });
        let isPending = false;
        try {
          let result: VisualResult | null = null;
          for (let retries = 0; retries < 4 && !visualStop.current; retries++) {
            const started = await create(post);
            if (!started) return;
            result = started.result;
            if (started.status === 429) continue;
            if (started.status >= 400 || !result.key) throw new Error(result.error || tr("Visual check unavailable", "無法進行影像辨識"));
            if (!["succeeded", "failed", "canceled", "aborted"].includes(result.status)) activePredictionKeys.set(id, result.key);
            break;
          }
          if (visualStop.current) return;
          if (!result?.key || result.retryAfterSeconds) throw new Error(tr("Image check rate limit persisted", "影像辨識持續受到速率限制"));
          if (result.cache === "hit" && ["starting", "processing"].includes(result.status))
            markStage(id, "replicate_refreshing", { source: result.source, replicateCreatedAt: result.replicateCreatedAt });
          else markResult(id, result);
          if (!["succeeded", "failed", "canceled", "aborted"].includes(result.status)) {
            isPending = true;
            setVisualPending(++pending);
          }
          for (let attempts = 0; !["succeeded", "failed", "canceled", "aborted"].includes(result.status) && attempts < visualPollMaxAttempts && !visualStop.current; attempts++) {
            if (attempts > 0) await pause(visualPollIntervalMs);
            if (visualStop.current) return;
            const poll = await fetch(`/api/visual-find?key=${encodeURIComponent(result.key)}`, { cache: "no-store", signal: controller.signal });
            result = await poll.json() as VisualResult;
            if (!poll.ok) throw new Error(result.error || tr("Prediction check unavailable", "無法取得影像辨識結果"));
            if (["succeeded", "failed", "canceled", "aborted"].includes(result.status)) activePredictionKeys.delete(id);
            markResult(id, result);
          }
          if (visualStop.current) return;
          if (result.status !== "succeeded") throw new Error(result.error || tr("Visual check timed out", "影像辨識逾時或失敗"));
          resultMap[id] = result;
          recordLabel(id, result, object, provider);
          setVisualResults({ ...resultMap });
          if (result.matched) found.add(id);
          setVisualMatches(new Set(found));
        } catch (cause) {
          if (!visualStop.current) {
            markStage(id, "error");
            errors++;
            setVisualErrors(errors);
            setVisualErrorDetail(cause instanceof Error ? cause.message : tr("Visual check unavailable", "無法進行影像辨識"));
          }
        } finally {
          if (visualStop.current) markStage(id, activePredictionKeys.has(id) ? "canceling" : "stopped");
          if (isPending) setVisualPending(--pending);
          completed++;
          setVisualChecked(Object.keys(resultMap).length + errors);
          if (completed % 10 === 0) void persist(false).catch((error) => { visualStop.current = true; setVisualErrorDetail(String(error)); });
        }
      };
      await Promise.all(Array.from({ length: Math.min(provider === "gpt-6-luna" ? coverage === "all-slides" ? 12 : 32 : 4, remaining.length) }, async () => {
        while (!visualStop.current && next < remaining.length) await check(remaining[next++]);
      }));
      if (visualStop.current && provider === "jev-omni" && activePredictionKeys.size) {
        setVisualWait(tr(`Canceling ${activePredictionKeys.size} Replicate predictions…`,
          `正在取消 ${activePredictionKeys.size} 筆 Replicate 辨識…`));
        const cancellation = await Promise.all([...activePredictionKeys].map(async ([id, key]) => {
          try {
            const response = await fetch(`/api/visual-find?key=${encodeURIComponent(key)}`, { method: "DELETE" });
            const result = await response.json() as { status?: string; error?: string };
            if (!response.ok) throw new Error(result.error || `Cancellation returned ${response.status}`);
            if (result.status === "succeeded") {
              const savedResponse = await fetch(`/api/visual-find?key=${encodeURIComponent(key)}`, { cache: "no-store" });
              if (savedResponse.ok) {
                const saved = await savedResponse.json() as VisualResult;
                resultMap[id] = saved;
                if (saved.matched) found.add(id);
                setVisualResults({ ...resultMap }); setVisualMatches(new Set(found));
                setVisualChecked(Object.keys(resultMap).length + errors);
              }
            }
            if (["succeeded", "failed", "canceled", "aborted"].includes(result.status || "")) markStage(id, "stopped");
            return result.status === "canceled" ? "canceled" : ["succeeded", "failed", "aborted"].includes(result.status || "") ? "finished" : "pending";
          } catch {
            markStage(id, "error");
            return "error";
          }
        }));
        const unconfirmed = cancellation.filter((status) => status === "error" || status === "pending").length;
        const canceled = cancellation.filter((status) => status === "canceled").length;
        stopMessage = unconfirmed
          ? tr(`Stopped locally; ${unconfirmed} Replicate cancellations remain unconfirmed.`,
            `已停止本機排程；${unconfirmed} 筆 Replicate 取消尚未確認。`)
          : tr(`Stopped · ${canceled} Replicate predictions canceled; completed results kept`,
            `已停止 · ${canceled} 筆 Replicate 辨識已取消，保留完成結果`);
      }
      await persist(!visualStop.current && errors === 0 && Object.keys(resultMap).length === targetPosts.length);
      if (!visualStop.current && errors === 0 && Object.keys(resultMap).length === targetPosts.length) {
        setVisualComplete(true);
        selection.setSelected(new Set(found));
        setVisualSelection({ object, provider, coverage, ids: new Set(found) });
        if (found.size) selection.enter();
      }
    } catch (cause) {
      if (!visualStop.current) {
        setVisualErrorDetail(cause instanceof Error ? cause.message : tr("Visual check unavailable", "無法進行影像辨識"));
        setVisualErrors((count) => count + 1);
      }
    }
    setVisualWait(visualStop.current ? stopMessage || tr("Stopped · completed results saved", "已停止 · 已儲存完成的結果") : "");
    visualAbort.current = null;
    visualInFlight.current = false;
    setVisualStopping(false);
    setVisualRunning(false);
  }

  function jumpToResult(id: string) {
    const index = items.findIndex((post) => `${post.author}/${post.asset}` === id);
    if (index < 0) return;
    setVisualFilter(false);
    setExpandedDisliked((current) => current.includes(id) ? current : [...current, id]);
    setVisible((current) => Math.max(current, index + 1));
    setVisualOpen(false);
    setVisualJump(id);
  }

  useEffect(() => {
    if (!visualJump) return;
    const frame = requestAnimationFrame(() => {
      const target = document.querySelector(`[data-select-id="${CSS.escape(visualJump)}"]`);
      if (target) { target.scrollIntoView({ behavior: "smooth", block: "center" }); setVisualJump(null); }
    });
    return () => cancelAnimationFrame(frame);
  }, [visualJump, visible, visualFilter, view]);

  function setView(next: PostView) {
    if (!viewToggleCategory) return;
    if (next === "table") setBatchPlaying(false);
    try {
      window.localStorage.setItem(`collections-post-view-${viewToggleCategory}`, next);
      setFallbackView(null);
      window.dispatchEvent(new Event(viewChangeEvent));
    } catch {
      setFallbackView(next);
    }
  }

  function setGridColumns(next: number) {
    if (!viewToggleCategory) return;
    try {
      window.localStorage.setItem(`collections-post-columns-${viewToggleCategory}`, String(next));
      setFallbackColumns(null);
      window.dispatchEvent(new Event(viewChangeEvent));
    } catch {
      setFallbackColumns(next);
    }
  }

  function toggleBatchPlayback() {
    if (batchPlaying) { setBatchPlaying(false); return; }
    if (!selectedVideoCount) return;
    setVisible(items.length);
    setVisualFilter(false);
    setExpandedDisliked((current) => [...new Set([...current, ...selection.selected])]);
    if (view === "table") setView("grid");
    setBatchPlaying(true);
  }

  function searchSelectedPosts() {
    if (!selection.selected.size || visualRunning) return;
    setVisualScopeIds(new Set(selection.selected));
    setVisualMatches(null);
    setVisualResults({});
    setVisualStages({});
    setVisualChecked(0);
    setVisualComplete(false);
    setVisualOpen(true);
  }

  useEffect(() => {
    const node = sentinel.current;
    if (!node || visible >= items.length || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible((count) => Math.min(count + 48, items.length));
    }, { rootMargin: "900px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, items.length]);


  return (
    <>
      <div ref={toolbar} className="post-view-toolbar">
        <span>{items.length} {tr(items.length === 1 ? "post" : "posts", "則貼文")}</span>
        {viewToggleCategory && <button type="button" className="post-visual-trigger" aria-expanded={visualOpen} onClick={() => { setVisualScopeIds(null); setVisualOpen((open) => !open); }}>✦ {tr("Find in images", "尋找圖片中的物件")}</button>}
        {viewToggleCategory && <div role="group" aria-label={tr(`${viewToggleCategory === "kol" ? "KOL" : "Design"} post view`, `${viewToggleCategory === "kol" ? "KOL" : "設計"}貼文檢視`)}>
          <button type="button" className={view === "grid" ? "selected" : ""} aria-pressed={view === "grid"} onClick={() => setView("grid")}>▦ {tr("Grid", "網格")}</button>
          <button type="button" className={view === "table" ? "selected" : ""} aria-pressed={view === "table"} onClick={() => setView("table")}>☷ {tr("Table", "表格")}</button>
        </div>}
        {viewToggleCategory && view === "grid" && <label className="post-grid-columns" htmlFor="post-grid-columns">
          <span>{tr("Columns", "每列")} {gridColumns}</span>
          <input id="post-grid-columns" type="range" min="3" max="7" step="1" value={gridColumns}
            onChange={(event) => setGridColumns(Number(event.target.value))}
            aria-label={tr("Posts per row", "每列貼文數")} aria-valuetext={tr(`${gridColumns} posts per row`, `每列 ${gridColumns} 則貼文`)} />
        </label>}
        {items.length > 0 && <SelectToggle scope={selection} noun="post" onExit={() => { setVisualSelection(null); setBatchPlaying(false); setSelectedFirst(false); }} />}
      </div>
      {visualOpen && viewToggleCategory && <section className="post-visual-panel" aria-label={tr("Visual object finder", "視覺物件搜尋")}>
        <div className="post-visual-head"><div><small>{visualProvider === "gpt-6-luna" ? "OPENAI / GPT-6 LUNA" : "REPLICATE / JEV-OMNI"}</small><strong>{tr("Find an object in posts", "尋找貼文中的物件")}</strong></div><div className="post-visual-head-actions">
          {visualRunning && <button type="button" className="post-visual-full-stop" disabled={visualStopping} onClick={stopVisual}>{visualStopping ? tr("Stopping…", "停止中…") : tr("■ Stop all", "■ 全部停止")}</button>}
          <button type="button" aria-label={tr("Close visual finder", "關閉視覺搜尋")} onClick={() => setVisualOpen(false)}>×</button>
        </div></div>
        <p>{visualScopeIds ? tr(`Searches only the ${scopeItems.length} posts selected when you opened this panel. Matches replace the current selection when the scan finishes.`, `只搜尋開啟此面板時選取的 ${scopeItems.length} 則貼文；辨識完成後，符合的貼文會取代目前選取項目。`) : tr("Searches the posts in this view. Confirmed matches are shown and selected together.", "搜尋目前畫面中的貼文，並集中顯示及選取符合條件的貼文。")}</p>
        <div className="post-visual-scope" aria-label={tr("Current visual search scope", "目前影像搜尋範圍")}>
          <strong>{visualScopeIds ? tr(`Selected · ${scopeItems.length} posts`, `已選取 · ${scopeItems.length} 則貼文`) : tr(`Current view · ${scopeItems.length} posts`, `目前範圍 · ${scopeItems.length} 則貼文`)}</strong>
          <div className="post-visual-scope-pills">
            <span title={tr("First video frame when available; archived cover otherwise", "有首幀就辨識首幀，否則使用封面")}>{tr(`▶ Videos ${videoCount} · first frame`, `▶ 影片 ${videoCount} · 首幀`)}</span>
            <span title={tr("Archived image", "封存圖片")}>{tr(`▣ Images ${photoCount}`, `▣ 單張 ${photoCount}`)}</span>
            <span title={visualCoverage === "all-slides" ? tr("Every carousel slide from the source feed", "辨識來源資料中的每張輪播圖片") : tr("Only the archived cover or first slide", "僅辨識封存封面或第一張")}>{visualCoverage === "all-slides"
              ? tr(`▦ Carousels ${carouselPosts.length} · ${carouselSlideCount} slides`, `▦ 輪播 ${carouselPosts.length} · ${carouselSlideCount} 張全查`)
              : tr(`▦ Carousels ${carouselPosts.length} · covers only`, `▦ 輪播 ${carouselPosts.length} · 僅封面`)}</span>
          </div>
          {visualCoverage === "cover" && carouselSlideCount > carouselPosts.length && <small>{tr(`${carouselSlideCount - carouselPosts.length} later carousel slides are outside this search.`, `其餘 ${carouselSlideCount - carouselPosts.length} 張輪播圖片不在本次搜尋範圍。`)}</small>}
          {visualCoverage === "all-slides" && <small>{tr("All-slide checks need the archived source feed. An unavailable slide is reported as an error.", "輪播全查需要來源資料；若有圖片無法取得，會顯示錯誤。")}</small>}
        </div>
        {carouselPosts.length > 0 && <div className="post-visual-coverage" role="group" aria-label={tr("Carousel coverage", "輪播辨識範圍")}>
          <button type="button" aria-pressed={visualCoverage === "cover"} className={visualCoverage === "cover" ? "selected" : ""} disabled={visualRunning}
            onClick={() => { setVisualCoverage("cover"); setVisualMatches(null); setVisualResults({}); setVisualStages({}); setVisualChecked(0); setVisualComplete(false); }}>{tr("Covers only", "僅封面")}</button>
          <button type="button" aria-pressed={visualCoverage === "all-slides"} className={visualCoverage === "all-slides" ? "selected" : ""} disabled={visualRunning || visualProvider !== "gpt-6-luna"}
            title={visualProvider !== "gpt-6-luna" ? tr("Available with GPT-6 Luna", "使用 GPT-6 Luna 時可選") : undefined}
            onClick={() => { setVisualCoverage("all-slides"); setVisualMatches(null); setVisualResults({}); setVisualStages({}); setVisualChecked(0); setVisualComplete(false); }}>{tr(`All carousel slides · ${carouselSlideCount}`, `輪播全部圖片 · ${carouselSlideCount} 張`)}</button>
        </div>}
        <div className="post-visual-methods" role="group" aria-label={tr("Image check method", "影像辨識方式")}>
          {(["gpt-6-luna", "jev-omni"] as const).map((method) => <button key={method} type="button" disabled={visualRunning}
            aria-pressed={visualProvider === method} className={visualProvider === method ? "selected" : ""}
            onClick={() => { setVisualProvider(method); if (method === "jev-omni") setVisualCoverage("cover"); setVisualMatches(null); setVisualResults({}); setVisualStages({}); setVisualChecked(0); setVisualComplete(false); setVisualCached(0); setVisualErrors(0); }}>
            {method === "gpt-6-luna" ? "GPT-6 Luna" : "Jev-Omni"}</button>)}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void runVisual(); }}>
          <label htmlFor="post-visual-object">{tr("Object to find", "想找的物件")}</label>
          <div><input id="post-visual-object" value={visualObject} minLength={2} maxLength={80} disabled={visualRunning} onChange={(event) => { setVisualObject(event.target.value); setVisualMatches(null); setVisualComplete(false); setVisualCached(0); }} placeholder={tr("shoes, backpack, bicycle…", "鞋子、背包、腳踏車…")} />
            <button type="submit" disabled={visualRunning || visualObject.trim().length < 2}>{visualRunning ? tr("Checking…", "辨識中…") : tr(`Check ${scopeItems.length} posts`, `辨識 ${scopeItems.length} 則貼文`)}</button></div>
        </form>
        {(visualRunning || visualMatches || visualWait) && <div className="post-visual-progress" role="status">
          <strong>{tr(`${visualChecked}/${scopeItems.length} checked · ${visualMatches?.size ?? 0} matches`, `已辨識 ${visualChecked}/${scopeItems.length} 則 · ${visualMatches?.size ?? 0} 則符合`)}</strong>
          {visualPending > 0 && <span>{visualProvider === "gpt-6-luna" ? tr(`${visualPending} running on GPT-6 Luna`, `${visualPending} 則正在由 GPT-6 Luna 辨識`) : tr(`${visualPending} queued or running on Replicate · a cold start can take a few minutes`, `${visualPending} 則已送至 Replicate，正在排隊或辨識 · 初次啟動可能需數分鐘`)}</span>}
          {visualCached > 0 && <span>{tr(`${visualCached} saved results reused`, `重用 ${visualCached} 筆已儲存結果`)}</span>}
          {visualComplete && <span>{visualScopeIds ? tr("Selected scan saved", "已選貼文辨識已儲存") : tr("Full scan saved", "完整辨識已儲存")}</span>}
          {visualErrors > 0 && <span title={visualErrorDetail}>{tr(`${visualErrors} unavailable`, `${visualErrors} 則無法辨識`)} · {visualErrorDetail}</span>}
          {visualWait && <span>{visualWait}</span>}
          {visualRunning && <span>{tr(`${Math.max(0, scopeItems.length - visualChecked - activeStages.length)} waiting locally`, `${Math.max(0, scopeItems.length - visualChecked - activeStages.length)} 則等待本機排程`)}</span>}
          {!visualRunning && visualMatches && <button type="button" onClick={() => setVisualFilter((current) => !current)}>{visualFilter ? tr("Show all posts", "顯示所有貼文") : tr("Show matches", "顯示符合貼文")}</button>}
        </div>}
        {displayStages.length > 0 && <div className="post-visual-stages" aria-label={tr("Visual check stages", "辨識階段")}>
          {displayStages.map(([id, state]) => {
            const queuedSeconds = state.queueSeconds ?? (state.stage === "replicate_starting" && state.replicateCreatedAt
              ? Math.max(0, (visualNow - Date.parse(state.replicateCreatedAt)) / 1000) : null);
            return <div className="post-visual-stage" key={id}>
              <strong>@{id.split("/")[0]} · <AssetName asset={id.split("/").slice(1).join("/")} /></strong>
              <span>{tr(...(stageLabels[state.stage] ?? [state.stage, state.stage]))}{state.slideTotal && state.slideTotal > 1 ? ` · ${state.slideIndex ?? 0}/${state.slideTotal}` : ""} · {Math.max(0, Math.floor((visualNow - state.enteredAt) / 1000))}s</span>
              <small>{[
                state.kind === "video" ? tr("Video", "影片") : state.kind ? tr("Image", "圖片") : null,
                state.frameCache === "hit" ? tr("First-frame cache hit", "首幀快取命中") : state.frameCache === "miss" ? tr("First-frame cache miss", "無首幀快取") : null,
                state.source === "poster fallback" ? tr("Using cover", "使用封面") : state.source === "first frame" ? tr("Using first frame", "使用首幀") : null,
                state.mediaMs != null ? `${tr("Media", "載入畫面")} ${seconds(state.mediaMs)}` : null,
                state.prepareMs != null ? `${tr("Prepare", "圖片處理")} ${seconds(state.prepareMs)}` : null,
                state.cacheMs != null ? `${tr("Cache", "辨識快取")} ${seconds(state.cacheMs)}` : null,
                state.submitMs != null ? `${visualProvider === "gpt-6-luna" ? tr("OpenAI response", "OpenAI 回應") : tr("Replicate submit", "Replicate 提交")} ${seconds(state.submitMs)}` : null,
                visualProvider === "jev-omni" && queuedSeconds != null ? `${tr("Replicate queue", "Replicate 排隊")} ${queuedSeconds.toFixed(1)}s` : null,
                visualProvider === "jev-omni" && state.predictSeconds != null ? `${tr("Inference", "模型推論")} ${state.predictSeconds.toFixed(1)}s` : null,
              ].filter(Boolean).join(" · ")}</small>
            </div>;
          })}
        </div>}
        {visualMatches && visualMatches.size > 0 && <ul className="post-visual-results" aria-label={tr("Visual matches", "視覺搜尋結果")}>
          {scopeItems.filter((post) => visualMatches.has(`${post.author}/${post.asset}`)).map((post) => {
            const result = visualResults[`${post.author}/${post.asset}`];
              return <li key={`${post.author}/${post.asset}`}><button type="button" onClick={() => jumpToResult(`${post.author}/${post.asset}`)}>@{post.author} · <AssetName asset={post.asset} /></button>
              <span>{result?.probability == null ? tr("Match", "符合") : `${Math.round(result.probability * 100)}%`} · {result?.source}{result?.cache === "hit" ? ` · ${tr("saved", "已快取")}` : ""}</span></li>;
          })}
        </ul>}
        <small>{visualProvider === "gpt-6-luna"
          ? tr("GPT-6 Luna makes a yes/no decision from visible pixels. Video checks use the first frame when available, otherwise the archived cover. Requests back off on rate limits.", "GPT-6 Luna 依畫面可見內容判斷是否有該物件。影片優先使用第一個畫面，否則使用已封存的封面；遇到速率限制時會等待重試。")
          : tr("Jev-Omni checks visible pixels. A match needs at least 75% yes probability. Video checks use the first frame when a local video is available; otherwise the archived poster is used. Requests retry if Replicate reports a rate limit.", "Jev-Omni 只辨識可見畫面；符合條件需有至少 75% 的「是」機率。影片有本機檔案時使用第一個畫面，否則使用已封存的預覽圖。若 Replicate 回報速率限制，系統會等待後重試。")}</small>
      </section>}
      {error && <p className="annotation-error" role="status">{error}</p>}
      {collapsed.length > 0 && <section className="disliked-posts-tray" aria-label={tr("Collapsed disliked posts", "已收合的略過貼文")}>
        <strong>{tr(`${collapsed.length} disliked ${collapsed.length === 1 ? "post" : "posts"} collapsed`, `已收合 ${collapsed.length} 則略過的貼文`)}</strong>
        <div>{collapsed.map((post) => {
          const id = `${post.author}/${post.asset}`;
          return <article key={id} className="disliked-post-row">
            <Image src={post.poster} alt="" width={40} height={52} unoptimized loading="lazy" />
            <span><strong>{post.authorName}</strong><small>{post.date} · <AssetName asset={post.asset} /></small></span>
            <Link href={post.href} prefetch={false}>{tr("View ↗", "查看 ↗")}</Link>
            <button type="button" onClick={() => setExpandedDisliked((current) => [...current, id])}>{tr("Expand", "展開")}</button>
            <button type="button" disabled={pending[id]} onClick={() => void vote(post, -1)}>{tr("Undo dislike", "取消略過")}</button>
          </article>;
        })}</div>
      </section>}
      {items.length === 0 ? <div className="empty-state">{emptyMessage || tr("No matching 2026 posts in the collected first page.", "收藏的首頁沒有符合條件的 2026 年貼文。")}</div> : visualFilter && active.length === 0 ?
        <div className="empty-state">{tr(`No posts matched “${visualObject.trim()}”.`, `沒有貼文符合「${visualObject.trim()}」。`)} {visualErrors ? tr(`${visualErrors} could not be checked.`, `${visualErrors} 則無法辨識。`) : ""} {tr("Try another object or show all posts.", "請試試其他物件，或顯示所有貼文。")}</div> : <SelectionArea scope={displaySelection}>{view === "table" ?
        <div className="post-table-scroll" role="region" aria-label={tr(`${viewToggleCategory === "kol" ? "KOL" : "Design"} posts table`, `${viewToggleCategory === "kol" ? "KOL" : "設計"}貼文表格`)} tabIndex={0}>
          <table className={`post-table${viewToggleCategory === "kol" ? " has-engagement" : ""}`}>
            <thead><tr><th scope="col">{tr("Preview", "預覽")}</th><th scope="col">{tr("Creator", "創作者")}</th><th scope="col">{tr("Asset", "素材")}</th><th scope="col">{tr("Date", "日期")}</th><th scope="col">{tr("Type", "類型")}</th>{viewToggleCategory === "kol" && <th scope="col">Instagram</th>}<th scope="col">{tr("Actions", "操作")}</th></tr></thead>
            <tbody>{active.map((post) => {
              const id = `${post.author}/${post.asset}`;
              return <PostTableRow key={id} post={post} filter={filter} annotation={annotations[id]} pending={pending[id]} onVote={vote} favoriteActions={favoriteActions} visualLabels={visualLabels[id]} />;
            })}</tbody>
          </table>
        </div> : <div className="post-grid adjustable" style={{ "--post-grid-columns": gridColumns } as CSSProperties}>{active.map((post) => {
        const id = `${post.author}/${post.asset}`;
        return <PostCard key={id} post={post} showAuthor={showAuthor} filter={filter} annotation={annotations[id]} pending={pending[id]} onVote={vote} renderExtra={renderExtra} favoriteActions={favoriteActions} visualLabels={visualLabels[id]} batchPlay={batchPlaying && selection.selecting && selection.selected.has(id)}
          onCollapseDisliked={collapseDisliked ? () => setExpandedDisliked((current) => current.filter((item) => item !== id)) : undefined} />;
      })}</div>}</SelectionArea>}
      <SelectionBar scope={selection} noun="post" className="post-selection-bar" actions={<>
        <button type="button" className="selection-sort-first" aria-pressed={selectedFirstActive} disabled={!selection.selected.size}
          onClick={() => { setSelectedFirst((current) => !current); if (!selectedFirstActive) toolbar.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
          {selectedFirstActive ? tr("Restore order", "恢復順序") : tr("Selected first", "已選置頂")}
        </button>
        <button type="button" onClick={searchSelectedPosts} disabled={!viewToggleCategory || !selection.selected.size || visualRunning}>✦ {tr(`Find in ${selection.selected.size} selected`, `搜尋已選 ${selection.selected.size} 則`)}</button>
        <button type="button" className="selection-batch-play" onClick={toggleBatchPlayback} disabled={!batchPlaying && selectedVideoCount === 0} aria-pressed={batchPlaying}>
          {batchPlaying ? tr("■ Stop videos", "■ 停止播放") : selectedVideoCount ? tr(`▶ Play ${selectedVideoCount} videos muted`, `▶ 靜音播放 ${selectedVideoCount} 則影片`) : tr("Select videos to play", "選取影片以播放")}
        </button>
      </>} origin={visualSelection && <>{visualSelection.provider === "gpt-6-luna" ? "GPT-6 Luna" : "Jev-Omni"} · {tr("Matched", "符合")}「{visualSelection.object}」{visualSelection.coverage === "all-slides" ? ` · ${tr("All carousel slides", "輪播全查")}` : ""}{selection.selected.size !== visualSelection.ids.size || [...selection.selected].some((id) => !visualSelection.ids.has(id)) ? ` · ${tr("Selection edited", "選取已調整")}` : ""}</>} onExit={() => { setVisualSelection(null); setBatchPlaying(false); setSelectedFirst(false); }} />
      {visible < items.length && (
        <div ref={sentinel} className="load-more">
          <button type="button" onClick={() => setVisible((count) => Math.min(count + 48, items.length))}>{tr(`Load more · ${items.length - visible} remaining`, `載入更多 · 剩餘 ${items.length - visible} 則`)}</button>
        </div>
      )}
    </>
  );
}
