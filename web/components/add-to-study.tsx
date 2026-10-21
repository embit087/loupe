"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CollectionCategory } from "@/lib/atlas";
import type { CustomStudy } from "@/lib/custom-lab";
import { useI18n } from "@/lib/i18n";

type ArchiveKind = "post" | "caption" | "poster" | "video" | "audio" | "frame" | "transcript" | "ocr";
type ArchiveSource = { category: CollectionCategory; author: string; asset: string; kind: ArchiveKind; frameId?: string };
type TopicSource = { category: "topics"; topicItemId: string; title: string; kind: "article" };
type Source = ArchiveSource | TopicSource;
type Picker = { source: Source; trigger: HTMLElement };
const StudyPickerContext = createContext<(source: Source, trigger: HTMLElement) => void>(() => {});

export function AddToStudyButton({ category, author, asset, kind, frameId, className = "", explanation }: ArchiveSource & { className?: string; explanation?: string }) {
  const { tr } = useI18n();
  const open = useContext(StudyPickerContext);
  const explanationId = useId();
  const label = kind === "frame" ? tr(`frame ${frameId}`, `第 ${frameId} 個畫面`) : kind === "post" ? tr("post", "貼文") : kind === "ocr" ? tr("OCR results", "OCR 結果") : kind === "caption" ? tr("caption", "說明文字") : kind === "transcript" ? tr("transcript", "逐字稿") : kind === "poster" ? tr("poster", "預覽圖") : kind === "video" ? tr("video", "影片") : kind === "audio" ? tr("audio", "音訊") : kind;
  return <button type="button" data-lab-feature className={`add-to-study-button ${className}`} title={explanation ? undefined : tr(`Add ${label} to a study`, `將${label}加入研究`)}
    aria-label={tr(`Add ${label} from @${author} to a study`, `將 @${author} 的${label}加入研究`)} aria-describedby={explanation ? explanationId : undefined}
    onClick={(event) => open({ category, author, asset, kind, frameId }, event.currentTarget)}>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H17a2 2 0 0 1 2 2v14H6.5A2.5 2.5 0 0 0 4 21V5.5Z" />
      <path d="M4 21a2 2 0 0 1 2-2h13M12 7v7M8.5 10.5h7" />
    </svg>
    {explanation && <span id={explanationId} role="tooltip" className="add-to-study-explanation">{explanation}</span>}
  </button>;
}

export function AddTopicToStudyButton({ topicItemId, title, className = "" }: { topicItemId: string; title: string; className?: string }) {
  const { tr } = useI18n();
  const open = useContext(StudyPickerContext);
  return <button type="button" data-lab-feature className={`add-to-study-button ${className}`} title={tr("Add this source to a Topics study", "將此來源加入新聞研究")}
    aria-label={tr(`Add ${title} to a Topics study`, `將「${title}」加入新聞研究`)}
    onClick={(event) => open({ category: "topics", topicItemId, title, kind: "article" }, event.currentTarget)}>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H17a2 2 0 0 1 2 2v14H6.5A2.5 2.5 0 0 0 4 21V5.5Z" />
      <path d="M4 21a2 2 0 0 1 2-2h13M12 7v7M8.5 10.5h7" />
    </svg>
  </button>;
}

export function AddToStudyProvider({ children }: { children: ReactNode }) {
  const { tr } = useI18n();
  const [picker, setPicker] = useState<Picker | null>(null);
  const [studies, setStudies] = useState<CustomStudy[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ title: string; id: string; category: Source["category"] } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  function close() {
    const trigger = picker?.trigger;
    setPicker(null);
    trigger?.focus();
  }

  useEffect(() => {
    if (!picker) return;
    const controller = new AbortController();
    fetch(`/api/custom-studies?category=${picker.source.category}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.studies)) throw new Error(result.error || "Studies unavailable");
        setStudies(result.studies);
      })
      .catch((cause) => { if (cause?.name !== "AbortError") setError(cause instanceof Error ? cause.message : "Studies unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    closeRef.current?.focus();
    return () => controller.abort();
  }, [picker]);

  useEffect(() => {
    if (!picker) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setPicker(null); picker?.trigger.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [picker]);

  async function attach(study: CustomStudy) {
    if (!picker || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/custom-study-assets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyId: study.id, ...picker.source }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not add asset");
      setSuccess({ title: study.title, id: study.id, category: study.category });
      window.dispatchEvent(new Event("collections-custom-studies-changed"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add asset");
    } finally {
      setBusy(false);
    }
  }

  async function createAndAttach() {
    if (!picker || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/custom-studies", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: picker.source.category, title: newTitle.trim() || "Untitled study" }),
      });
      const result = await response.json();
      if (!response.ok || !result.study?.id) throw new Error(result.error || "Could not create study");
      const study = result.study as CustomStudy;
      setStudies((current) => [study, ...current]);
      const assetResponse = await fetch("/api/custom-study-assets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyId: study.id, ...picker.source }),
      });
      const assetResult = await assetResponse.json();
      if (!assetResponse.ok) throw new Error(`${assetResult.error || "Could not add asset"}. The new study was created; open it to retry.`);
      setSuccess({ title: study.title, id: study.id, category: study.category });
      setNewTitle("");
      window.dispatchEvent(new Event("collections-custom-studies-changed"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create study");
    } finally {
      setBusy(false);
    }
  }

  return <StudyPickerContext.Provider value={(source, trigger) => {
    setStudies([]);
    setLoading(true);
    setError("");
    setSuccess(null);
    setNewTitle("");
    setPicker({ source, trigger });
  }}>
    {children}
    {picker && createPortal(<div className="study-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="study-picker" role="dialog" aria-modal="true" aria-labelledby="study-picker-heading">
        <header><div><p className="eyebrow">{tr("Add to study", "加入研究")} / {picker.source.category}</p><h2 id="study-picker-heading">{tr("Choose a study", "選擇研究")}</h2></div>
          <button ref={closeRef} type="button" className="study-picker-close" onClick={close} aria-label={tr("Close study picker", "關閉研究選擇器")}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5.5 5.5 9 9m0-9-9 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></button></header>
        <p className="study-picker-source">{picker.source.category === "topics"
          ? tr(`Source article · ${picker.source.title}`, `來源報導 · ${picker.source.title}`)
          : `${picker.source.kind === "frame" ? tr(`Frame ${picker.source.frameId}`, `畫面 ${picker.source.frameId}`) : tr(picker.source.kind, ({ post: "貼文", caption: "說明文字", poster: "預覽圖", video: "影片", audio: "音訊", transcript: "逐字稿", ocr: "OCR 結果" } as Record<string, string>)[picker.source.kind] ?? picker.source.kind)} · @${picker.source.author} / ${picker.source.asset}`}</p>
        {error && <p className="custom-study-error" role="alert">{error}</p>}
        {success ? <div className="study-picker-success" role="status"><strong>{tr(`Added to ${success.title}.`, `已加入「${success.title}」。`)}</strong>
          <Link href={success.category === "topics" ? `/topics/studies/${success.id}` : `/exp-lab/studies/${success.id}`} onClick={() => setPicker(null)}>{tr("Open study ↗", "開啟研究 ↗")}</Link></div> : <>
          <div className="study-picker-list" aria-label={tr("Open studies", "進行中的研究")}>
            {loading && <p className="custom-study-muted">{tr("Loading studies…", "正在載入研究…")}</p>}
            {!loading && studies.length === 0 && <p className="custom-study-muted">{tr("No studies yet in this collection.", "此收藏尚無研究。")}</p>}
            {studies.map((study) => <button type="button" key={study.id} disabled={busy} onClick={() => void attach(study)}>
              <span><strong>{study.title}</strong><small>{study.assetCount ?? 0} {tr((study.assetCount ?? 0) === 1 ? "asset" : "assets", "項素材")}</small></span><svg className="study-picker-plus" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
            </button>)}
          </div>
          <form className="study-picker-create" onSubmit={(event) => { event.preventDefault(); void createAndAttach(); }}>
            <label htmlFor="study-picker-title">{tr("Or create a new study", "或建立新研究")}</label>
            <div><input id="study-picker-title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} maxLength={120} placeholder={tr("Untitled study", "未命名研究")} disabled={busy} />
              <button type="submit" disabled={busy}>{busy ? tr("Saving…", "儲存中…") : tr("Create and add", "建立並加入")}</button></div>
          </form>
        </>}
      </section>
    </div>, document.body)}
  </StudyPickerContext.Provider>;
}
