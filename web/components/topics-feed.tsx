"use client";

import Link from "next/link";
import { MarkdownText } from "@/components/markdown-text";
import { apiQuery, articleLanguageName, dateLabel, dateLabelZh, hasBody, readableSummary, today, topicLabelZh, topics, validDate, type Article, type Topic } from "@/lib/topics-news";
import { CollectionLayout } from "@/components/collection-layout";
import { TopicsReaderPanel } from "@/components/topics-reader-panel";
import { TopicsProcessingPanel, type NewsProcessing, type TranslationMeter } from "@/components/topics-processing-panel";
import { SelectToggle, SelectionArea, SelectionBar, useSelectionScope } from "@/components/selection-scope";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useJevPreferences } from "@/lib/jev-preferences";
import { useI18n } from "@/lib/i18n";
import { groupConfirmedStories } from "@/lib/topic-story-groups";
import { SettingsIcon } from "@/components/settings-icon";
import { TopicsArticleImage } from "@/components/topics-article-image";

type News = { date: string; from?: string; topic: Topic; query: string; collectionKey: string; fetchedAt: string; cache: "hit" | "miss"; articles: Article[];
  processing?: NewsProcessing[]; refreshed?: boolean; newArticleIds?: string[]; missingTopics?: Topic[]; loadedOlderPages?: number[] };
type Translation = { title: string; body: string; model: "gpt-5.4-mini"; translatedAt: string; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | null };
type TranslationResult = { available: boolean; cache?: "hit" | "miss"; translation?: Translation; error?: string };
type Proposal = { pairKey: string; firstId: string; secondId: string; recommendation: "merge" | "keep"; confidence: number };
type Review = { archive: { proposals: Proposal[]; fetchedAt: string; provider: string } | null; decisions: { pairKey: string; decision: "merge" | "keep" }[] };
type StoryState = { id: string; article: Article; reaction: -1 | 0 | 1; collected: boolean; archived: boolean };
type NewsDirection = { id: string; label: string; query: string };
type DirectionProposal = { title: string; direction: string; mode: "pair" | "title" | "direction" | "polish"; sourceTitle: string; sourceDirection: string };

function Calendar({ date, from, onSelect, onRange, onClose }: { date: string; from?: string; onSelect: (date: string) => void; onRange: (from: string, to: string) => void; onClose: () => void }) {
  const { locale, tr } = useI18n();
  const [month, setMonth] = useState(date.slice(0, 7));
  const [draftFrom, setDraftFrom] = useState(from ?? date);
  const [draftTo, setDraftTo] = useState(date);
  const [archived, setArchived] = useState<Set<string>>(new Set());
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/topics/calendar?month=${month}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as { dates?: { date: string }[] } : null)
      .then((value) => { if (!controller.signal.aborted) setArchived(new Set((value?.dates ?? []).map((item) => item.date))); })
      .catch(() => {});
    return () => controller.abort();
  }, [month]);
  const first = new Date(`${month}-01T00:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Array.from({ length: offset + daysInMonth }, (_, index) => index < offset ? null : index - offset + 1);
  const move = (delta: number) => setMonth(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + delta, 1)).toISOString().slice(0, 7));
  const selectedDays = from ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1 : 0;
  return <div className="topics-calendar" role="dialog" aria-label={tr("Choose news date or range", "選擇新聞日期或範圍")} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <div className="topics-calendar-range"><strong>{tr("Read a range", "閱讀日期範圍")}</strong><div className="topics-calendar-presets">{[3, 7, 15, 30, 90].map((days) => <button key={days} type="button" aria-pressed={selectedDays === days} onClick={() => onRange(new Date(Date.parse(`${date}T00:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10), date)}>{tr(`${days} days`, `${days} 天`)}</button>)}</div>
      <form onSubmit={(event) => { event.preventDefault(); if (draftFrom <= draftTo && draftTo <= today()) onRange(draftFrom, draftTo); }}><label>{tr("From", "起始")}<input type="date" value={draftFrom} max={draftTo} onChange={(event) => setDraftFrom(event.target.value)} required /></label><label>{tr("To", "結束")}<input type="date" value={draftTo} min={draftFrom} max={today()} onChange={(event) => setDraftTo(event.target.value)} required /></label><button type="submit" disabled={!draftFrom || !draftTo || draftFrom > draftTo || draftTo > today()}>{tr("Apply", "套用")}</button></form>
    </div>
    <div className="topics-calendar-single"><strong>{tr("Or choose one day", "或選擇單日")}</strong></div>
    <div className="topics-calendar-head"><button type="button" onClick={() => move(-1)} aria-label={tr("Previous month", "上個月")}>‹</button><strong>{new Intl.DateTimeFormat(locale === "zh-Hant" ? "zh-TW" : "en", { timeZone: "UTC", month: "long", year: "numeric" }).format(first)}</strong><button type="button" onClick={() => move(1)} disabled={month >= today().slice(0, 7)} aria-label={tr("Next month", "下個月")}>›</button></div>
    <div className="topics-calendar-grid">{(locale === "zh-Hant" ? ["一", "二", "三", "四", "五", "六", "日"] : ["M", "T", "W", "T", "F", "S", "S"]).map((day, index) => <span key={`${day}${index}`} className="topics-weekday">{day}</span>)}
      {cells.map((day, index) => day === null ? <span key={`empty${index}`} /> : (() => { const value = `${month}-${String(day).padStart(2, "0")}`; return <button key={value} type="button" className={`${value === date ? "selected " : ""}${archived.has(value) ? "archived" : ""}`} title={archived.has(value) ? tr("Archived collection", "已封存的選讀") : undefined} disabled={value > today()} onClick={() => onSelect(value)}>{day}</button>; })())}
    </div>
    <div className="topics-calendar-key"><i /> {tr("Date with archived searches", "已有搜尋紀錄的日期")}</div>
    <button type="button" className="topics-calendar-today" onClick={() => onSelect(today())}>{tr("Jump to today", "跳至今天")} ↗</button>
  </div>;
}

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "source"; } };
const pathOf = (url: string) => { try { const path = new URL(url).pathname; return path.length > 46 ? `${path.slice(0, 45)}…` : path; } catch { return ""; } };
const timeOf = (article: Article, unlisted: string) => article.publishedAt ? new Date(article.publishedAt).toISOString().slice(11, 16) + " UTC" : unlisted;
const snippetOf = (article: Article) => {
  const words = readableSummary(article.summary).replace(/[#*_>`[\]()-]+/g, " ").replace(/\s+/g, " ").trim();
  const withoutTitle = words.startsWith(article.title) ? words.slice(article.title.length).trim() : words;
  return withoutTitle.length > 170 ? `${withoutTitle.slice(0, 169)}…` : withoutTitle;
};
const translationUrlFor = (article: Article, date: string, topic: string, query: string, aggregated: boolean, from?: string) =>
  `/api/topics/translation?${new URLSearchParams({ date, topic, ...(from ? { from } : {}), ...(query ? { query } : {}), id: article.id,
    ...(aggregated && article.topic ? { sourceTopic: article.topic } : {}) })}`;

function JevPanel({ archive, decisions, byId, cachedTranslations, choices, reviewing, saved, onChoice, onConfirm, onClose }: {
  archive: NonNullable<Review["archive"]>;
  decisions: Review["decisions"];
  byId: Map<string, Article>;
  cachedTranslations: Set<string>;
  choices: Record<string, "merge" | "keep">;
  reviewing: boolean;
  saved: boolean;
  onChoice: (pairKey: string, choice: "merge" | "keep") => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { tr } = useI18n();
  const panelRef = useRef<HTMLElement>(null);
  const dragStart = useRef<{ x: number; y: number; left: number; top: number; right: number; bottom: number; offsetX: number; offsetY: number } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [panelSize, setPanelSize] = useState<{ width: number; height: number } | null>(null);
  const resizeStart = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const [selectedPairKey, setSelectedPairKey] = useState(archive.proposals[0]?.pairKey ?? "");
  const [guideOpen, setGuideOpen] = useState(false);
  const savedDecision = (pairKey: string) => decisions.find((decision) => decision.pairKey === pairKey)?.decision;
  const pending = archive.proposals.filter((proposal) => !savedDecision(proposal.pairKey)).length;
  const changed = archive.proposals.some((proposal) => savedDecision(proposal.pairKey) !== choices[proposal.pairKey]);
  const selectedIndex = Math.max(0, archive.proposals.findIndex((proposal) => proposal.pairKey === selectedPairKey));
  return createPortal(<section ref={panelRef} className="topics-jev-panel topics-jev-review" role="dialog" aria-label={tr("Jev overlap review", "Jev 重複報導檢查")} style={{ transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`, ...(panelSize ? { width: panelSize.width, height: panelSize.height } : {}) }}>
    <div className="topics-jev-panel-head">
      <div><span>{tr("JEV / EDITORIAL REVIEW", "JEV／編輯檢查")}</span><h2>{tr("Check overlapping stories", "檢查重複報導")}</h2></div>
      <button type="button" className="topics-jev-info-trigger" aria-label={tr("How Jev reviews stories", "Jev 如何檢查報導")} aria-expanded={guideOpen} onClick={() => setGuideOpen((open) => !open)}>i</button>
      <button type="button" className="topics-jev-drag" aria-label={tr("Drag Jev panel", "拖曳移動 Jev 視窗")} title={tr("Drag to move panel", "拖曳移動視窗")}
        onPointerDown={(event) => { const rect = panelRef.current?.getBoundingClientRect(); if (!rect) return;
          dragStart.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, offsetX: offset.x, offsetY: offset.y };
          event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => { const start = dragStart.current; if (!start) return;
          setOffset({ x: start.offsetX + Math.max(8 - start.left, Math.min(event.clientX - start.x, window.innerWidth - start.right - 8)),
            y: start.offsetY + Math.max(8 - start.top, Math.min(event.clientY - start.y, window.innerHeight - start.bottom - 8)) }); }}
        onPointerUp={() => { dragStart.current = null; }} onPointerCancel={() => { dragStart.current = null; }}>⠿</button>
      <button type="button" onClick={onClose} aria-label={tr("Close Jev review", "關閉 Jev 檢查")}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5.5 5.5 9 9m0-9-9 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></button>
    </div>
    {guideOpen && <aside className="topics-jev-guide" aria-label={tr("Jev review guide", "Jev 檢查說明")}>
      <strong>{tr("How this review works", "檢查範圍與判斷方式")}</strong>
      <p>{tr("Only source articles in this date and topic collection are compared. Up to 12 likely pairs are shortlisted by shared title words or the same canonical URL, then ordered by that overlap.", "只比對目前日期與主題選讀紀錄中的來源報導。系統依標題共同詞或相同標準網址篩出最多 12 組候選，並按重疊程度排序。")}</p>
      <p>{tr("Jev compares each pair's original title, URL and archived summary. It recommends “same story” for the same underlying event; a shared broad topic or similar wording alone does not justify merging. The percentage is Jev's confidence in its recommendation.", "Jev 依兩篇原始標題、網址與封存摘要判斷。同一事件才建議「同一則報導」；只談相同大主題或措辭相近，仍應保留兩則。百分比是 Jev 對建議的信心。")}</p>
      <p>{tr("A cached Chinese translation is a language view of its original source, never another publisher. Separate original URLs from one site can still be compared; reports from different sites can be merged only when they cover the same event. You make the final choice and save it for this collection. A merged story retains both source links.", "本站快取的繁中譯文只是原始來源的語言檢視，不算另一家媒體。同網站的不同原始網址仍可能列為一組；不同網站也只有報導同一事件時才合併。你可逐組確認並儲存至此選讀紀錄；合併後仍保留兩篇來源連結。")}</p>
    </aside>}
    <p>{tr("Jev compares source articles. A Chinese translation cached by this site is a language view of its original article, not another publisher. Confirmed overlaps appear as one story with each original source available. Nothing changes until you save.", "Jev 比對的是來源報導。本站快取的繁中譯文只是原報導的另一種語言檢視，不算另一家媒體。確認合併後會顯示為一則報導，仍可切換各篇原始來源。儲存前不會變更列表。")}</p>
    {archive.proposals.length === 0 ? <p className="topics-jev-empty">{tr("No likely duplicates in this collection.", "此選讀紀錄沒有可能重複的報導。")}</p> : <>
      <div className="topics-jev-workspace">
        <nav className="topics-jev-pair-list" aria-label={tr("Jev article pairs", "Jev 報導配對清單")}>
          {archive.proposals.map((proposal, index) => {
            const first = byId.get(proposal.firstId);
            const second = byId.get(proposal.secondId);
            const current = savedDecision(proposal.pairKey);
            return <button key={proposal.pairKey} type="button" className={index === selectedIndex ? "selected" : ""} aria-current={index === selectedIndex ? "true" : undefined} onClick={() => setSelectedPairKey(proposal.pairKey)}>
              <small>{tr("Pair", "配對")} {String(index + 1).padStart(2, "0")} · {Math.round(proposal.confidence * 100)}% {tr("sure", "信心")}</small>
              <strong>{first?.title ?? tr("Source unavailable", "來源資料不可用")}</strong>
              <span>{second?.title ?? tr("Source unavailable", "來源資料不可用")}</span>
              <em>{current ? current === "merge" ? tr("Saved · shown once", "已儲存 · 只顯示一次") : tr("Saved · kept both", "已儲存 · 保留兩則") : tr("Needs your decision", "待你決定")}</em>
            </button>;
          })}
        </nav>
      <div className="topics-proposal-list">{archive.proposals.slice(selectedIndex, selectedIndex + 1).map((proposal) => {
        const index = selectedIndex;
        const first = byId.get(proposal.firstId);
        const second = byId.get(proposal.secondId);
        const current = savedDecision(proposal.pairKey);
        const sameSite = Boolean(first && second && hostOf(first.url) === hostOf(second.url));
        return <div key={proposal.pairKey} className="topics-proposal">
          <div className="topics-proposal-head">
            <span>{tr("Pair", "配對")} {String(index + 1).padStart(2, "0")} · Jev: {proposal.recommendation === "merge" ? tr("same story", "同一則報導") : tr("different stories", "不同報導")} · {Math.round(proposal.confidence * 100)}% {tr("sure", "信心")}</span>
            <span className={`topics-proposal-state${current ? " saved" : ""}`}>{current ? current === "merge" ? tr("Saved · shown once", "已儲存 · 只顯示一次") : tr("Saved · kept both", "已儲存 · 保留兩則") : tr("Needs your decision", "待你決定")}</span>
          </div>
          <div className="topics-proposal-sides">
            <div className="topics-proposal-relation">{sameSite ? tr("Same source site · separate original URLs, not our cached translation", "同一來源網站 · 不同原始網址，並非本站快取譯文") : tr("Different source sites · compare reporting", "不同來源網站 · 比對報導內容")}</div>
            {[first, second].map((article, side) => article ? <article key={article.id} className={side === 1 && choices[proposal.pairKey] === "merge" ? "hidden-if-merged" : ""}>
              <span>{side === 0 ? tr("Source 1", "來源 1") : tr("Source 2", "來源 2")} · {hostOf(article.url)}</span>
              <strong>{article.title}</strong>
              {cachedTranslations.has(article.id) && <small className="topics-proposal-translation">{tr("Cached Chinese translation of this source", "此來源已有本站快取的繁中譯文")}</small>}
              <small>{pathOf(article.url)} · {timeOf(article, tr("Time unlisted", "時間未列出"))}</small>
              {snippetOf(article) && <p>{snippetOf(article)}</p>}
              <a href={article.url} target="_blank" rel="noopener noreferrer">{tr("Open source ↗", "開啟來源 ↗")}</a>
            </article> : <article key={side}><span>{tr("Story no longer in this collection", "此報導已不在選讀紀錄中")}</span></article>)}
          </div>
          <div className="topics-proposal-choice" role="radiogroup" aria-label={tr(`Decision for pair ${index + 1}`, `第 ${index + 1} 組配對的決定`)}>
            <label className={choices[proposal.pairKey] === "merge" ? "selected" : ""}><input type="radio" name={proposal.pairKey} checked={choices[proposal.pairKey] === "merge"} onChange={() => onChoice(proposal.pairKey, "merge")} />{tr("Same story · show once", "同一則報導 · 只顯示一次")}</label>
            <label className={choices[proposal.pairKey] === "keep" ? "selected" : ""}><input type="radio" name={proposal.pairKey} checked={choices[proposal.pairKey] === "keep"} onChange={() => onChoice(proposal.pairKey, "keep")} />{tr("Different stories · keep both", "不同報導 · 保留兩則")}</label>
          </div>
        </div>;
      })}</div>
      </div>
      <div className="topics-jev-footer">
        <button type="button" className="topics-confirm" disabled={reviewing || (!changed && !pending)} onClick={onConfirm}>{reviewing ? tr("Saving…", "儲存中…") : pending ? tr(`Save ${archive.proposals.length} decisions`, `儲存 ${archive.proposals.length} 項決定`) : changed ? tr("Save changes", "儲存變更") : tr("All decisions saved", "所有決定已儲存")}</button>
        <span role="status">{saved && !changed && !pending ? tr("Saved. The feed now reflects these decisions.", "已儲存，列表已套用你的決定。") : pending ? tr(`${pending} of ${archive.proposals.length} not decided yet`, `${archive.proposals.length} 組中仍有 ${pending} 組待決定`) : changed ? tr("Unsaved changes", "變更尚未儲存") : ""}</span>
      </div>
    </>}
    <button type="button" className="topics-jev-resize" aria-label={tr("Resize Jev panel", "調整 Jev 視窗大小")} title={tr("Drag to resize panel", "拖曳調整視窗大小")}
      onPointerDown={(event) => { const rect = panelRef.current?.getBoundingClientRect(); if (!rect) return; resizeStart.current = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { const start = resizeStart.current; if (!start) return; setPanelSize({ width: Math.min(window.innerWidth - 24, Math.max(420, start.width + (event.clientX - start.x) * 2)), height: Math.min(window.innerHeight - 24, Math.max(360, start.height + (event.clientY - start.y) * 2)) }); }}
      onPointerUp={() => { resizeStart.current = null; }} onPointerCancel={() => { resizeStart.current = null; }}><span aria-hidden="true" /></button>
  </section>, document.body);
}

function JevThemePanel({ params, byId, onRead, onClose }: { params: string; byId: Map<string, Article>; onRead: (article: Article) => void; onClose: () => void }) {
  const { tr } = useI18n();
  const [theme, setTheme] = useState("");
  const [result, setResult] = useState<{ checked: number; cache: string; collectionCount: number; matches: { id: string; probability: number; article: Article }[] } | null>(null);
  const [scope, setScope] = useState<"all" | "current">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dragStart = useRef<{ x: number; y: number; left: number; top: number; right: number; bottom: number; offsetX: number; offsetY: number } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [panelSize, setPanelSize] = useState<{ width: number; height: number } | null>(null);
  const resizeStart = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const matches = (result?.matches ?? []).filter((item) => item.probability >= 0.75 && (scope === "all" || byId.has(item.id)));
  const currentCount = (result?.matches ?? []).filter((item) => item.probability >= 0.75 && byId.has(item.id)).length;
  async function find() {
    if (theme.trim().length < 3 || busy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch(`/api/topics/theme-match?${params}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: theme.trim() }) });
      const value = await response.json() as { checked?: number; cache?: string; collectionCount?: number; matches?: { id: string; probability: number; article: Article }[]; error?: string };
      if (!response.ok || !value.matches) throw new Error(tr("Theme search unavailable", "主題搜尋暫時無法使用"));
      setResult({ checked: value.checked ?? 0, cache: value.cache ?? "miss", collectionCount: value.collectionCount ?? 0, matches: value.matches });
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Theme search unavailable", "主題搜尋暫時無法使用")); }
    finally { setBusy(false); }
  }
  return createPortal(<><div className="topics-theme-backdrop" onMouseDown={onClose} /><section ref={panelRef} className="topics-jev-panel topics-theme-panel" role="dialog" aria-modal="true" aria-label={tr("Exact theme finder", "精確主題搜尋")} style={{ transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`, ...(panelSize ? { width: panelSize.width, height: panelSize.height } : {}) }}>
    <div className="topics-jev-panel-head"><div><span>{tr("THEME FINDER", "主題搜尋")}</span><h2>{tr("Find the precise story", "尋找精確相關報導")}</h2></div>
      <button type="button" className="topics-jev-info-trigger" aria-label={tr("How theme search works", "主題搜尋如何運作")} aria-expanded={guideOpen} onClick={() => setGuideOpen((open) => !open)}>i</button>
      <button type="button" className="topics-jev-drag" aria-label={tr("Drag Jev panel", "拖曳移動 Jev 視窗")} title={tr("Drag to move panel", "拖曳移動視窗")}
        onPointerDown={(event) => { const rect = panelRef.current?.getBoundingClientRect(); if (!rect) return;
          dragStart.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, offsetX: offset.x, offsetY: offset.y };
          event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => { const start = dragStart.current; if (!start) return;
          setOffset({ x: start.offsetX + Math.max(8 - start.left, Math.min(event.clientX - start.x, window.innerWidth - start.right - 8)),
            y: start.offsetY + Math.max(8 - start.top, Math.min(event.clientY - start.y, window.innerHeight - start.bottom - 8)) }); }}
        onPointerUp={() => { dragStart.current = null; }} onPointerCancel={() => { dragStart.current = null; }}>⠿</button>
      <button type="button" onClick={onClose} aria-label={tr("Close theme finder", "關閉主題搜尋")}>×</button></div>
    {guideOpen && <aside className="topics-jev-guide" aria-label={tr("Theme search guide", "主題搜尋說明")}><strong>{tr("How results are found", "搜尋方式")}</strong><p>{tr("This tool reads articles already saved in the news cache across dates. Jev checks each article's title and excerpt against your exact subject, then sorts by direct relevance. It does not search the live web.", "這項工具讀取跨日期的新聞快取。Jev 逐則比對標題與摘要，依對明確主題的直接相關程度排序；不會即時搜尋網路。")}</p><p>{tr("All cached includes every saved collection. Current view limits the same results to articles now shown in this feed. Results at 75% or above appear.", "「所有快取」涵蓋已儲存的選讀紀錄；「目前畫面」只顯示當前列表中的結果。相關程度達 75% 才列出。")}</p></aside>}
    <p>{tr("Describe one exact subject or event. Sources are ranked by direct relevance, not broad keyword overlap.", "描述一個明確主題或事件。系統逐則檢查來源並依直接相關性排序，不會只憑寬泛的關鍵字重疊判定。")}</p>
    <form className="topics-theme-form" onSubmit={(event) => { event.preventDefault(); void find(); }}><label htmlFor="jev-theme-input">{tr("Theme to find", "要尋找的主題")}</label>
      <div><input ref={inputRef} id="jev-theme-input" value={theme} minLength={3} maxLength={120} onChange={(event) => setTheme(event.target.value)} placeholder={tr("e.g. PFAS-free waterproof membranes", "例如：無 PFAS 防水薄膜")} />
        <button type="submit" disabled={busy || theme.trim().length < 3}>{busy ? tr("Checking…", "檢查中…") : tr("Find matches", "尋找相關報導")}</button></div></form>
    {error && <p role="alert" className="topics-jev-error">{error}</p>}
    {!result && !busy && !error && <div className="topics-theme-empty-state"><strong>{tr("Start with a precise subject", "輸入明確主題開始搜尋")}</strong><p>{tr("For example, a specific material, product launch, regulation, or event. Results will appear here with the source and relevance score.", "例如特定材料、產品發布、法規或事件。結果會在此顯示來源與相關程度。")}</p></div>}
    {result && <div className="topics-theme-results" role="status"><div className="topics-theme-scope" role="group" aria-label={tr("Result scope", "結果範圍")}><button type="button" className={scope === "all" ? "selected" : ""} onClick={() => setScope("all")}>{tr(`All cached · ${result.matches.length}`, `所有快取 · ${result.matches.length}`)}</button><button type="button" className={scope === "current" ? "selected" : ""} onClick={() => setScope("current")}>{tr(`Current view · ${currentCount}`, `目前畫面 · ${currentCount}`)}</button></div><strong>{tr(`${matches.length} direct matches · ${result.checked} checked across ${result.collectionCount} collections`, `${matches.length} 則直接相關 · 已檢查 ${result.collectionCount} 個選讀紀錄、${result.checked} 則報導`)}</strong>
      {matches.length ? <ol>{matches.map((match) => { const article = byId.get(match.id) ?? match.article; return <li key={match.id}>
        <button type="button" onClick={() => onRead(article)}><strong>{article.title}</strong><span>{article.source} · {Math.round(match.probability * 100)}% {tr("match", "相關")} →</span></button>
      </li>; })}</ol> : <p>{tr("No direct match found. Try a more specific or different theme.", "找不到直接相關的報導，請試試更具體或不同的主題。")}</p>}
    </div>}
    <button type="button" className="topics-jev-resize" aria-label={tr("Resize theme finder", "調整主題搜尋視窗大小")} title={tr("Drag to resize", "拖曳調整視窗大小")}
      onPointerDown={(event) => { const rect = panelRef.current?.getBoundingClientRect(); if (!rect) return; resizeStart.current = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { const start = resizeStart.current; if (!start) return; setPanelSize({ width: Math.min(window.innerWidth - 20, Math.max(480, start.width + (event.clientX - start.x) * 2)), height: Math.min(window.innerHeight - 20, Math.max(380, start.height + (event.clientY - start.y) * 2)) }); }}
      onPointerUp={() => { resizeStart.current = null; }} onPointerCancel={() => { resizeStart.current = null; }}><span aria-hidden="true" /></button>
  </section></>, document.body);
}

type JevSettings = { instructions: string; merge: string; keep: string };
const jevFields: { key: keyof JevSettings; label: string; hint: string; limit: number; rows: number }[] = [
  { key: "instructions", label: "Review instruction", hint: "What Jev decides for each pair of stories.", limit: 1200, rows: 4 },
  { key: "merge", label: "Same story when…", hint: "When Jev should suggest showing the pair once.", limit: 400, rows: 2 },
  { key: "keep", label: "Different stories when…", hint: "When Jev should suggest keeping both.", limit: 400, rows: 2 },
];

// Edits Jev's overlap-review prompt for this workspace. The safety line is fixed on the server.
function JevSettingsPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { tr } = useI18n();
  const [draft, setDraft] = useState<JevSettings | null>(null);
  const [defaults, setDefaults] = useState<JevSettings | null>(null);
  const [guard, setGuard] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/topics/jev-settings", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { settings: JevSettings; defaults: JevSettings; guard: string } : Promise.reject(new Error(tr("Settings unavailable", "無法取得設定"))))
      .then((value) => { setDraft(value.settings); setDefaults(value.defaults); setGuard(value.guard); })
      .catch((cause) => { if (!controller.signal.aborted) setStatus(cause instanceof Error ? cause.message : tr("Settings unavailable", "無法取得設定")); });
    return () => controller.abort();
  }, [tr]);

  async function save(body: JevSettings | { reset: true }) {
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/topics/jev-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const value = await response.json() as { settings?: JevSettings; error?: string };
      if (!response.ok || !value.settings) throw new Error(tr("Could not save settings", "無法儲存設定"));
      setDraft(value.settings);
      setStatus(tr("Saved. The next Check overlap uses this prompt.", "已儲存，下次檢查重複報導時會使用此提示詞。"));
      onSaved();
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : tr("Could not save settings", "無法儲存設定")); }
    finally { setBusy(false); }
  }

  const isDefault = Boolean(draft && defaults && jevFields.every((field) => draft[field.key] === defaults[field.key]));
  return createPortal(<><div className="topics-settings-backdrop" onMouseDown={onClose} /><section className="topics-jev-panel topics-jev-settings" role="dialog" aria-modal="true" aria-label={tr("Jev review settings", "Jev 檢查設定")}>
    <div className="topics-jev-panel-head">
      <div><span>{tr("JEV / SETTINGS", "JEV／設定")}</span><h2>{tr("Review prompt", "檢查提示詞")}</h2></div>
      <button ref={closeRef} type="button" onClick={onClose} aria-label={tr("Close Jev settings", "關閉 Jev 設定")}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5.5 5.5 9 9m0-9-9 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></button>
    </div>
    <p>{tr("Adjust how Jev judges whether two sources report the same story. Changes apply to this workspace.", "調整 Jev 如何判斷兩個來源是否報導同一事件。變更只套用至此工作區。")}</p>
    {!draft ? <p role="status">{status || tr("Loading…", "讀取中…")}</p> : <form className="topics-jev-settings-form" onSubmit={(event) => { event.preventDefault(); void save(draft); }}>
      <div className="topics-jev-settings-fields">{jevFields.map((field) => <label key={field.key}>
        <span>{field.key === "instructions" ? tr(field.label, "檢查指示") : field.key === "merge" ? tr(field.label, "視為同一則報導的條件…") : tr(field.label, "視為不同報導的條件…")} <small>{draft[field.key].length}/{field.limit}</small></span>
        <textarea value={draft[field.key]} rows={field.rows} maxLength={field.limit} required onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} />
        <small>{field.key === "instructions" ? tr(field.hint, "Jev 如何判斷每組報導。") : field.key === "merge" ? tr(field.hint, "何時建議只顯示一次。") : tr(field.hint, "何時建議保留兩則。")}</small>
      </label>)}</div>
      <div className="topics-jev-guard"><span>{tr("Always added", "固定附加")}</span><p>{guard}</p></div>
      <div className="topics-jev-settings-actions">
        <button type="submit" className="topics-confirm" disabled={busy}>{busy ? tr("Saving…", "儲存中…") : tr("Save prompt", "儲存提示詞")}</button>
        <button type="button" className="topics-jev-reset" disabled={busy || isDefault} onClick={() => void save({ reset: true })}>{tr("Reset to default", "恢復預設值")}</button>
        <span role="status">{status}</span>
      </div>
    </form>}
  </section></>, document.body);
}

export function TopicsFeed({ initialDate, initialFrom, initialTopic, initialQuery }: { initialDate?: string; initialFrom?: string; initialTopic?: string; initialQuery?: string }) {
  const { locale, tr } = useI18n();
  const jevPreferences = useJevPreferences();
  const [date, setDate] = useState(() => validDate(initialDate));
  const [rangeFrom, setRangeFrom] = useState(() => initialFrom && validDate(initialFrom) === initialFrom && initialFrom < validDate(initialDate) ? initialFrom : undefined);
  const [topic, setTopic] = useState<Topic>(() => topics.some((item) => item.id === initialTopic) ? initialTopic as Topic : "fabric");
  const [query, setQuery] = useState(initialQuery ?? "");
  const [queryDraft, setQueryDraft] = useState(initialQuery ?? "");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarWrap = useRef<HTMLDivElement>(null);
  const [news, setNews] = useState<News | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [choices, setChoices] = useState<Record<string, "merge" | "keep">>({});
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [storyStates, setStoryStates] = useState<Record<string, StoryState>>({});
  const [directions, setDirections] = useState<NewsDirection[]>([]);
  const [miniTopicsExpanded, setMiniTopicsExpanded] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [collectedOpen, setCollectedOpen] = useState(false);
  const [directionOpen, setDirectionOpen] = useState(false);
  const [directionLabel, setDirectionLabel] = useState("");
  const [directionQuery, setDirectionQuery] = useState("");
  const [directionBusy, setDirectionBusy] = useState(false);
  const [directionSuggestBusy, setDirectionSuggestBusy] = useState(false);
  const [directionSuggestError, setDirectionSuggestError] = useState("");
  const [directionProposal, setDirectionProposal] = useState<DirectionProposal | null>(null);
  const directionSuggestAbort = useRef<AbortController | null>(null);
  useEffect(() => () => directionSuggestAbort.current?.abort(), []);
  const [queryOpen, setQueryOpen] = useState(false);
  const [showMerged, setShowMerged] = useState(false);
  const [activeSources, setActiveSources] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [translations, setTranslations] = useState<Record<string, Translation>>({});
  const [reviewCachedTranslations, setReviewCachedTranslations] = useState<Set<string>>(new Set());
  const [translationBusy, setTranslationBusy] = useState<Set<string>>(new Set());
  const [translationPending, setTranslationPending] = useState<Set<string>>(new Set());
  const [translationErrors, setTranslationErrors] = useState<Record<string, string>>({});
  const [showOriginal, setShowOriginal] = useState<Set<string>>(new Set());
  const [translationMeter, setTranslationMeter] = useState<Record<string, TranslationMeter>>({});
  const [lastRefreshIds, setLastRefreshIds] = useState<string[]>([]);
  const [refreshingNews, setRefreshingNews] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const [displayLimit, setDisplayLimit] = useState(15);
  const [processingOpen, setProcessingOpen] = useState(false);
  const refreshSentinelRef = useRef<HTMLDivElement>(null);
  const lastScrollAdvanceAt = useRef(0);
  const touchStartY = useRef<number | null>(null);
  const [readerId, setReaderId] = useState<string | null>(null);
  const [cachedReaderArticle, setCachedReaderArticle] = useState<Article | null>(null);
  const readerTriggerRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const jevWrap = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const topicListRef = useRef<HTMLDivElement>(null);
  const topicIndicatorRef = useRef<HTMLSpanElement>(null);
  const miniTopicListRef = useRef<HTMLDivElement>(null);
  const miniTopicIndicatorRef = useRef<HTMLSpanElement>(null);
  const params = useMemo(() => apiQuery(date, topic, query, rangeFrom), [date, topic, query, rangeFrom]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/topics/state", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { items: StoryState[]; directions: NewsDirection[] } : null)
      .then((value) => { if (value && !controller.signal.aborted) { setStoryStates(Object.fromEntries(value.items.map((item) => [item.id, item]))); setDirections(value.directions); } })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useLayoutEffect(() => {
    const activeKey = directions.find((item) => topic === "all" && query === item.query)?.id ?? topic;
    const observers: ResizeObserver[] = [];
    for (const [list, indicator] of [[topicListRef.current, topicIndicatorRef.current], [miniTopicListRef.current, miniTopicIndicatorRef.current]] as const) {
      const active = [...(list?.querySelectorAll<HTMLButtonElement>("button[data-topic]") ?? [])]
        .find((button) => button.dataset.topic === activeKey);
      if (!list || !indicator || !active) continue;
      const position = () => {
        indicator.style.width = `${active.offsetWidth}px`;
        indicator.style.height = `${active.offsetHeight}px`;
        indicator.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
        list.classList.add("indicator-ready");
      };
      position();
      const observer = new ResizeObserver(position);
      observer.observe(list);
      for (const button of list.querySelectorAll("button[data-topic]")) observer.observe(button);
      observers.push(observer);
    }
    return () => observers.forEach((observer) => observer.disconnect());
  }, [topic, query, directions]);
  useEffect(() => {
    if (!calendarOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!calendarWrap.current?.contains(event.target as Node)) setCalendarOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [calendarOpen]);
  useEffect(() => {
    if (!reviewOpen && !settingsOpen && !themeOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".topics-jev-review, .topics-jev-settings")) return;
      if (!themeOpen && !jevWrap.current?.contains(event.target as Node)) { setReviewOpen(false); setSettingsOpen(false); }
    };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setReviewOpen(false); setSettingsOpen(false); setThemeOpen(false); } };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [reviewOpen, settingsOpen, themeOpen]);

  const select = (nextDate: string, nextTopic: Topic, nextQuery: string, nextFrom = rangeFrom) => {
    const selectedFrom = nextFrom && nextFrom < nextDate ? nextFrom : undefined;
    if (nextDate === date && nextTopic === topic && nextQuery === query && selectedFrom === rangeFrom) { setCalendarOpen(false); setQueryOpen(false); return; }
    setReaderId(null);
    setCachedReaderArticle(null);
    setLoading(true); setReview(null); setError(""); setReviewError(""); setReviewOpen(false); setThemeOpen(false); setReviewSaved(false);
    setTranslations({}); setReviewCachedTranslations(new Set()); setTranslationBusy(new Set()); setTranslationErrors({}); setShowOriginal(new Set());
    setActiveSources({}); setShowMerged(false);
    setTranslationMeter({}); setLastRefreshIds([]); setRefreshMessage(""); setProcessingOpen(false); setDisplayLimit(15);
    lastScrollAdvanceAt.current = 0;
    setDate(nextDate); setRangeFrom(selectedFrom); setTopic(nextTopic); setQuery(nextQuery); setQueryDraft(nextQuery); setCalendarOpen(false); setQueryOpen(false); setShowArchived(false);
    window.history.replaceState(null, "", `/topics?${apiQuery(nextDate, nextTopic, nextQuery, selectedFrom)}`);
  };

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/topics/lab?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as { items?: { id: string }[] } : null)
      .then((value) => { if (!controller.signal.aborted && value) setSaved(new Set((value.items ?? []).map((item) => item.id))); })
      .catch(() => {});
    return () => controller.abort();
  }, [params]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/topics/news?${params}`, { signal: controller.signal, cache: "no-store" });
        const value = await response.json() as News & { error?: string };
        if (!response.ok) throw new Error(tr("News unavailable", "新聞暫時無法使用"));
        if (rangeFrom && value.from !== rangeFrom) throw new Error(tr("The news service has not been updated for date ranges yet.", "新聞服務尚未更新日期範圍功能。"));
        if (query && value.processing?.some((item) => item.filters.includes("At least two textile terms")))
          throw new Error(tr("The news service is still applying preset textile filters to this custom direction.", "新聞服務仍以預設紡織條件篩選此自訂方向。"));
        if (!controller.signal.aborted) { setNews(value); setLoading(false); }
        const reviewResponse = await fetch(`/api/topics/dedup?${params}`, { signal: controller.signal, cache: "no-store" });
        if (reviewResponse.ok && !controller.signal.aborted) {
          const savedReview = await reviewResponse.json() as Review;
          setReview(savedReview);
          setChoices(Object.fromEntries(savedReview.archive?.proposals.map((proposal) => [proposal.pairKey, savedReview.decisions.find((decision) => decision.pairKey === proposal.pairKey)?.decision ?? proposal.recommendation]) ?? []));
        }
      } catch (cause) {
        if (!controller.signal.aborted) { setNews(null); setError(cause instanceof Error ? cause.message : tr("News unavailable", "新聞暫時無法使用")); setLoading(false); }
      }
    })();
    return () => controller.abort();
  }, [params, tr, rangeFrom, query]);

  // All merges each topic's archive, so a story is saved against the topic collection it came from.
  const aggregated = topic === "all" && !query;
  const translationUrl = (article: Article) => translationUrlFor(article, date, topic, query, aggregated, rangeFrom);
  useEffect(() => {
    if (!reviewOpen || !review?.archive || !news) return;
    const controller = new AbortController();
    const articleIds = new Set(review.archive.proposals.flatMap((proposal) => [proposal.firstId, proposal.secondId]));
    void Promise.all([...articleIds].map(async (id) => {
      const article = news.articles.find((item) => item.id === id);
      if (!article || article.language === "zh-Hant") return;
      try {
        const response = await fetch(translationUrlFor(article, date, topic, query, aggregated, rangeFrom), { cache: "no-store", signal: controller.signal });
        const value = response.ok ? await response.json() as TranslationResult : null;
        if (!controller.signal.aborted && value?.available) setReviewCachedTranslations((current) => new Set(current).add(id));
      } catch { /* The source relationship still follows the original URLs. */ }
    }));
    return () => controller.abort();
  }, [reviewOpen, review?.archive, news, date, topic, query, aggregated, rangeFrom]);
  useEffect(() => {
    if (!news || loading || locale !== "zh-Hant") return;
    const controller = new AbortController();
    const translatable = news.articles.slice(0, displayLimit).filter((item) => item.language !== "zh-Hant");
    void (async () => {
      const missing: Article[] = [];
      await Promise.all(translatable.map(async (article) => {
        try {
          const response = await fetch(translationUrl(article), { cache: "no-store", signal: controller.signal });
          const value = response.ok ? await response.json() as TranslationResult : null;
          if (controller.signal.aborted) return;
          if (value?.available && value.translation) {
            setTranslations((current) => ({ ...current, [article.id]: value.translation! }));
            setTranslationErrors((current) => { if (!current[article.id]) return current; const next = { ...current }; delete next[article.id]; return next; });
            setTranslationMeter((current) => ({ ...current, [article.id]: { cache: "hit", input: value.translation?.usage?.input_tokens ?? 0,
              output: value.translation?.usage?.output_tokens ?? 0, total: value.translation?.usage?.total_tokens ?? 0 } }));
          }
          else missing.push(article);
        } catch { if (!controller.signal.aborted) missing.push(article); }
      }));
      if (controller.signal.aborted) return;
      const queue = [...missing];
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
        while (!controller.signal.aborted) {
          const queuedArticle = queue.shift();
          if (!queuedArticle) break;
          const articleId = queuedArticle.id;
          setTranslationBusy((current) => new Set(current).add(articleId));
          try {
            const response = await fetch(translationUrl(queuedArticle), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: controller.signal });
            const value = await response.json() as TranslationResult;
            if (response.status === 409) {
              if (!controller.signal.aborted) setTranslationPending((current) => new Set(current).add(articleId));
              continue;
            }
            if (!response.ok || !value.translation) throw new Error(value.error || tr("Translation unavailable. Try again.", "翻譯暫時無法使用，請重試。"));
            if (!controller.signal.aborted) {
              setTranslations((current) => ({ ...current, [articleId]: value.translation! }));
              setTranslationPending((current) => { const next = new Set(current); next.delete(articleId); return next; });
              setTranslationErrors((current) => { if (!current[articleId]) return current; const next = { ...current }; delete next[articleId]; return next; });
              setTranslationMeter((current) => ({ ...current, [articleId]: { cache: value.cache ?? "miss",
                input: value.translation!.usage?.input_tokens ?? 0, output: value.translation!.usage?.output_tokens ?? 0,
                total: value.translation!.usage?.total_tokens ?? 0 } }));
            }
          } catch (cause) {
            if (!controller.signal.aborted) setTranslationErrors((current) => ({ ...current, [articleId]: cause instanceof Error ? cause.message : tr("Translation unavailable", "翻譯暫時無法使用") }));
          } finally {
            if (!controller.signal.aborted) setTranslationBusy((current) => { const next = new Set(current); next.delete(articleId); return next; });
          }
        }
      }));
    })();
    return () => controller.abort();
  // The URL and articles are fully represented by the loaded collection and its selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [news, loading, date, topic, query, rangeFrom, displayLimit, locale]);
  useEffect(() => {
    const article = news?.articles.find((item) => item.id === readerId);
    if (!article || !translationErrors[article.id] || translations[article.id]) return;
    const controller = new AbortController();
    let attempts = 0;
    const checkCache = async () => {
      if (++attempts > 12) { clearInterval(timer); return; }
      try {
        const response = await fetch(translationUrlFor(article, date, topic, query, aggregated, rangeFrom), { cache: "no-store", signal: controller.signal });
        const value = response.ok ? await response.json() as TranslationResult : null;
        if (!controller.signal.aborted && value?.available && value.translation) {
          setTranslations((current) => ({ ...current, [article.id]: value.translation! }));
          setTranslationErrors((current) => { const next = { ...current }; delete next[article.id]; return next; });
          clearInterval(timer);
        }
      } catch { /* Keep the retry button available while the shared cache catches up. */ }
    };
    const timer = setInterval(() => void checkCache(), 5000);
    void checkCache();
    return () => { controller.abort(); clearInterval(timer); };
  }, [readerId, news, translationErrors, translations, date, topic, query, aggregated, rangeFrom]);
  useEffect(() => {
    if (!translationPending.size) return;
    const controller = new AbortController();
    let attempts = 0;
    const checkPending = async () => {
      attempts += 1;
      const resolved = new Set<string>();
      for (const id of translationPending) {
        const article = news?.articles.find((item) => item.id === id) ?? (cachedReaderArticle?.id === id ? cachedReaderArticle : null);
        if (!article) continue;
        try {
          const response = await fetch(translationUrlFor(article, date, topic, query, aggregated, rangeFrom), { cache: "no-store", signal: controller.signal });
          const value = response.ok ? await response.json() as TranslationResult : null;
          if (controller.signal.aborted || !value?.available || !value.translation || hasBody(article) && !value.translation.body.trim()) continue;
          resolved.add(id);
          setTranslations((current) => ({ ...current, [id]: value.translation! }));
          setTranslationErrors((current) => { if (!current[id]) return current; const next = { ...current }; delete next[id]; return next; });
          setTranslationPending((current) => { const next = new Set(current); next.delete(id); return next; });
        } catch { /* The shared translation can still be running. */ }
      }
      if (attempts >= 30 && !controller.signal.aborted) {
        setTranslationPending((current) => { const next = new Set(current); for (const id of translationPending) next.delete(id); return next; });
        setTranslationErrors((current) => {
          const next = { ...current };
          for (const id of translationPending) if (!resolved.has(id)) next[id] = tr("Translation is taking longer than expected. Try again.", "翻譯等待時間較長，請重試。");
          return next;
        });
      }
    };
    void checkPending();
    const timer = setInterval(() => void checkPending(), 4000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [translationPending, news, cachedReaderArticle, date, topic, query, aggregated, rangeFrom, tr]);
  const translateArticle = async (article: Article) => {
    setTranslationBusy((current) => new Set(current).add(article.id));
    setTranslationPending((current) => { const next = new Set(current); next.delete(article.id); return next; });
    setTranslationErrors((current) => { const next = { ...current }; delete next[article.id]; return next; });
    try {
      const response = await fetch(translationUrl(article), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const value = await response.json() as TranslationResult;
      if (response.status === 409) { setTranslationPending((current) => new Set(current).add(article.id)); return; }
      if (!response.ok || !value.translation) throw new Error(value.error || tr("Translation unavailable. Try again.", "翻譯暫時無法使用，請重試。"));
      setTranslations((current) => ({ ...current, [article.id]: value.translation! }));
      setTranslationPending((current) => { const next = new Set(current); next.delete(article.id); return next; });
      setTranslationErrors((current) => { if (!current[article.id]) return current; const next = { ...current }; delete next[article.id]; return next; });
      setTranslationMeter((current) => ({ ...current, [article.id]: { cache: value.cache ?? "miss",
        input: value.translation!.usage?.input_tokens ?? 0, output: value.translation!.usage?.output_tokens ?? 0,
        total: value.translation!.usage?.total_tokens ?? 0 } }));
      setShowOriginal((current) => { const next = new Set(current); next.delete(article.id); return next; });
    } catch (cause) {
      setTranslationErrors((current) => ({ ...current, [article.id]: cause instanceof Error ? cause.message : tr("Translation unavailable", "翻譯暫時無法使用") }));
    } finally {
      setTranslationBusy((current) => { const next = new Set(current); next.delete(article.id); return next; });
    }
  };
  const saveArticle = async (article: Article) => {
    const selected = !saved.has(article.id);
    const saveParams = aggregated && article.topic ? apiQuery(date, article.topic, "") : params;
    const response = await fetch(`/api/topics/lab?${saveParams}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: article.id, selected }) });
    if (!response.ok) { setError(tr("Could not update Topics Lab.", "無法更新新聞實驗室。")); return; }
    setSaved((current) => { const next = new Set(current); if (selected) next.add(article.id); else next.delete(article.id); return next; });
  };
  const updateStoryState = async (article: Article, change: Partial<Pick<StoryState, "reaction" | "collected" | "archived">>) => {
    try {
      const response = await fetch("/api/topics/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ article, ...change }) });
      const value = await response.json() as StoryState & { error?: string };
      if (!response.ok || !value.id) throw new Error(tr("Could not update this story", "無法更新這則報導"));
      setStoryStates((current) => ({ ...current, [article.id]: value }));
      if (change.archived && readerId === article.id) setReaderId(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Could not update this story", "無法更新這則報導")); }
  };
  const addDirection = async () => {
    if (directionBusy || directionLabel.trim().length < 2 || directionQuery.trim().length < 3) return;
    setDirectionBusy(true);
    try {
      const response = await fetch("/api/topics/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: directionLabel.trim(), query: directionQuery.trim() }) });
      const value = await response.json() as { direction?: NewsDirection; error?: string };
      if (!response.ok || !value.direction) throw new Error(response.status === 409 ? tr("This topic name already exists.", "這個主題名稱已存在。") : tr("Could not add direction", "無法新增主題方向"));
      setDirections((current) => [...current, value.direction!]);
      setDirectionOpen(false); setDirectionLabel(""); setDirectionQuery(""); setDirectionProposal(null);
      select(date, "all", value.direction.query);
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Could not add direction", "無法新增主題方向")); }
    finally { setDirectionBusy(false); }
  };
  const closeDirection = () => {
    directionSuggestAbort.current?.abort();
    directionSuggestAbort.current = null;
    setDirectionSuggestBusy(false);
    setDirectionSuggestError("");
    setDirectionProposal(null);
    setDirectionOpen(false);
  };
  const cancelDirectionSuggestion = () => {
    directionSuggestAbort.current?.abort();
    directionSuggestAbort.current = null;
    setDirectionSuggestBusy(false);
    setDirectionSuggestError("");
  };
  const suggestDirection = async (previous?: DirectionProposal) => {
    if (directionSuggestBusy) return;
    const sourceTitle = previous?.sourceTitle ?? directionLabel.trim();
    const sourceDirection = previous?.sourceDirection ?? directionQuery.trim();
    const controller = new AbortController();
    directionSuggestAbort.current = controller;
    setDirectionSuggestBusy(true);
    setDirectionSuggestError("");
    const priorText = previous ? previous.mode === "direction" ? previous.direction : previous.title : undefined;
    try {
      const response = await fetch("/api/topics/direction-suggest", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: sourceTitle, direction: sourceDirection, locale, previous: priorText }), signal: controller.signal });
      const value = await response.json() as { suggestion?: { title: string; direction: string }; mode?: DirectionProposal["mode"]; error?: string };
      if (!response.ok || !value.suggestion || !value.mode) throw new Error(response.status === 429
        ? tr("Suggestion limit reached. Try again in a minute.", "已達建議次數上限，請稍後一分鐘再試。")
        : response.status === 502 ? tr("This suggestion missed the topic limits. Regenerate it.", "這份建議未符合主題字數限制，請重新產生。")
          : value.error === "Suggestion service is not configured" ? tr("Suggestion service is not configured.", "尚未設定建議服務。")
            : tr("Could not generate a suggestion. Try again.", "無法產生建議，請再試一次。"));
      if (!controller.signal.aborted) setDirectionProposal({ ...value.suggestion, mode: value.mode, sourceTitle, sourceDirection });
    } catch (cause) {
      if (!controller.signal.aborted) setDirectionSuggestError(cause instanceof Error ? cause.message : tr("Could not generate a suggestion.", "無法產生建議。"));
    } finally {
      if (directionSuggestAbort.current === controller) {
        directionSuggestAbort.current = null;
        setDirectionSuggestBusy(false);
      }
    }
  };
  const acceptDirectionProposal = () => {
    if (!directionProposal) return;
    setDirectionLabel(directionProposal.title);
    setDirectionQuery(directionProposal.direction);
    setDirectionProposal(null);
    setDirectionSuggestError("");
  };
  const removeDirection = async (id: string) => {
    try {
      const response = await fetch("/api/topics/state", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!response.ok) throw new Error(tr("Could not remove direction", "無法移除主題方向"));
      setDirections((current) => current.filter((item) => item.id !== id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Could not remove direction", "無法移除主題方向")); }
  };

  const refreshNews = useCallback(async (olderPage = 0, manualOverride = false) => {
    if (refreshingNews || loading || !news) return;
    setRefreshingNews(true);
    setRefreshMessage(olderPage ? tr(`Checking earlier sources · window ${olderPage}…`, `正在查看過去第 ${olderPage} 段期間的相關來源…`) : tr("Checking for new sources…", "正在查看新來源…"));
    try {
      const response = await fetch(`/api/topics/news?${params}${olderPage ? `&olderPage=${olderPage}` : ""}${manualOverride ? "&force=1" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const value = await response.json() as News & { error?: string };
      if (!response.ok) throw new Error(tr("Refresh unavailable", "暫時無法更新"));
      if (rangeFrom && value.from !== rangeFrom) throw new Error(tr("The news service has not been updated for date ranges yet.", "新聞服務尚未更新日期範圍功能。"));
      if (manualOverride && !value.refreshed) throw new Error(tr("The news service has not enabled early refresh yet.", "新聞服務尚未啟用提前更新功能。"));
      const knownIds = new Set(news.articles.map((article) => article.id));
      const addedIds = value.articles.filter((article) => !knownIds.has(article.id)).map((article) => article.id);
      setNews(value);
      setLastRefreshIds(addedIds);
      const count = addedIds.length;
      const nextAllowed = value.processing?.map((item) => Date.parse(item.nextAllowedAt)).filter(Number.isFinite).sort((a, b) => b - a)[0];
      setRefreshMessage(olderPage ? count ? tr(`${count} relevant sources added · keep scrolling`, `新增 ${count} 則高相關來源 · 繼續捲動`) :
        olderPage < 4 ? tr("No close matches in this window · keep scrolling", "這段期間沒有高相關來源 · 繼續捲動") : tr("Finished checking the past 30 days", "過去 30 天已檢查完畢") :
        count ? tr(`${count} sources added`, `新增 ${count} 則來源`) : value.refreshed ? tr("Checked; no new sources yet", "已檢查，暫無新來源") :
        nextAllowed ? tr(`Up to date · check again after ${new Date(nextAllowed).toLocaleTimeString(locale === "zh-Hant" ? "zh-TW" : "en", { hour: "2-digit", minute: "2-digit" })}`, `已是最新 · ${new Date(nextAllowed).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })} 後可再更新`) : tr("Up to date", "已是最新"));
    } catch (cause) {
      setRefreshMessage(cause instanceof Error ? cause.message : tr("Could not refresh right now", "暫時無法更新"));
      lastScrollAdvanceAt.current = 0;
    } finally { setRefreshingNews(false); }
  }, [params, news, loading, refreshingNews, locale, tr, rangeFrom]);

  useEffect(() => {
    const advance = () => {
      if (!news || loading || refreshingNews || window.scrollY < 100) return;
      const sentinel = refreshSentinelRef.current;
      if (!sentinel || sentinel.getBoundingClientRect().top >= window.innerHeight + 100) return;
      const now = Date.now();
      if (now - lastScrollAdvanceAt.current < 850) return;
      lastScrollAdvanceAt.current = now;
      if (displayLimit < news.articles.length) {
        setDisplayLimit((count) => Math.min(count + 15, news.articles.length));
        return;
      }
      if (rangeFrom) return;
      const nextPage = [1, 2, 3, 4].find((page) => !news.loadedOlderPages?.includes(page)) ?? 0;
      const nextDailyCheck = Math.max(0, ...(news.processing ?? []).map((item) => Date.parse(item.nextAllowedAt) || 0));
      if (nextPage === 0 && nextDailyCheck > now) return;
      void refreshNews(nextPage);
    };
    const onWheel = (event: WheelEvent) => { if (event.deltaY > 0) advance(); };
    const onTouchStart = (event: TouchEvent) => { touchStartY.current = event.touches[0]?.clientY ?? null; };
    const onTouchEnd = (event: TouchEvent) => {
      if (touchStartY.current !== null && touchStartY.current - (event.changedTouches[0]?.clientY ?? touchStartY.current) > 25) advance();
      touchStartY.current = null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (["PageDown", "End", "ArrowDown", " "].includes(event.key) && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) advance();
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [news, loading, refreshingNews, refreshNews, displayLimit, rangeFrom]);

  const runReview = async () => {
    setReviewing(true); setReviewError("");
    try {
      const response = await fetch(`/api/topics/dedup?${params}`, { method: "POST" });
      const value = await response.json() as Review & { error?: string };
      if (!response.ok) throw new Error(tr("Jev review unavailable", "Jev 檢查暫時無法使用"));
      setReview(value);
      setChoices(Object.fromEntries(value.archive?.proposals.map((proposal) => [proposal.pairKey, value.decisions.find((decision) => decision.pairKey === proposal.pairKey)?.decision ?? proposal.recommendation]) ?? []));
      setReviewOpen(true);
    } catch (cause) { setReviewError(cause instanceof Error ? cause.message : tr("Jev review unavailable", "Jev 檢查暫時無法使用")); }
    finally { setReviewing(false); }
  };

  const confirmReview = async () => {
    if (!review?.archive) return;
    setReviewing(true); setReviewError("");
    try {
      const response = await fetch(`/api/topics/dedup/confirm?${params}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions: review.archive.proposals.map((proposal) => ({ pairKey: proposal.pairKey, decision: choices[proposal.pairKey] })) }) });
      const value = await response.json() as Review & { error?: string };
      if (!response.ok) throw new Error(tr("Could not confirm review", "無法儲存檢查結果"));
      setReview(value);
      setReviewSaved(true);
    } catch (cause) { setReviewError(cause instanceof Error ? cause.message : tr("Could not confirm review", "無法儲存檢查結果")); }
    finally { setReviewing(false); }
  };

  const byId = new Map(news?.articles.map((item) => [item.id, item]) ?? []);
  const groups = groupConfirmedStories(news?.articles ?? [], review?.archive?.proposals ?? [], review?.decisions ?? []);
  const representativeById = new Map<string, string>();
  for (const item of news?.articles ?? []) {
    const members = groups.get(item.id) ?? [item];
    representativeById.set(item.id, (members.find((member) => showArchived || !storyStates[member.id]?.archived) ?? members[0]).id);
  }
  const merged = new Set((news?.articles ?? []).filter((item) => (groups.get(item.id)?.length ?? 1) > 1 && representativeById.get(item.id) !== item.id).map((item) => item.id));
  const archivedCount = (news?.articles ?? []).filter((item) => storyStates[item.id]?.archived).length;
  const collectedStories = Object.values(storyStates).filter((item) => item.collected);
  const allVisible = (news?.articles ?? []).filter((item) => (showMerged || !merged.has(item.id)) && (showArchived || !storyStates[item.id]?.archived));
  const visible = allVisible.slice(0, displayLimit);
  const readerIndex = allVisible.findIndex((item) => item.id === readerId || (!showMerged && readerId && representativeById.get(readerId) === item.id));
  const readerArticle = readerId ? byId.get(readerId) ?? cachedReaderArticle : null;
  const openReader = (article: Article, trigger: HTMLButtonElement) => { readerTriggerRef.current = trigger; setCachedReaderArticle(null); setReaderId(article.id); };
  const closeReader = () => { setReaderId(null); setCachedReaderArticle(null); requestAnimationFrame(() => readerTriggerRef.current?.focus()); };
  const readerSources = readerArticle ? (groups.get(readerArticle.id) ?? [readerArticle]).filter((source) => showArchived || !storyStates[source.id]?.archived) : [];
  const proposalCount = review?.archive?.proposals.length ?? 0;
  const undecided = review?.archive?.proposals.filter((proposal) => !review.decisions.some((decision) => decision.pairKey === proposal.pairKey)).length ?? 0;
  const jevLabel = !review?.archive ? tr("Check overlap ↗", "檢查重複報導 ↗") : !proposalCount ? tr("No overlaps found ↗", "未發現重複報導 ↗")
    : undecided ? tr(`${undecided} to review ↗`, `待檢查 ${undecided} 組 ↗`) : tr(`${merged.size} merged · reviewed ↗`, `已合併 ${merged.size} 組 · 已檢查 ↗`);
  const selectedDirection = directions.find((item) => topic === "all" && query === item.query);
  const topicLabel = selectedDirection?.label ?? (locale === "zh-Hant" ? topicLabelZh(topic) : topics.find((item) => item.id === topic)?.label ?? "Topics");
  const storySelection = useSelectionScope(`stories:${rangeFrom ?? date}:${date}:${topic}:${query}`, visible.map((article) => article.id));

  // News reading takes the centre; topic, date, search and review controls live in the
  // right sidebar, which auto-collapses like the collection pages' context panel.
  const context = <div className="topics-context">
    <div className="collection-heading">
      <p className="eyebrow">{tr("The daily conversation file", "每日話題選讀")}</p>
      <h1>{tr("News for curious work.", "為好奇工作者選讀新聞。")}</h1>
      <p className="topics-context-intro">{tr("Technical-fabric news from Taiwan and Europe: materials, supply chain, European brands and the stories around them.", "關注台灣與歐洲的機能布料、材料、供應鏈、品牌，以及背後的產業故事。")}</p>
    </div>
    <div className="topics-context-block"><span className="topics-context-label">{tr("Topic", "主題")}</span>
      <div className="topics-topic-list" aria-label={tr("News topics", "新聞主題")} ref={topicListRef}>
        <span className="topics-topic-indicator" aria-hidden="true" ref={topicIndicatorRef} />
        {topics.map((item) => <button key={item.id} type="button" data-topic={item.id} className={topic === item.id && !query ? "selected" : ""}
          aria-pressed={topic === item.id && !query} title={locale === "zh-Hant" ? topicLabelZh(item.id) : item.detail} onClick={() => select(date, item.id, "")}>{locale === "zh-Hant" ? topicLabelZh(item.id) : item.label}</button>)}
        {directions.map((item) => <button key={item.id} type="button" data-topic={item.id} className={selectedDirection?.id === item.id ? "selected" : ""} aria-pressed={selectedDirection?.id === item.id} title={item.query} onClick={() => select(date, "all", item.query)}>{item.label}</button>)}
        <button type="button" className="topics-add-direction" aria-label={tr("Add news direction", "新增新聞主題方向")} title={tr("Add news direction", "新增新聞主題方向")} onClick={() => setDirectionOpen(true)}>＋</button>
      </div>
    </div>
    <div className="topics-context-block"><span className="topics-context-label">{tr("Date", "日期")}</span>
    <div className="topics-controls"><div className="topics-date-wrap" ref={calendarWrap}><button type="button" className="topics-date-trigger" onClick={() => setCalendarOpen((open) => !open)} aria-expanded={calendarOpen} aria-label={tr("Choose news date or range", "選擇新聞日期或範圍")}><svg className="topics-date-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12" rx="1" stroke="currentColor" strokeWidth="1.6"/><path d="M3 8.5h14M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg><strong>{rangeFrom ? `${rangeFrom.slice(5).replace("-", ".")}–${date.slice(5).replace("-", ".")}` : locale === "zh-Hant" ? dateLabelZh(date) : dateLabel(date)}</strong><svg className="topics-date-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></button>{calendarOpen && <Calendar date={date} from={rangeFrom} onSelect={(value) => select(value, topic, query, "")} onRange={(from, to) => select(to, topic, query, from)} onClose={() => setCalendarOpen(false)} />}</div><span className="topics-date-caption">{tr("Dates and ranges have separate saved searches. Results cover textile stories about Taiwan and Europe.", "單日與日期範圍各有獨立搜尋紀錄；結果涵蓋與台灣及歐洲相關的紡織報導。")}</span></div>
    </div>
    <div className="topics-context-block">
    <div className="topics-query-launch"><button type="button" onClick={() => setQueryOpen(true)}>{tr("Shape this collection", "自訂選讀方向")} <span>{query || tr("Open search ↗", "開啟搜尋 ↗")}</span></button>{query && <button type="button" onClick={() => select(date, topic, "")}>{tr("Reset", "重設")}</button>}</div>
    <p className="topics-search-explain">{query
      ? tr("Exa searches this custom direction for the selected date or range. Older windows can be searched below; those stories are checked for direct relevance before appearing.", "Exa 依自訂方向搜尋所選日期或區間；可在頁尾接續搜尋更早的來源，較早報導會先檢查是否直接相關。")
      : tr("Exa searches source pages for this date or range; textile, language and Taiwan/Europe filters shape the saved collection.", "Exa 搜尋此日期或區間的來源網頁，再依紡織、語言及台灣／歐洲條件篩選，並儲存結果。")}</p>
    </div>
    <div className="topics-context-block"><span className="topics-context-label">{tr("Review & save", "檢查與收藏")}</span>
      <div className="topics-hero-actions" ref={jevWrap}>
        <Link href="/topics/lab" data-lab-feature className="topics-lab-link">◇ {tr("Topics Lab", "新聞實驗室")} <span>{tr(`${saved.size} saved ↗`, `已存 ${saved.size} 則 ↗`)}</span></Link>
        <button type="button" className="topics-collected-trigger" onClick={() => setCollectedOpen(true)}>♥ {tr("Collected news", "新聞收藏夾")} <span>{collectedStories.length}</span></button>
        <div className="topics-jev-row" data-lab-feature>
          {!aggregated && jevPreferences.overlap && <button type="button" className="topics-jev-trigger" disabled={!news || reviewing} aria-expanded={reviewOpen} onClick={() => { setSettingsOpen(false); setThemeOpen(false); if (review?.archive) setReviewOpen((open) => !open); else void runReview(); }}>
            <span>JEV</span><strong>{reviewing ? tr("Checking overlap…", "正在檢查重複報導…") : jevLabel}</strong>
          </button>}
          {jevPreferences.theme && <button type="button" className="topics-jev-theme-trigger" disabled={!news || loading} aria-expanded={themeOpen} onClick={() => { setReviewOpen(false); setSettingsOpen(false); setThemeOpen((open) => !open); }}>{tr("Find theme", "尋找主題")}</button>}
          {!aggregated && jevPreferences.overlap && <button type="button" className={`topics-jev-settings-trigger${settingsOpen ? " selected" : ""}`} aria-expanded={settingsOpen} aria-label={tr("Jev review settings", "Jev 檢查設定")} title={tr("Adjust Jev's review prompt", "調整 Jev 的檢查提示詞")}
            onClick={() => { setReviewOpen(false); setThemeOpen(false); setSettingsOpen((open) => !open); }}>
            <SettingsIcon />
          </button>}
        </div>
        {settingsOpen && <div data-lab-feature><JevSettingsPanel onClose={() => setSettingsOpen(false)} onSaved={() => { setReview(null); setChoices({}); setReviewSaved(false); }} /></div>}
        {reviewError && <small className="topics-jev-error" role="alert">{reviewError}</small>}
        {reviewOpen && review?.archive && <JevPanel archive={review.archive} decisions={review.decisions} byId={byId} cachedTranslations={new Set([...reviewCachedTranslations, ...Object.keys(translations)])} choices={choices} reviewing={reviewing} saved={reviewSaved} onChoice={(pairKey, choice) => { setReviewSaved(false); setChoices((current) => ({ ...current, [pairKey]: choice })); }} onConfirm={() => void confirmReview()} onClose={() => setReviewOpen(false)} />}
        {themeOpen && <JevThemePanel params={params} byId={byId} onRead={(article) => { setThemeOpen(false); setCachedReaderArticle(byId.has(article.id) ? null : article); setReaderId(article.id); }} onClose={() => setThemeOpen(false)} />}
      </div>
    </div>
    <div className="topics-context-block topics-processing-block" data-lab-feature>
      <button type="button" className="topics-processing-trigger" aria-expanded={processingOpen} onClick={() => setProcessingOpen((open) => !open)}>
        <span>{tr("PROCESSING / COST", "處理流程／費用")}</span><strong>{processingOpen ? tr("Hide details ↑", "收起詳細資料 ↑") : tr("See requests & usage ↗", "查看請求與用量 ↗")}</strong>
      </button>
      {processingOpen && news?.processing && <TopicsProcessingPanel processing={news.processing} articles={news.articles}
        newArticleIds={lastRefreshIds} translationMeter={translationMeter} onClose={() => setProcessingOpen(false)} />}
    </div>
  </div>;

  const compactContext = (expand: () => void) => <div className="topics-mini" aria-label={tr("Compact News controls", "精簡新聞控制列")}>
    <span className="topics-mini-heading">{tr("NEWS", "新聞")}</span>
    <div className={`topics-mini-group topics-mini-topics${miniTopicsExpanded ? " is-expanded" : ""}`} role="group" aria-label={tr("News topics", "新聞主題")} ref={miniTopicListRef}
      onMouseEnter={() => setMiniTopicsExpanded(true)} onMouseLeave={() => setMiniTopicsExpanded(false)} onFocus={() => setMiniTopicsExpanded(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setMiniTopicsExpanded(false); }}>
      <span className="topics-mini-indicator" aria-hidden="true" ref={miniTopicIndicatorRef} />
      {topics.map((item, index) => { const visible = index < ((topics.findIndex((entry) => entry.id === topic) >= 3 && !query || selectedDirection) ? 2 : 3) || topic === item.id && !query; return <button key={item.id} type="button" data-topic={item.id} className={`${topic === item.id && !query ? "selected " : ""}${visible ? "" : "is-peek-hidden"}`}
        tabIndex={miniTopicsExpanded || visible ? undefined : -1} aria-hidden={miniTopicsExpanded || visible ? undefined : true}
        aria-label={locale === "zh-Hant" ? topicLabelZh(item.id) : item.label} aria-pressed={topic === item.id && !query} title={locale === "zh-Hant" ? topicLabelZh(item.id) : item.label}
        onClick={() => select(date, item.id, "")}>{locale === "zh-Hant" ? topicLabelZh(item.id) : item.label === "Supply chain" ? "Supply" : item.label === "European brands" ? "Brands" : item.label === "Common ground" ? "Common" : item.label === "Ice breakers" ? "Ice" : item.label === "Entertainment" ? "Culture" : item.label}</button>; })}
      {directions.map((item) => <button key={item.id} type="button" data-topic={item.id} className={`${selectedDirection?.id === item.id ? "selected" : "is-peek-hidden"}`} tabIndex={miniTopicsExpanded || selectedDirection?.id === item.id ? undefined : -1} aria-hidden={miniTopicsExpanded || selectedDirection?.id === item.id ? undefined : true} aria-pressed={selectedDirection?.id === item.id} title={item.query} onClick={() => select(date, "all", item.query)}>{item.label}</button>)}
      <button type="button" className="is-peek-hidden" tabIndex={miniTopicsExpanded ? undefined : -1} aria-hidden={miniTopicsExpanded ? undefined : true} aria-label={tr("Add news direction", "新增新聞主題方向")} onClick={() => setDirectionOpen(true)}>＋</button>
    </div>
    <div className="topics-mini-group topics-mini-tools" role="group" aria-label={tr("Date, search and saved stories", "日期、搜尋與收藏報導")}>
      <button type="button" title={tr("Choose date or range", "選擇日期或範圍")} aria-label={tr(`Choose date or range, ending ${dateLabel(date)}`, `選擇日期或範圍，結束於${dateLabelZh(date)}`)} onClick={() => { expand(); setCalendarOpen(true); }}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h3m3 0h3m-9 4h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg><small>{rangeFrom ? `${rangeFrom.slice(5).replace("-", ".")}–${date.slice(5).replace("-", ".")}` : date.slice(5).replace("-", ".")}</small><small className="topics-mini-range-hint">{tr("Range", "範圍")}</small></button>
      <button type="button" title={query ? tr(`Search: ${query}`, `搜尋：${query}`) : tr("Search this date", "搜尋此日期")} aria-label={query ? tr(`Edit search: ${query}`, `編輯搜尋：${query}`) : tr("Search this date", "搜尋此日期")} onClick={() => setQueryOpen(true)}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2.4"/><path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg><small>{query ? tr("Custom", "自訂") : tr("Search", "搜尋")}</small></button>
      <Link href="/topics/lab" data-lab-feature title={tr("Open Topics Lab", "開啟新聞實驗室")} aria-label={tr(`Topics Lab, ${saved.size} saved`, `新聞實驗室，已存 ${saved.size} 則`)}><span aria-hidden="true">◇</span><small>{tr(`${saved.size} saved`, `${saved.size} 已存`)}</small></Link>
      <button type="button" title={tr("Collected news", "新聞收藏夾")} onClick={() => setCollectedOpen(true)}><span aria-hidden="true">♥</span><small>{collectedStories.length}</small></button>
      {!aggregated && jevPreferences.overlap && <button type="button" data-lab-feature title={tr("Jev overlap review", "Jev 重複報導檢查")} aria-label={tr("Open Jev overlap review", "開啟 Jev 重複報導檢查")} onClick={() => { expand(); if (review?.archive) setReviewOpen(true); else void runReview(); }}><span aria-hidden="true">✦</span><small>JEV</small></button>}
      {jevPreferences.theme && <button type="button" data-lab-feature title={tr("Find an exact theme with Jev", "使用 Jev 尋找精確主題")} aria-label={tr("Find an exact theme with Jev", "使用 Jev 尋找精確主題")} onClick={() => { expand(); setReviewOpen(false); setThemeOpen(true); }}><span aria-hidden="true">⌕</span><small>{tr("Theme", "主題")}</small></button>}
      <button type="button" data-lab-feature title={tr("Processing and cost", "處理流程與費用")} aria-label={tr("Open processing and cost", "開啟處理流程與費用")} onClick={() => { expand(); setProcessingOpen(true); }}><span aria-hidden="true">≡</span><small>{tr("Cost", "費用")}</small></button>
    </div>
  </div>;

  return <CollectionLayout title={tr("Topics", "新聞")} context={context} compactContext={compactContext} className="topics-layout" startExpanded>
    <section className={`topics-results${loading && news ? " is-loading" : ""}`} aria-live="polite" aria-busy={loading}><div className="topics-results-head"><div><p className="eyebrow">{topicLabel} / {rangeFrom ? `${rangeFrom} – ${date}` : date}</p><h2>{rangeFrom ? tr("Reading across dates", "區間選讀") : tr("Today's reading", "今日閱讀")}</h2></div><div className="topics-archive-state">{news && !loading && <><span>{merged.size && !showMerged ? tr(`${allVisible.length} stories · ${news.articles.length} sources`, `${allVisible.length} 則報導 · ${news.articles.length} 篇來源`) : tr(`${allVisible.length} sources`, `${allVisible.length} 則來源`)}</span>{archivedCount > 0 && <button type="button" className="topics-archived-toggle" aria-pressed={showArchived} onClick={() => setShowArchived((value) => !value)}>{showArchived ? tr("Hide archive", "隱藏封存") : tr(`Archive ${archivedCount}`, `封存 ${archivedCount}`)}</button>}<a href={`/api/topics/news?${params}&raw=1`} target="_blank" rel="noreferrer">{tr("Full source data ↗", "完整來源資料 ↗")}</a>{visible.length > 0 && <SelectToggle scope={storySelection} noun="story" nouns="stories" />}</>}</div></div>
      {loading && <div className={news ? "topics-loading-indicator" : "topics-empty"} role="status">{rangeFrom ? tr("Gathering sources across this range…", "正在整理此日期範圍的來源…") : tr("Gathering this date’s sources…", "正在整理這一天的來源…")}</div>}
      {error && <div className="topics-empty topics-error" role="alert">{error}</div>}
      {!loading && !error && news?.articles.length === 0 && <div className="topics-empty">{tr("No matching stories were published for this date. Choose another day or topic.", "這一天沒有符合條件的報導，請選擇其他日期或主題。")}</div>}
      {merged.size > 0 && <button type="button" className="topics-show-merged" onClick={() => setShowMerged((value) => !value)}>{tr(`${showMerged ? "Hide" : "Show"} ${merged.size} merged ${merged.size === 1 ? "source" : "sources"}`, `${showMerged ? "隱藏" : "顯示"} ${merged.size} 則已合併來源`)}</button>}
      <SelectionArea scope={storySelection} dragToSelect={false}><div className="topics-feed" inert={loading}>{visible.map((entry, index) => {
        const sources = groups.get(entry.id) ?? [entry];
        const availableSources = sources.filter((source) => showArchived || !storyStates[source.id]?.archived);
        const sourceChoices = availableSources.length ? availableSources : sources;
        const selectedSourceId = activeSources[entry.id];
        const article = !showMerged && sourceChoices.find((source) => source.id === selectedSourceId) || entry;
        const sourceIndex = sourceChoices.findIndex((source) => source.id === article.id);
        const translation = translations[article.id];
        const translated = Boolean(translation && (locale === "zh-Hant" ? !showOriginal.has(article.id) : showOriginal.has(article.id)));
        const awaitingTranslation = locale === "zh-Hant" && article.language !== "zh-Hant" && !translation && (translationBusy.has(article.id) || translationPending.has(article.id));
        const titleOnlyTranslation = Boolean(translation && !translation.body.trim());
        const missingTranslationBody = titleOnlyTranslation && hasBody(article);
        const bodyTranslated = translated && !titleOnlyTranslation;
        const body = bodyTranslated ? translation.body : readableSummary(article.summary);
        const storyState = storyStates[article.id];
        return <article key={entry.id} className={`topics-story${storyState?.archived ? " is-archived" : ""}`} data-select-id={entry.id}>
          <div className="topics-story-index">{String(index + 1).padStart(2, "0")}</div>
          <div className="topics-story-body">
            <button type="button" className="topics-story-archive" onClick={() => void updateStoryState(article, { archived: !storyState?.archived })} aria-label={storyState?.archived ? tr("Restore story", "還原報導") : tr("Archive story", "封存報導")} title={storyState?.archived ? tr("Restore story", "還原報導") : tr("Archive story", "封存報導")}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 5.5h12M7 5.5V3.7h6v1.8M5.8 5.5l.7 11h7l.7-11M8.4 8.2v5.5m3.2-5.5v5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
            {article.image && <TopicsArticleImage key={article.image} src={article.image} />}
            {sourceChoices.length > 1 && !showMerged && <div className="topics-source-switcher" aria-label={tr("Sources reporting this story", "報導此事件的來源")}>
              <span className="topics-source-caption">{tr(`${new Set(sourceChoices.map((source) => hostOf(source.url))).size} source sites · ${sourceChoices.length} original articles`, `${new Set(sourceChoices.map((source) => hostOf(source.url))).size} 個來源網站 · ${sourceChoices.length} 篇原始報導`)}</span>
              <div className="topics-source-controls">
                <div className="topics-source-pills">{sourceChoices.map((source, position) => <button key={source.id} type="button" className={source.id === article.id ? "active" : ""} aria-pressed={source.id === article.id} title={source.title} onClick={() => setActiveSources((current) => ({ ...current, [entry.id]: source.id }))}>{hostOf(source.url)}{sourceChoices.filter((item) => hostOf(item.url) === hostOf(source.url)).length > 1 ? ` ${sourceChoices.slice(0, position + 1).filter((item) => hostOf(item.url) === hostOf(source.url)).length}` : ""}</button>)}</div>
                <button type="button" className="topics-source-next" aria-label={tr("View next source", "查看下一個來源")} onClick={() => setActiveSources((current) => ({ ...current, [entry.id]: sourceChoices[(sourceIndex + 1) % sourceChoices.length].id }))}>→</button>
              </div>
            </div>}
            <div className="topics-story-meta">
              {aggregated && article.topic && <span className="topics-story-topic">{topicLabelZh(article.topic)}</span>}
              <span>{article.source}</span><span>{article.publishedAt ? locale === "zh-Hant" ? dateLabelZh(article.publishedAt.slice(0, 10)) : dateLabel(article.publishedAt.slice(0, 10)) : tr("Date unlisted", "日期未列")}</span>
              <span>{tr("Original:", "原文：")}{articleLanguageName(article.language, locale)}</span>
              {translated && <span className="topics-translation-badge">{titleOnlyTranslation ? tr("Translated headline", "繁中標題") : tr("Shared Traditional Chinese translation", "繁中譯文 · 共享")}</span>}
              {showMerged && merged.has(article.id) && <span>{tr("Merged source", "已合併來源")}</span>}
            </div>
            <h3><button type="button" className="topics-story-title" onClick={(event) => openReader(article, event.currentTarget)} lang={awaitingTranslation || translated ? "zh-Hant" : article.language}>{awaitingTranslation ? "正在準備繁中譯文…" : translated ? translation.title : article.title}</button></h3>
            {awaitingTranslation ? <p className="topics-story-text topics-translation-wait" role="status">正在翻譯這則來源…</p>
              : (bodyTranslated ? Boolean(body) : hasBody(article)) ? <MarkdownText source={body} dropTitle={bodyTranslated ? undefined : article.title} className={`topics-story-text${expanded.has(article.id) ? " expanded" : ""}`} />
              : <p className="topics-story-text">{translated ? tr("Open the source for the full story.", "開啟原文閱讀完整報導。") : tr("The source did not provide readable full text. Open the original.", "來源未提供可閱讀的全文，請開啟原文。")}</p>}
            <div className="topics-story-actions">
              <button type="button" className="topics-story-read" onClick={(event) => openReader(article, event.currentTarget)}>{tr("Read →", "閱讀 →")}</button>
              {!awaitingTranslation && body.length > 320 && <button type="button" className="topics-story-more" aria-expanded={expanded.has(article.id)} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(article.id)) next.delete(article.id); else next.add(article.id); return next; })}>{expanded.has(article.id) ? tr("Collapse ↑", "收起 ↑") : tr("Show full text ↓", "展開全文 ↓")}</button>}
              {article.language !== "zh-Hant" && <button type="button" className="topics-translate-action" disabled={awaitingTranslation || translationBusy.has(article.id) || translationPending.has(article.id)}
                onClick={() => translation && !(missingTranslationBody && translated) ? setShowOriginal((current) => { const next = new Set(current); if (next.has(article.id)) next.delete(article.id); else next.add(article.id); return next; }) : void translateArticle(article)}>
                {awaitingTranslation || translationBusy.has(article.id) || translationPending.has(article.id) ? tr("Translating…", "翻譯中…") : missingTranslationBody && translated ? tr("Translate article text", "翻譯報導內容") : translation ? translated ? tr("Original", "原文") : tr("Traditional Chinese", "繁中") : hasBody(article) ? tr("Translate to Traditional Chinese", "翻譯成繁中") : tr("Translate headline", "翻譯標題")}
              </button>}
              <a href={article.url} target="_blank" rel="noopener noreferrer">{tr("Read source ↗", "閱讀來源 ↗")}</a>
              <button type="button" className={storyState?.collected ? "topics-story-collected active" : "topics-story-collected"} aria-pressed={Boolean(storyState?.collected)} onClick={() => void updateStoryState(article, { collected: !storyState?.collected })}>{storyState?.collected ? tr("♥ Collected", "♥ 已收藏") : tr("♡ Collect", "♡ 收藏")}</button>
              <button type="button" data-lab-feature className={`topics-story-save${saved.has(article.id) ? " saved" : ""}`} onClick={() => void saveArticle(article)}>{saved.has(article.id) ? tr("◇ Saved to Topics Lab", "◇ 已存入新聞實驗室") : tr("+ Save to Topics Lab", "+ 存入新聞實驗室")}</button>
            </div>
            {translationErrors[article.id] && <small className="topics-translation-error" role="alert">{translationErrors[article.id]}</small>}
          </div>
        </article>;
      })}</div></SelectionArea>
      <SelectionBar scope={storySelection} noun="story" nouns="stories" />
      {news && !loading && !error && <div ref={refreshSentinelRef} className="topics-refresh-more">
        <div className="topics-end-directions" role="group" aria-label={tr("Switch news topic", "切換新聞主題")}>
          {topics.map((item) => <button key={item.id} type="button" className={topic === item.id && !query ? "selected" : ""} onClick={() => select(date, item.id, "")}>{locale === "zh-Hant" ? topicLabelZh(item.id) : item.label}</button>)}
          {directions.map((item) => <button key={item.id} type="button" className={selectedDirection?.id === item.id ? "selected" : ""} onClick={() => select(date, "all", item.query)}>{item.label}</button>)}
          <button type="button" aria-label={tr("Add news direction", "新增新聞主題方向")} onClick={() => setDirectionOpen(true)}>＋</button>
        </div>
        <button type="button" disabled={refreshingNews} onClick={() => {
          lastScrollAdvanceAt.current = Date.now();
          if (displayLimit < allVisible.length) setDisplayLimit((count) => Math.min(count + 15, allVisible.length));
          else {
            const olderPage = rangeFrom ? 0 : [1, 2, 3, 4].find((page) => !news.loadedOlderPages?.includes(page)) ?? 0;
            const nextAllowed = Math.max(0, ...(news.processing ?? []).map((item) => Date.parse(item.nextAllowedAt) || 0));
            const blocked = olderPage === 0 && nextAllowed > Date.now();
            if (blocked && !window.confirm(tr(
              `Exa last checked this collection recently. An early search may make additional paid Exa requests. Search again now, before ${new Date(nextAllowed).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}?`,
              `Exa 最近已檢查這份選讀。提前重查可能產生額外的 Exa 請求費用。要在 ${new Date(nextAllowed).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })} 前立即重新搜尋嗎？`))) return;
            void refreshNews(olderPage, blocked);
          }
        }}>{refreshingNews ? tr("Finding sources…", "正在尋找來源…") : displayLimit < allVisible.length ? tr(`Keep reading · ${allVisible.length - visible.length} more`, `繼續閱讀 · 還有 ${allVisible.length - visible.length} 則`) :
          rangeFrom ? tr("Check this range with Exa ↻", "以 Exa 搜尋此區間 ↻") : (news.loadedOlderPages?.length ?? 0) < 4 ? tr("Search earlier sources with Exa · past 30 days ↻", "以 Exa 接續搜尋過去 30 天來源 ↻") : tr("Check for new sources with Exa ↻", "以 Exa 查看當日新來源 ↻")}</button>
        <span role="status">{refreshMessage || tr(`${visible.length}/${allVisible.length} loaded · scroll to the end to continue`, `${visible.length}/${allVisible.length} 則已載入 · 到頁尾繼續`)}</span>
      </div>}
    </section>
    {readerArticle && <TopicsReaderPanel
      article={readerArticle} index={readerIndex >= 0 ? readerIndex : 0} total={readerIndex >= 0 ? allVisible.length : 1}
      sources={readerSources} onSourceChange={(source) => { setCachedReaderArticle(null); setReaderId(source.id); const representative = representativeById.get(source.id); if (representative) setActiveSources((current) => ({ ...current, [representative]: source.id })); }}
      translation={translations[readerArticle.id]} showOriginal={locale === "zh-Hant" ? showOriginal.has(readerArticle.id) : !showOriginal.has(readerArticle.id)}
      translating={translationBusy.has(readerArticle.id) || translationPending.has(readerArticle.id)} translationError={translationErrors[readerArticle.id]}
      saved={saved.has(readerArticle.id)}
      reaction={storyStates[readerArticle.id]?.reaction ?? 0} collected={Boolean(storyStates[readerArticle.id]?.collected)}
      onReact={(reaction) => void updateStoryState(readerArticle, { reaction })}
      onCollect={() => void updateStoryState(readerArticle, { collected: !storyStates[readerArticle.id]?.collected })}
      onToggleOriginal={() => translations[readerArticle.id] && !(hasBody(readerArticle) && !translations[readerArticle.id].body.trim() && (locale === "zh-Hant" ? !showOriginal.has(readerArticle.id) : showOriginal.has(readerArticle.id)))
        ? setShowOriginal((current) => { const next = new Set(current); if (next.has(readerArticle.id)) next.delete(readerArticle.id); else next.add(readerArticle.id); return next; })
        : void translateArticle(readerArticle)}
      onSave={() => void saveArticle(readerArticle)}
      onPrevious={() => { setCachedReaderArticle(null); setReaderId(allVisible[readerIndex - 1]?.id ?? readerArticle.id); }}
      onNext={() => { setCachedReaderArticle(null); setReaderId(allVisible[readerIndex + 1]?.id ?? readerArticle.id); }}
      onClose={closeReader}
    />}
    {queryOpen && <div className="topics-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setQueryOpen(false); }}><section className="topics-dialog" role="dialog" aria-modal="true" aria-label={tr("Shape this collection", "自訂選讀方向")}>
      <div className="topics-dialog-head"><span>{tr("NEWS / SEARCH", "新聞／搜尋")}</span><button type="button" onClick={() => setQueryOpen(false)} aria-label={tr("Close search", "關閉搜尋")}>×</button></div>
      <h2>{tr("Shape this collection", "自訂選讀方向")}</h2><p>{tr("Enter a topic or event. Exa searches published source pages within the selected date or range, including broader discussion topics outside textiles. Results keep their original language and repeated URLs are removed. Older results are checked for direct relevance before appearing. The separate exact theme finder uses Jev on already cached articles.", "輸入主題或事件後，Exa 會搜尋所選日期或區間內發表的來源網頁，也能尋找紡織以外的討論話題。結果保留原文語言並移除重複網址；較早報導會先檢查是否直接相關。另一項「精確主題搜尋」則使用 Jev 比對已快取的報導。")}</p>
      <form className="topics-dialog-form" onSubmit={(event) => { event.preventDefault(); select(date, topic, queryDraft.trim()); }}><label htmlFor="topics-query-input">{tr("Search phrase", "搜尋詞")}</label><input id="topics-query-input" autoFocus value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} minLength={3} maxLength={250} placeholder={tr("Add a custom angle or search phrase", "加入自訂主題或搜尋詞")} /><div><button type="submit" disabled={queryDraft.trim().length < 3}>{rangeFrom ? tr("Search this range ↗", "搜尋此區間 ↗") : tr("Search this date ↗", "搜尋此日期 ↗")}</button>{query && <button type="button" className="topics-dialog-secondary" onClick={() => select(date, topic, "")}>{tr("Reset", "重設")}</button>}</div></form>
    </section></div>}
    {directionOpen && <div className="topics-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDirection(); }} onKeyDown={(event) => { if (event.key === "Escape") closeDirection(); }}><section className={`topics-dialog topics-direction-dialog${directionProposal ? " is-reviewing" : ""}`} role="dialog" aria-modal="true" aria-label={tr("Add news direction", "新增新聞主題方向")}>
      <div className="topics-dialog-head"><span>{tr("NEWS / TOPICS", "新聞／主題")}</span><button type="button" onClick={closeDirection} aria-label={tr("Close", "關閉")}>×</button></div>
      <h2>{tr("Add a direction", "新增主題方向")}</h2><p>{tr("Name the topic and describe the stories to find. Custom directions can cover broader sales discussion topics; Exa searches them across dates without the preset textile filter.", "替主題命名並描述要尋找的報導；自訂方向也能涵蓋銷售討論話題，Exa 會跨日期搜尋，不受預設紡織條件限制。")}</p>
      {!directionProposal ? <form className="topics-dialog-form" onSubmit={(event) => { event.preventDefault(); void addDirection(); }}>
        <div className="topics-direction-field-head"><label htmlFor="topics-direction-label">{tr("Topic name", "主題名稱")}</label><button type="button" className="topics-direction-generate" disabled={directionSuggestBusy || directionBusy} onClick={() => void suggestDirection()} aria-label={tr("Generate a topic suggestion", "產生主題建議")}>✦ {tr("Generate", "產生建議")}</button></div>
        <input id="topics-direction-label" autoFocus value={directionLabel} onChange={(event) => { cancelDirectionSuggestion(); setDirectionLabel(event.target.value); }} minLength={2} maxLength={32} placeholder={tr("e.g. Sustainable dyeing", "例如：永續染整")} />
        <div className="topics-direction-field-head"><label htmlFor="topics-direction-query">{tr("Search direction", "搜尋方向")}</label><button type="button" className="topics-direction-generate" disabled={directionSuggestBusy || directionBusy} onClick={() => void suggestDirection()} aria-label={tr("Generate a search direction", "產生搜尋方向")}>✦ {tr("Generate", "產生建議")}</button></div>
        <textarea id="topics-direction-query" value={directionQuery} onChange={(event) => { cancelDirectionSuggestion(); setDirectionQuery(event.target.value); }} minLength={3} maxLength={250} placeholder={tr("Describe what belongs in this topic", "描述這個主題要收錄哪些報導")} />
        <div className="topics-direction-form-foot"><small>{directionQuery.length}/250</small><button type="submit" disabled={directionBusy || directionSuggestBusy || directionLabel.trim().length < 2 || directionQuery.trim().length < 3}>{directionBusy ? tr("Adding…", "新增中…") : tr("Add topic", "新增主題")}</button></div>
        {directionSuggestBusy && <p className="topics-direction-status" role="status">{tr("Preparing a suggestion…", "正在整理主題建議…")}</p>}
        {directionSuggestError && <p className="topics-direction-error" role="alert">{directionSuggestError}</p>}
      </form> : <section className="topics-direction-review" aria-label={tr("Review generated suggestion", "確認產生的建議")}>
        <div className="topics-direction-review-head"><span>✦ {tr("SUGGESTION", "主題建議")}</span><strong>{directionProposal.mode === "polish" ? tr("Review the refined wording", "確認潤飾後的內容") : tr("Review before inserting", "確認後再填入")}</strong></div>
        <p>{tr("Nothing changes until you insert this suggestion. You can edit it afterward.", "確認前不會變更欄位；填入後仍可自行修改。")}</p>
        <div className="topics-direction-preview"><div><span>{tr("TOPIC NAME", "主題名稱")}</span><strong>{directionProposal.title}</strong>{directionProposal.sourceTitle && directionProposal.sourceTitle !== directionProposal.title && <small>{tr("Current", "目前")}：{directionProposal.sourceTitle}</small>}</div>
          <div><span>{tr("SEARCH DIRECTION", "搜尋方向")}</span><p>{directionProposal.direction}</p>{directionProposal.sourceDirection && directionProposal.sourceDirection !== directionProposal.direction && <small>{tr("Current", "目前")}：{directionProposal.sourceDirection}</small>}<em>{directionProposal.direction.length}/250</em></div></div>
        {directionSuggestError && <p className="topics-direction-error" role="alert">{directionSuggestError}</p>}
        <div className="topics-direction-review-actions"><button type="button" autoFocus onClick={acceptDirectionProposal} disabled={directionSuggestBusy}>{tr("Insert suggestion", "填入建議")}</button><button type="button" className="secondary" onClick={() => void suggestDirection(directionProposal)} disabled={directionSuggestBusy}>{directionSuggestBusy ? tr("Generating…", "產生中…") : tr("Regenerate", "重新產生")}</button><button type="button" className="plain" onClick={() => { setDirectionProposal(null); setDirectionSuggestError(""); }} disabled={directionSuggestBusy}>{tr("Back to editing", "返回編輯")}</button></div>
      </section>}
      {directions.length > 0 && <div className="topics-dialog-directions"><strong>{tr("Your directions", "你的主題方向")}</strong>{directions.map((item) => <div key={item.id}><span>{item.label}</span><button type="button" onClick={() => void removeDirection(item.id)} aria-label={tr(`Remove ${item.label}`, `移除${item.label}`)}>×</button></div>)}</div>}
    </section></div>}
    {collectedOpen && <div className="topics-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCollectedOpen(false); }}><section className="topics-dialog topics-collected-panel" role="dialog" aria-modal="true" aria-label={tr("Collected news", "新聞收藏夾")}>
      <div className="topics-dialog-head"><span>{tr("NEWS / COLLECTION", "新聞／收藏夾")}</span><button type="button" onClick={() => setCollectedOpen(false)} aria-label={tr("Close", "關閉")}>×</button></div>
      <h2>{tr("Collected news", "新聞收藏夾")}</h2><p>{tr(`${collectedStories.length} stories saved for later reading`, `已收藏 ${collectedStories.length} 則報導，方便稍後閱讀`)}</p>
      <div className="topics-collected-list">{collectedStories.length ? collectedStories.map((item) => <div key={item.id} className="topics-collected-item">
        <span>{item.article.source} · {item.article.publishedAt?.slice(0, 10) ?? ""}</span><strong>{item.article.title}</strong>
        <div className="topics-collected-actions"><button type="button" onClick={() => { readerTriggerRef.current = null; setCachedReaderArticle(item.article); setReaderId(item.article.id); setCollectedOpen(false); }}>{tr("Read here", "站內閱讀")}</button><a href={item.article.url} target="_blank" rel="noopener noreferrer">{tr("Open source ↗", "閱讀來源 ↗")}</a><button type="button" className="topics-collected-remove" onClick={() => void updateStoryState(item.article, { collected: false })}>{tr("Remove", "移除")}</button></div>
      </div>) : <p>{tr("Collect an article from the feed or reader to see it here.", "在列表或閱讀視窗收藏報導後，便會顯示於此。")}</p>}</div>
    </section></div>}
  </CollectionLayout>;
}
