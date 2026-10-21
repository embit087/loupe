"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CustomStudyDetail, DisplayAsset } from "@/lib/custom-lab";
import { formatTimestamp } from "@/lib/experiment-lab";
import { AssetName } from "@/components/asset-name";
import { SelectToggle, SelectionArea, SelectionBar, useSelectionScope } from "@/components/selection-scope";
import { useI18n } from "@/lib/i18n";

type CatalogPost = {
  author: string; asset: string; authorName: string; kind: string; date: string; poster: string;
  title: string; caption: string; video: string; transcriptPreview: string; ocrPreview: string[];
  hasCaption: boolean; hasPoster: boolean; hasVideo: boolean; hasTranscript: boolean; hasOcr: boolean;
  frames: { id: string; uid: string; sourceFrame: number; timeSeconds: number; image: string }[];
};
type TopicSource = { id: string; url: string; title: string; summary: string; topic: string; publishedAt: string | null; note: string };
type PickerTab = "archive" | "text" | "url" | "upload";

// Catalog dates arrive as YYYYMMDD; show them the way the rest of the archive does.
const dotDate = (value: string) => /^\d{8}$/.test(value) ? `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6)}` : value;

const poeticNouns = ["Ember", "Moonlight", "River", "Lantern", "Meadow", "Starlight", "Willow", "Wildflower", "Tide", "Moss", "Rain", "Horizon"];
const wisdomWords = ["Wisdom", "Insight", "Clarity", "Wonder", "Patience", "Knowing", "Truth", "Reflection", "Curiosity", "Stillness"];
const animals = ["Fox", "Otter", "Owl", "Crane", "Hare", "Heron", "Lynx", "Wren", "Moth", "Badger", "Kestrel", "Deer"];

function randomStudyTitle(current: string) {
  let next = current;
  while (next === current) {
    const pick = (words: string[]) => words[Math.floor(Math.random() * words.length)];
    // One hyphenated, all-caps token such as EMBER-CLARITY-OWL: no spaces or separators.
    next = [pick(poeticNouns), pick(wisdomWords), pick(animals)].join("-").toUpperCase();
  }
  return next;
}

function UploadedText({ src }: { src: string }) {
  const { tr } = useI18n();
  const [content, setContent] = useState("Loading text…");
  useEffect(() => {
    let active = true;
    fetch(src).then(async (response) => {
      if (!response.ok) throw new Error("Text unavailable");
      return response.text();
    }).then((text) => { if (active) setContent(text); })
      .catch(() => { if (active) setContent("Text preview unavailable. Open the source file to inspect it."); });
    return () => { active = false; };
  }, [src]);
  return <pre className="custom-asset-text">{content === "Loading text…" ? tr(content, "正在載入文字…") : content === "Text preview unavailable. Open the source file to inspect it." ? tr(content, "無法預覽文字，請開啟來源檔案查看。") : content}</pre>;
}

function AssetBody({ asset }: { asset: DisplayAsset }) {
  const { tr } = useI18n();
  if (asset.kind === "article") return <p className="custom-asset-article-summary">{asset.text || tr("Saved news source.", "已收藏的新聞來源。")}</p>;
  if (asset.kind === "post") return <div className="custom-asset-post">
    {asset.poster && <Image src={asset.poster} alt={tr("Collected post cover", "收藏貼文封面")} width={100} height={130} unoptimized />}
    <p>{tr("The collected post is attached as a source. Open it to inspect its original caption and media.", "收藏貼文已附為來源。開啟後可查看原始文字與媒體。")}</p>
  </div>;
  if (asset.kind === "transcript" && asset.transcript) return <details className="custom-asset-details">
    <summary>{asset.transcript.length} {tr("timed speech passages", "段定時語音內容")}</summary>
    <ol>{asset.transcript.map((passage, index) => <li key={index}><time>{formatTimestamp(passage.startSeconds)}–{formatTimestamp(passage.endSeconds)}</time><span>{passage.text}</span></li>)}</ol>
  </details>;
  if (asset.kind === "ocr" && asset.ocrSamples) return <details className="custom-asset-details">
    <summary>{asset.ocrSamples.length} {tr("timed OCR samples", "個定時 OCR 樣本")}</summary>
    <ol>{asset.ocrSamples.map((sample, index) => <li key={index}><time>{formatTimestamp(sample.timeSeconds)}</time><span>{sample.strings.length ? sample.strings.join(" · ") : tr("No text detected", "未偵測到文字")}</span></li>)}</ol>
  </details>;
  if (asset.mediaUrl && asset.objectKey && (asset.kind === "transcript" || asset.kind === "ocr" || asset.kind === "file"))
    return <UploadedText src={asset.mediaUrl} />;
  if (asset.text) return <pre className="custom-asset-text">{asset.text}</pre>;
  if (asset.mediaUrl && (asset.kind === "poster" || asset.kind === "frame" || asset.kind === "image"))
    return <Image className="custom-asset-image" src={asset.mediaUrl} alt={asset.label} width={640} height={720} sizes="(max-width: 760px) 100vw, 480px" unoptimized />;
  if (asset.mediaUrl && asset.kind === "video") return <video className="custom-asset-media" src={asset.mediaUrl} poster={asset.poster} controls playsInline preload="metadata" />;
  if (asset.mediaUrl && asset.kind === "audio") return <audio className="custom-asset-audio" src={asset.mediaUrl} controls preload="metadata" />;
  if (asset.mediaUrl && asset.kind === "file") return <a className="custom-asset-file-link" href={asset.mediaUrl} target="_blank" rel="noopener noreferrer">{tr("Open file ↗", "開啟檔案 ↗")}</a>;
  return <p className="custom-study-muted">{tr("Source available through the linked post.", "可透過連結的貼文查看來源。")}</p>;
}

export function CustomStudyWorkspace({ initial }: { initial: CustomStudyDetail }) {
  const { tr } = useI18n();
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const assetSelection = useSelectionScope(`study-assets:${initial.study.id}`, detail.assets.map((asset) => asset.id));
  const [title, setTitle] = useState(initial.study.title);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tab, setTab] = useState<PickerTab>("archive");
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogPost[]>([]);
  const [topicCatalog, setTopicCatalog] = useState<TopicSource[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<TopicSource | null>(null);
  const [selected, setSelected] = useState<CatalogPost | null>(null);
  // The option previewed on the right-hand side of the picker.
  const [option, setOption] = useState("post");
  const [textKind, setTextKind] = useState("note");
  const [textValue, setTextValue] = useState("");
  const [urlKind, setUrlKind] = useState("video");
  const [urlValue, setUrlValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadKind, setUploadKind] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!pickerOpen || tab !== "archive") return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      const topics = detail.study.category === "topics";
      const params = new URLSearchParams({ category: detail.study.category, q: query });
      fetch(topics ? "/api/topics/lab" : `/api/custom-study-catalog?${params}`, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || tr("Collection unavailable", "無法取得收藏"));
          return result;
        })
        .then((result) => {
          if (topics) setTopicCatalog(((result.items ?? []) as TopicSource[]).filter((item) =>
            !query || [item.title, item.summary, item.topic, item.url].some((value) => value.toLowerCase().includes(query.toLowerCase()))));
          else setCatalog(result.items ?? []);
        })
        .catch((cause) => { if (cause?.name !== "AbortError") setError(tr("Could not search the collection", "無法搜尋收藏")); });
    }, 180);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [pickerOpen, tab, query, detail.study.category, tr]);

  async function refresh() {
    const response = await fetch(`/api/custom-studies?id=${detail.study.id}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || tr("Could not refresh study", "無法更新研究內容"));
    setDetail(result);
  }

  async function mutate(action: () => Promise<string>): Promise<boolean> {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await action();
      await refresh();
      setMessage(result);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Could not update study", "無法更新研究"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveTitle() {
    if (!title.trim() || title.trim() === detail.study.title) return;
    await mutate(async () => {
      const response = await fetch("/api/custom-studies", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: detail.study.id, title: title.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || tr("Could not rename study", "無法重新命名研究"));
      router.refresh();
      return tr("Study title saved.", "研究標題已儲存。");
    });
  }

  async function addAsset(input: Record<string, unknown>): Promise<boolean> {
    return mutate(async () => {
      const response = await fetch("/api/custom-study-assets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyId: detail.study.id, ...input }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || tr("Could not add asset", "無法加入素材"));
      return tr("Asset added to study.", "素材已加入研究。");
    });
  }

  async function removeAsset(id: string) {
    await mutate(async () => {
      const response = await fetch("/api/custom-study-assets", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyId: detail.study.id, id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || tr("Could not remove asset", "無法移除素材"));
      return tr("Asset removed from study.", "素材已從研究中移除。");
    });
  }

  async function uploadFiles() {
    if (files.length === 0) return;
    await mutate(async () => {
      for (const file of files) {
        const form = new FormData();
        form.set("studyId", detail.study.id);
        form.set("file", file);
        form.set("assetKind", uploadKind);
        const response = await fetch("/api/custom-study-uploads", { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(`${file.name}: ${result.error || tr("upload failed", "上傳失敗")}`);
      }
      setFiles([]);
      return tr("Files uploaded and added to study.", "檔案已上傳並加入研究。");
    });
  }

  const archiveOptions = selected ? [
    { kind: "post", label: tr("Collected post", "收藏貼文"), available: true },
    { kind: "caption", label: tr("Post wording", "貼文文字"), available: selected.hasCaption },
    { kind: "poster", label: tr("Cover image", "封面圖片"), available: selected.hasPoster },
    { kind: "video", label: tr("Source video", "原始影片"), available: selected.hasVideo },
    { kind: "audio", label: tr("Audio track", "音訊"), available: selected.hasVideo },
    { kind: "transcript", label: tr("Transcript", "逐字稿"), available: selected.hasTranscript },
    { kind: "ocr", label: tr("OCR results", "OCR 結果"), available: selected.hasOcr },
  ].filter((option) => option.available) : [];

  return <>
    <div className="asset-heading custom-study-heading">
      <div><p className="eyebrow">{tr("Open", "進行中")} {detail.study.category} {tr("study / shared workspace", "研究／共用工作區")}</p><h1>{detail.study.title}</h1></div>
      <span className="lab-study-count">{detail.assets.length} {tr(detail.assets.length === 1 ? "ASSET" : "ASSETS", "項素材")}</span>
    </div>
    <div className="custom-study-toolbar">
      <div className="custom-study-title-control">
        <label htmlFor="custom-study-title">{tr("Study title", "研究標題")}</label>
        <div className="custom-study-title-field">
          <input id="custom-study-title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.currentTarget.blur(); } }} />
          <button type="button" className="custom-study-title-generate" disabled={busy} aria-label={tr("Generate a random study title", "產生隨機研究標題")} aria-describedby="custom-study-title-tip"
            onClick={() => setTitle(randomStudyTitle(title))}>
            <span aria-hidden="true">✦</span>
            <span id="custom-study-title-tip" role="tooltip" className="custom-study-title-tip">{tr("Random title: nature word, quality and animal, joined by hyphens in capitals, e.g. EMBER-CLARITY-OWL. Click again for another; Save title keeps it.", "隨機標題由自然詞、特質與動物組成，例如 EMBER-CLARITY-OWL。可再次點選重新產生，按「儲存標題」即可保留。")}</span>
          </button>
        </div>
      </div>
      <button type="button" disabled={busy || !title.trim() || title.trim() === detail.study.title} onClick={() => void saveTitle()}>{tr("Save title", "儲存標題")}</button>
      <button type="button" className="custom-study-add" aria-expanded={pickerOpen} onClick={() => { setPickerOpen(!pickerOpen); setError(""); }}>
        {pickerOpen ? tr("Close asset picker", "關閉素材選擇器") : tr("+ Add assets", "＋加入素材")}
      </button>
    </div>
    {error && <p className="custom-study-error" role="alert">{error}</p>}
    {message && <p className="custom-study-success" role="status">{message}</p>}

    {pickerOpen && <section className="custom-asset-picker" aria-label={tr("Add assets to study", "將素材加入研究")}>
      <div className="custom-picker-tabs" role="tablist" aria-label={tr("Asset source", "素材來源")}>
        {(["archive", "text", "url", "upload"] as PickerTab[]).map((name) => <button key={name} type="button" role="tab"
          aria-selected={tab === name} className={tab === name ? "selected" : ""} onClick={() => setTab(name)}>
          {name === "archive" ? tr("Collection", "收藏") : name === "text" ? tr("Paste text", "貼上文字") : name === "url" ? tr("Media URL", "媒體網址") : tr("Upload file", "上傳檔案")}
        </button>)}
      </div>
      {tab === "archive" && detail.study.category === "topics" && <div className="custom-picker-archive">
        <label className="custom-picker-search">{tr("Find a saved Topics source", "尋找已收藏的新聞來源")} <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setSelectedTopic(null); }} placeholder={tr("Headline, topic, or source", "標題、主題或來源")} /></label>
        <div className="custom-picker-posts" aria-label={tr("Saved Topics sources", "已收藏的新聞來源")}>
          {topicCatalog.map((item) => <button key={item.id} type="button" className={selectedTopic?.id === item.id ? "selected" : ""} onClick={() => setSelectedTopic(item)}>
            <span><strong>{item.title}</strong><small>{item.topic.replaceAll("-", " ")} · {item.publishedAt?.slice(0, 10) ?? tr("date unlisted", "日期未列出")}</small></span>
          </button>)}
          {topicCatalog.length === 0 && <p className="custom-study-muted">{tr("No saved sources match.", "找不到符合條件的已收藏來源。")} <Link href="/topics">{tr("Browse news to collect material ↗", "瀏覽新聞並收藏素材 ↗")}</Link></p>}
        </div>
        {selectedTopic && <div className="custom-picker-options">
          <div><p className="eyebrow">{tr("Saved news source", "已收藏新聞來源")}</p><strong>{selectedTopic.title}</strong></div>
          <p>{selectedTopic.summary}</p>
          <div className="custom-picker-pills">
            <button type="button" disabled={busy} onClick={() => void addAsset({ kind: "article", topicItemId: selectedTopic.id })}>{tr("+ Add source article", "＋加入來源報導")}</button>
            {selectedTopic.note.trim() && <button type="button" disabled={busy} onClick={() => void addAsset({ kind: "note", textContent: selectedTopic.note })}>{tr("+ Add working note", "＋加入研究筆記")}</button>}
          </div>
        </div>}
      </div>}
      {tab === "archive" && detail.study.category !== "topics" && <div className="custom-picker-archive custom-picker-split">
        <div className="custom-picker-list">
          <label className="custom-picker-search">{tr("Find a collected post", "尋找收藏貼文")} <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} placeholder={tr("Creator, caption, or post", "創作者、貼文文字或貼文")} /></label>
          <div className="custom-picker-posts" aria-label={tr("Matching posts", "符合條件的貼文")}>
            {catalog.map((post) => <button key={`${post.author}/${post.asset}`} type="button" aria-pressed={selected?.author === post.author && selected.asset === post.asset}
              className={selected?.author === post.author && selected.asset === post.asset ? "selected" : ""}
              onClick={() => { setSelected(post); setOption("post"); }}>
              <Image src={post.poster} alt="" width={42} height={54} unoptimized />
              <span><strong>{post.title}</strong><small>@{post.author} · {dotDate(post.date)}</small></span>
              <AssetName asset={post.asset} />
            </button>)}
            {catalog.length === 0 && <p className="custom-study-muted">{tr("No matching posts.", "找不到符合條件的貼文。")}</p>}
          </div>
        </div>
        <div className="custom-picker-preview" aria-live="polite">
          {!selected ? <p className="custom-picker-empty">{tr("Choose a post to preview what you can add from it.", "選擇貼文以預覽可加入的素材。")}</p> : <>
            <div className="custom-picker-preview-head">
              <p className="eyebrow">@{selected.author} · {dotDate(selected.date)}</p>
              <strong>{selected.title}</strong>
              <AssetName asset={selected.asset} />
            </div>
            <div className="custom-picker-option-tabs" role="tablist" aria-label={tr("What to add", "選擇加入內容")}>
              {[...archiveOptions, ...(selected.frames.length ? [{ kind: "frames", label: tr(`Frames · ${selected.frames.length}`, `畫面 · ${selected.frames.length}`), available: true }] : [])].map((item) =>
                <button key={item.kind} type="button" role="tab" aria-selected={option === item.kind} className={option === item.kind ? "selected" : ""} onClick={() => setOption(item.kind)}>{item.label}</button>)}
            </div>
            <div className="custom-picker-option-panel" role="tabpanel">
              {option === "post" && <div className="custom-picker-post-preview">
                <Image src={selected.poster} alt="" width={160} height={200} unoptimized />
                <div><strong>{selected.title}</strong><p>{selected.authorName} · @{selected.author}</p><p>{selected.kind} · {dotDate(selected.date)}</p><p className="custom-study-muted">{tr("Adds a reference to the whole post, linking back to its page.", "加入整則貼文的參照，並連回貼文頁面。")}</p></div>
              </div>}
              {option === "caption" && <p className="custom-picker-text">{selected.caption}</p>}
              {option === "poster" && <Image className="custom-picker-media" src={selected.poster} alt={`Cover image of ${selected.title}`} width={480} height={600} unoptimized />}
              {option === "video" && <video className="custom-picker-media" src={selected.video} poster={selected.poster} controls playsInline preload="metadata" />}
              {option === "audio" && <div className="custom-picker-audio"><Image src={selected.poster} alt="" width={64} height={80} unoptimized /><div><p className="custom-study-muted">{tr("The sound from the source video.", "原始影片的音訊。")}</p><audio src={selected.video} controls preload="metadata" /></div></div>}
              {option === "transcript" && <p className="custom-picker-text">{selected.transcriptPreview}{selected.transcriptPreview.length >= 1200 ? "…" : ""}</p>}
              {option === "ocr" && <div className="custom-picker-ocr">{selected.ocrPreview.map((text) => <span key={text}>{text}</span>)}</div>}
              {option === "frames" && <div className="custom-picker-frame-grid">{selected.frames.map((frame) => <button key={frame.uid} type="button" disabled={busy} title={frame.uid}
                onClick={() => void addAsset({ kind: "frame", author: selected.author, asset: selected.asset, frameId: frame.id })}>
                <Image src={frame.image} alt={tr(`Frame ${frame.id}`, `畫面 ${frame.id}`)} width={96} height={134} unoptimized /><span>+ {tr("Frame", "畫面")} {frame.id}<small>{formatTimestamp(frame.timeSeconds)}</small></span>
              </button>)}</div>}
            </div>
            {option !== "frames" && <button type="button" className="custom-picker-add" disabled={busy}
              onClick={() => void addAsset({ kind: option, author: selected.author, asset: selected.asset })}>
              + {tr("Add", "加入")} {archiveOptions.find((item) => item.kind === option)?.label.toLowerCase() ?? tr("item", "項目")} {tr("to study", "至研究")}
            </button>}
          </>}
        </div>
      </div>}
      {tab === "text" && <div className="custom-picker-form">
        <label>{tr("Content type", "內容類型")} <select value={textKind} onChange={(event) => setTextKind(event.target.value)}>
          <option value="note">{tr("Study note", "研究筆記")}</option><option value="transcript">{tr("Transcript", "逐字稿")}</option><option value="ocr">{tr("OCR results", "OCR 結果")}</option>
        </select></label>
        <label>{tr("Text", "文字")} <textarea value={textValue} onChange={(event) => setTextValue(event.target.value)} maxLength={100000} rows={8} placeholder={tr("Paste a transcript, OCR output, or study note", "貼上逐字稿、OCR 結果或研究筆記")} /></label>
        <button type="button" disabled={busy || !textValue.trim()} onClick={() => void addAsset({ kind: textKind, textContent: textValue }).then((saved) => { if (saved) setTextValue(""); })}>{tr("+ Add text", "＋加入文字")}</button>
      </div>}
      {tab === "url" && <div className="custom-picker-form">
        <label>{tr("Media type", "媒體類型")} <select value={urlKind} onChange={(event) => setUrlKind(event.target.value)}>
          <option value="video">{tr("Video", "影片")}</option><option value="audio">{tr("Audio", "音訊")}</option><option value="image">{tr("Image", "圖片")}</option><option value="file">{tr("Other file", "其他檔案")}</option>
        </select></label>
        <label>{tr("HTTP or HTTPS URL", "HTTP 或 HTTPS 網址")} <input type="url" value={urlValue} onChange={(event) => setUrlValue(event.target.value)} placeholder="https://…" /></label>
        <p>{tr("Links are saved as references. Upload a file to keep a copy in the study.", "連結會以參照方式儲存；若要在研究中保留副本，請上傳檔案。")}</p>
        <button type="button" disabled={busy || !urlValue.trim()} onClick={() => void addAsset({ kind: urlKind, externalUrl: urlValue }).then((saved) => { if (saved) setUrlValue(""); })}>{tr("+ Add URL", "＋加入網址")}</button>
      </div>}
      {tab === "upload" && <div className="custom-picker-form">
        <label>{tr("Text file role", "文字檔用途")} <select value={uploadKind} onChange={(event) => setUploadKind(event.target.value)}>
          <option value="auto">{tr("Detect file type", "自動辨識檔案類型")}</option><option value="transcript">{tr("Transcript", "逐字稿")}</option><option value="ocr">{tr("OCR results", "OCR 結果")}</option>
        </select></label>
        <label>{tr("Choose files", "選擇檔案")} <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,text/plain,text/markdown,text/vtt,application/json"
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>
        <p>{tr("Images, video, and audio up to 50 MB; text, VTT, and JSON up to 1 MB. Files are kept in the study asset bucket.", "圖片、影片與音訊上限 50 MB；文字、VTT 與 JSON 上限 1 MB。檔案會保存在研究素材儲存空間。")}</p>
        {files.length > 0 && <span>{files.map((file) => file.name).join(" · ")}</span>}
        <button type="button" disabled={busy || files.length === 0} onClick={() => void uploadFiles()}>{busy ? tr("Uploading…", "上傳中…") : tr(`Upload ${files.length || ""} ${files.length === 1 ? "file" : "files"}`, `上傳 ${files.length || ""} 個檔案`)}</button>
      </div>}
    </section>}

    <section className="custom-study-assets" aria-labelledby="custom-study-assets-heading">
      <div className="lab-frames-heading"><div><p className="eyebrow">{tr("Study material", "研究素材")}</p><h2 id="custom-study-assets-heading">{tr("Assets", "素材")}</h2></div>{detail.assets.length > 0 && <SelectToggle scope={assetSelection} noun={tr("asset", "素材")} />}<p>{detail.study.category === "topics" ? tr("Keep news sources and your own material together.", "將新聞來源與自備素材放在一起。") : tr("Keep source posts and processed material in one shared study.", "在同一份共用研究中整理來源貼文與處理結果。")}</p></div>
      {detail.assets.length === 0 ? <div className="custom-study-empty">{detail.study.category === "topics" ? tr("This study is blank. Add a saved news source, note, link, or upload.", "這份研究目前是空白的。可加入已收藏新聞、筆記、連結或上傳檔案。") : tr("This study is blank. Choose Add assets to attach a post, processed result, upload, or note.", "這份研究目前是空白的。按「加入素材」即可附加貼文、處理結果、檔案或筆記。")}</div>
        : <SelectionArea scope={assetSelection} dragToSelect={false}><div className="custom-study-asset-list">{detail.assets.map((asset, index) => <article key={asset.id} className="custom-study-asset" data-select-id={asset.id}>
          <header><span className="eyebrow">{String(index + 1).padStart(2, "0")} / {asset.kind}</span><strong>{asset.label}</strong>
            <button type="button" disabled={busy} onClick={() => void removeAsset(asset.id)} aria-label={tr(`Remove ${asset.label} from study`, `從研究移除 ${asset.label}`)}>{tr("Remove", "移除")}</button></header>
          <p className="custom-study-source">{asset.sourceLabel}{asset.byteSize ? ` · ${(asset.byteSize / 1024 / 1024).toFixed(1)} MB` : ""}</p>
          {asset.frameUid && <p className="custom-study-frame-id">{tr("Frame ID", "畫面 ID")} <code>{asset.frameUid}</code></p>}
          <AssetBody asset={asset} />
          {asset.href && <Link className="custom-asset-source-link" href={asset.href} target={asset.externalUrl ? "_blank" : undefined} rel={asset.externalUrl ? "noopener noreferrer" : undefined}>{tr("Open source ↗", "開啟來源 ↗")}</Link>}
        </article>)}</div></SelectionArea>}
      <SelectionBar scope={assetSelection} noun={tr("asset", "素材")} />
    </section>
  </>;
}
