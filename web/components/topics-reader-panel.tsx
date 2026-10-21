"use client";

import { useEffect, useRef, useState } from "react";
import { MarkdownText } from "@/components/markdown-text";
import { articleLanguageName, dateLabel, dateLabelZh, hasBody, readableSummary, topicLabelZh, topics, type Article } from "@/lib/topics-news";
import { useI18n } from "@/lib/i18n";
import { TopicsArticleImage } from "@/components/topics-article-image";

type Translation = { title: string; body: string };

export function TopicsReaderPanel({ article, index, total, sources, onSourceChange, translation, showOriginal, translating, translationError, saved, reaction, collected, onToggleOriginal, onSave, onReact, onCollect, onPrevious, onNext, onClose }: {
  article: Article;
  index: number;
  total: number;
  sources: Article[];
  onSourceChange: (article: Article) => void;
  translation?: Translation;
  showOriginal: boolean;
  translating: boolean;
  translationError?: string;
  saved: boolean;
  reaction: -1 | 0 | 1;
  collected: boolean;
  onToggleOriginal: () => void;
  onSave: () => void;
  onReact: (reaction: -1 | 0 | 1) => void;
  onCollect: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const { locale, tr } = useI18n();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [fontSize, setFontSize] = useState(17);
  const translated = Boolean(translation && (locale === "zh-Hant" ? !showOriginal : showOriginal));
  const awaitingTranslation = locale === "zh-Hant" && article.language !== "zh-Hant" && !translation && translating;
  const sourceHasBody = hasBody(article);
  const titleOnlyTranslation = Boolean(translation && !translation.body.trim());
  const missingTranslationBody = titleOnlyTranslation && sourceHasBody;
  const bodyTranslated = translated && !titleOnlyTranslation;
  const body = bodyTranslated ? translation!.body : readableSummary(article.summary);

  useEffect(() => {
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.body.style.overflow = priorOverflow; };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [article.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key === "Tab") {
        const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? [])];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        return;
      }
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); onPrevious(); }
      if (event.key === "ArrowRight" && index < total - 1) { event.preventDefault(); onNext(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [index, total, onClose, onPrevious, onNext]);

  return <div className="topics-reader-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panelRef} className={`topics-reader-panel${fullScreen ? " is-fullscreen" : ""}`} role="dialog" aria-modal="true" aria-labelledby="topics-reader-title">
      <div className="topics-reader-toolbar">
        <span>{tr("Today's reading", "今日閱讀")} <span className="topics-reader-count">{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span></span>
        <div className="topics-reader-tools">
          <label htmlFor="topics-reader-font-size">{tr("Text size", "字體大小")} <input id="topics-reader-font-size" type="range" min="14" max="26" step="1" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} aria-valuetext={`${fontSize}px`} /></label>
          <button type="button" onClick={() => setFullScreen((value) => !value)} aria-pressed={fullScreen}>{fullScreen ? tr("Exit full screen", "結束全螢幕") : tr("Full screen", "全螢幕")}</button>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={tr("Close reader", "關閉閱讀視窗")}>{tr("Close", "關閉")} ×</button>
        </div>
      </div>
      <div ref={scrollRef} className="topics-reader-scroll" key={article.id}>
        <article className="news-reader-article">
          {sources.length > 1 && <div className="topics-source-switcher topics-reader-sources" aria-label={tr("Sources reporting this story", "報導此事件的來源")}>
            <span className="topics-source-caption">{tr(`${new Set(sources.map((source) => source.source)).size} source sites · ${sources.length} original articles`, `${new Set(sources.map((source) => source.source)).size} 個來源網站 · ${sources.length} 篇原始報導`)}</span>
            <div className="topics-source-controls"><div className="topics-source-pills">{sources.map((source) => <button key={source.id} type="button" className={source.id === article.id ? "active" : ""} aria-pressed={source.id === article.id} title={source.title} onClick={() => onSourceChange(source)}>{source.source}</button>)}</div>
              <button type="button" className="topics-source-next" aria-label={tr("View next source", "查看下一個來源")} onClick={() => onSourceChange(sources[(sources.findIndex((source) => source.id === article.id) + 1) % sources.length])}>→</button></div>
          </div>}
          <header>
            <div className="news-reader-meta">
              {article.topic && <span className="topics-story-topic">{locale === "zh-Hant" ? topicLabelZh(article.topic) : topics.find((item) => item.id === article.topic)?.label}</span>}
              <span>{article.source}</span>
              <span>{article.publishedAt ? locale === "zh-Hant" ? dateLabelZh(article.publishedAt.slice(0, 10)) : dateLabel(article.publishedAt.slice(0, 10)) : tr("Date unlisted", "日期未列")}</span>
              <span>{tr("Original: ", "原文：")}{articleLanguageName(article.language, locale)}</span>
              {translated && <span className="topics-translation-badge">{titleOnlyTranslation ? tr("Translated headline", "繁中標題") : tr("Shared Traditional Chinese translation", "繁中譯文 · 共享")}</span>}
            </div>
            <h1 id="topics-reader-title" lang={awaitingTranslation || translated ? "zh-Hant" : article.language}>{awaitingTranslation ? tr("Preparing Traditional Chinese translation…", "正在準備繁中譯文…") : translated ? translation!.title : article.title}</h1>
          </header>
          {article.image && <TopicsArticleImage key={article.image} src={article.image} reader />}
          <div className="news-reader-actions">
            <a href={article.url} target="_blank" rel="noopener noreferrer" className="news-reader-primary">{tr("Read source ↗", "閱讀來源 ↗")}</a>
            {article.language !== "zh-Hant" && <button type="button" className="news-reader-translate" disabled={translating} onClick={onToggleOriginal}>{translating ? tr("Translating…", "翻譯中…") : missingTranslationBody && translated ? tr("Translate article text", "翻譯報導內容") : translation ? translated ? tr("Original", "原文") : tr("Traditional Chinese", "繁中") : sourceHasBody ? tr("Translate to Traditional Chinese", "翻譯成繁中") : tr("Translate headline", "翻譯標題")}</button>}
            <button type="button" className={saved ? "saved" : ""} onClick={onSave}>{saved ? tr("◇ Saved to Topics Lab", "◇ 已存入新聞實驗室") : tr("+ Save to Topics Lab", "+ 存入新聞實驗室")}</button>
            <button type="button" className={collected ? "active" : ""} aria-pressed={collected} onClick={onCollect}>{collected ? tr("♥ Collected", "♥ 已收藏") : tr("♡ Collect", "♡ 收藏")}</button>
            <div className="news-reader-reactions" role="group" aria-label={tr("Your reaction", "你的評價")}><button type="button" aria-pressed={reaction === 1} onClick={() => onReact(reaction === 1 ? 0 : 1)}>{tr("Like", "喜歡")} ♥</button><button type="button" aria-pressed={reaction === -1} onClick={() => onReact(reaction === -1 ? 0 : -1)}>{tr("Dislike", "不喜歡")} ▾</button></div>
          </div>
          {translationError && <p className="news-reader-translation-error" role="alert">{translationError}</p>}
          {missingTranslationBody && translated && <p className="news-reader-status">{tr("The headline is translated. The original excerpt is shown until you translate the article text.", "目前只有標題有譯文。翻譯報導內容前，先顯示原文摘錄。")}</p>}
          {awaitingTranslation ? <p className="news-reader-status" role="status">{tr("Translating this source…", "正在翻譯這則來源…")}</p>
            : (bodyTranslated ? Boolean(body) : sourceHasBody)
              ? <div style={{ fontSize }} lang={bodyTranslated ? "zh-Hant" : article.language}><MarkdownText source={body} dropTitle={bodyTranslated ? undefined : article.title} className="news-reader-text" /></div>
              : <p className="news-reader-empty">{tr("The source did not provide readable full text. Open the original.", "來源未提供可閱讀的全文，請開啟原文。")}</p>}
          <p className="news-reader-note">{bodyTranslated ? tr("This shared AI translation comes from a search excerpt. Read the source site for the complete story.", "這是共用的 AI 譯文，內容來自搜尋擷取的摘要；完整報導請見來源網站。") : tr("Content comes from a search excerpt and may be shortened. Read the source site for the complete story.", "內容來自搜尋擷取的摘要，可能有所節錄；完整報導請見來源網站。")}</p>
        </article>
      </div>
      <nav className="topics-reader-pager" aria-label={tr("Switch stories", "切換報導")}>
        <button type="button" disabled={index === 0} onClick={onPrevious}>{tr("← Previous", "← 上一則")}</button>
        <button type="button" disabled={index === total - 1} onClick={onNext}>{tr("Next →", "下一則 →")}</button>
      </nav>
    </section>
  </div>;
}
