"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MarkdownText } from "@/components/markdown-text";
import { TopicsArticleImage } from "@/components/topics-article-image";
import { useI18n } from "@/lib/i18n";
import { apiQuery, articleLanguageName, dateLabel, dateLabelZh, hasBody, readableSummary, topicLabelZh, topics, validDate, type Article, type Topic } from "@/lib/topics-news";

// A dedicated reading view for one Topics story: comfortable measure, the cleaned text,
// the source, saving to Topics Lab, and previous/next within the same dated collection.

type News = { from?: string; articles: Article[] };
type Translation = { title: string; body: string; model: "gpt-5.4-mini"; translatedAt: string };
type TranslationResult = { available: boolean; translation?: Translation; error?: string };

function readingMinutes(text: string) {
  const cjk = (text.match(/[㐀-鿿]/g) ?? []).length;
  const words = text.replace(/[㐀-鿿]/g, " ").split(/\s+/).filter(Boolean).length;
  // About 230 English words or 400 Chinese characters a minute.
  return Math.max(1, Math.round(words / 230 + cjk / 400));
}

export function NewsReader({ id, initialDate, initialFrom, initialTopic, initialQuery }: { id: string; initialDate?: string; initialFrom?: string; initialTopic?: string; initialQuery?: string }) {
  const { locale, tr } = useI18n();
  const router = useRouter();
  const date = validDate(initialDate);
  const from = initialFrom && validDate(initialFrom) === initialFrom && initialFrom < date ? initialFrom : undefined;
  const topic = (topics.some((item) => item.id === initialTopic) ? initialTopic : "all") as Topic;
  const query = initialQuery ?? "";
  const params = apiQuery(date, topic, query, from);
  const [news, setNews] = useState<News | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [translationState, setTranslationState] = useState<{ id: string; value: Translation } | null>(null);
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [showOriginalFor, setShowOriginalFor] = useState<string | null>(null);
  const [translationErrorState, setTranslationErrorState] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const [newsResponse, labResponse] = await Promise.all([
          fetch(`/api/topics/news?${params}`, { signal: controller.signal, cache: "no-store" }),
          fetch(`/api/topics/lab?${params}`, { signal: controller.signal, cache: "no-store" }),
        ]);
        const value = await newsResponse.json() as News & { error?: string };
        if (!newsResponse.ok) throw new Error(value.error ?? tr("News unavailable", "新聞暫時無法使用"));
        if (from && value.from !== from) throw new Error(tr("The news service has not been updated for date ranges yet.", "新聞服務尚未更新日期範圍功能。"));
        setNews(value);
        if (labResponse.ok) setSaved(new Set(((await labResponse.json() as { items?: { id: string }[] }).items ?? []).map((item) => item.id)));
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : tr("News unavailable", "新聞暫時無法使用"));
      }
    })();
    return () => controller.abort();
  }, [params, tr, from]);

  const articles = news?.articles ?? [];
  const index = articles.findIndex((item) => item.id === id);
  const article = index >= 0 ? articles[index] : null;
  const translation = translationState && translationState.id === article?.id ? translationState.value : null;
  const translating = translatingId === article?.id;
  const showOriginal = showOriginalFor === article?.id;
  const translationError = translationErrorState && translationErrorState.id === article?.id ? translationErrorState.message : "";
  const previous = index > 0 ? articles[index - 1] : null;
  const next = index >= 0 && index < articles.length - 1 ? articles[index + 1] : null;
  const translationUrl = article ? `/api/topics/translation?${new URLSearchParams({ date, topic, ...(from ? { from } : {}), ...(query ? { query } : {}), id: article.id,
    ...(topic === "all" && !query && article.topic ? { sourceTopic: article.topic } : {}) })}` : "";
  const readerHref = (item: Article) => `/topics/read/${item.id}?${params}`;
  const backHref = `/topics?${params}`;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowLeft" && previous) router.push(readerHref(previous));
      else if (event.key === "ArrowRight" && next) router.push(readerHref(next));
      else if (event.key === "Escape") router.push(backHref);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!translationUrl || !article || article.language === "zh-Hant" || locale !== "zh-Hant") return;
    const controller = new AbortController();
    const storyId = article.id;
    void (async () => {
      try {
        const cachedResponse = await fetch(translationUrl, { cache: "no-store", signal: controller.signal });
        const cached = cachedResponse.ok ? await cachedResponse.json() as TranslationResult : null;
        if (controller.signal.aborted) return;
        if (cached?.available && cached.translation) {
          setTranslationState({ id: storyId, value: cached.translation });
          return;
        }
        setTranslatingId(storyId);
        const response = await fetch(translationUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: controller.signal });
        const value = await response.json() as TranslationResult;
        if (!response.ok || !value.translation) throw new Error(value.error ?? tr("Translation unavailable", "翻譯暫時無法使用"));
        if (!controller.signal.aborted) setTranslationState({ id: storyId, value: value.translation });
      } catch (cause) {
        if (!controller.signal.aborted) setTranslationErrorState({ id: storyId, message: cause instanceof Error ? cause.message : tr("Translation unavailable", "翻譯暫時無法使用") });
      } finally {
        if (!controller.signal.aborted) setTranslatingId(null);
      }
    })();
    return () => controller.abort();
  }, [translationUrl, article, locale, tr]);

  async function translate() {
    if (!article || !translationUrl) return;
    if (translation) { setShowOriginalFor(showOriginal ? null : article.id); return; }
    setTranslatingId(article.id); setTranslationErrorState(null);
    try {
      const response = await fetch(translationUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const value = await response.json() as TranslationResult;
      if (!response.ok || !value.translation) throw new Error(value.error ?? tr("Translation unavailable", "翻譯暫時無法使用"));
      setTranslationState({ id: article.id, value: value.translation }); setShowOriginalFor(null);
    } catch (cause) { setTranslationErrorState({ id: article.id, message: cause instanceof Error ? cause.message : tr("Translation unavailable", "翻譯暫時無法使用") }); }
    finally { setTranslatingId(null); }
  }

  async function toggleSave() {
    if (!article) return;
    const selected = !saved.has(article.id);
    // In All, a story is saved against the topic collection it came from.
    const saveParams = topic === "all" && !query && article.topic ? apiQuery(date, article.topic, "") : params;
    setSaving(true);
    try {
      const response = await fetch(`/api/topics/lab?${saveParams}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: article.id, selected }) });
      if (!response.ok) throw new Error(tr("Could not update Topics Lab.", "無法更新新聞實驗室。"));
      setSaved((current) => { const copy = new Set(current); if (selected) copy.add(article.id); else copy.delete(article.id); return copy; });
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr("Could not update Topics Lab.", "無法更新新聞實驗室。")); }
    finally { setSaving(false); }
  }

  const topicLabel = (value?: Topic) => value ? tr(topics.find((item) => item.id === value)?.label ?? value, topicLabelZh(value)) : undefined;
  const dateText = (value: string) => locale === "zh-Hant" ? dateLabelZh(value) : dateLabel(value);
  const translated = Boolean(locale === "zh-Hant" && translation && !showOriginal);
  const awaitingTranslation = locale === "zh-Hant" && Boolean(article && article.language !== "zh-Hant") && !translation && !translationError;
  const body = article ? translated ? translation!.body : readableSummary(article.summary) : "";

  return <div className="news-reader">
    <nav className="news-reader-top" aria-label={tr("Reader navigation", "閱讀導覽")}>
      <Link href={backHref} className="news-reader-back">← {topicLabel(topic) ?? tr("Topics", "話題")} · {dateText(date)}</Link>
      {articles.length > 0 && index >= 0 && <span>{index + 1} / {articles.length}</span>}
    </nav>
    {!news && !error && <p className="news-reader-status" role="status">{tr("Opening story…", "正在開啟報導…")}</p>}
    {error && <p className="news-reader-status news-reader-error" role="alert">{error}</p>}
    {news && !article && <div className="news-reader-status">{tr(`This story is no longer in the news for ${dateText(date)}.`, `這則報導已不在 ${dateText(date)} 的新聞中。`)}<Link href={backHref}>{tr("Back to topics", "返回話題")} ↗</Link></div>}
    {article && <article className="news-reader-article">
      <header>
        <div className="news-reader-meta">
          {article.topic && <span className="topics-story-topic">{topicLabel(article.topic)}</span>}
          <span>{article.source}</span>
          <span>{article.publishedAt ? dateText(article.publishedAt.slice(0, 10)) : tr("Date unavailable", "日期未列")}</span>
          <span>{tr("Original:", "原文：")}{articleLanguageName(article.language, locale)}</span>
          {!awaitingTranslation && (translated ? Boolean(body) : hasBody(article)) && <span>{tr(`About ${readingMinutes(body)} min read`, `閱讀約 ${readingMinutes(body)} 分鐘`)}</span>}
          {translated && <span className="topics-translation-badge">{tr("Shared Chinese translation", "繁中譯文 · 共享")}</span>}
        </div>
        <h1 lang={awaitingTranslation || translated ? "zh-Hant" : article.language}>{awaitingTranslation ? tr("Preparing Chinese translation…", "正在準備繁中譯文…") : translated ? translation!.title : article.title}</h1>
      </header>
      {article.image && <TopicsArticleImage key={article.image} src={article.image} reader />}
      <div className="news-reader-actions">
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="news-reader-primary">{tr("Read source", "閱讀來源")} ↗</a>
        <button type="button" data-lab-feature className={saved.has(article.id) ? "saved" : ""} disabled={saving} onClick={() => void toggleSave()}>
          {saved.has(article.id) ? tr("◇ Saved to Topics Lab", "◇ 已存入新聞實驗室") : tr("+ Save to Topics Lab", "+ 存入新聞實驗室")}
        </button>
        {locale === "zh-Hant" && article.language !== "zh-Hant" && <button type="button" className="news-reader-translate" disabled={awaitingTranslation || translating} onClick={() => void translate()}>
          {awaitingTranslation || translating ? "翻譯中…" : translation ? translated ? "原文" : "繁中" : "重試"}
        </button>}
      </div>
      {translationError && <p className="news-reader-translation-error" role="alert">{translationError}</p>}
      {awaitingTranslation ? <p className="news-reader-status" role="status">{tr("Translating this source…", "正在翻譯這則來源…")}</p>
        : (translated ? Boolean(body) : hasBody(article))
        ? <MarkdownText source={body} dropTitle={translated ? undefined : article.title} className="news-reader-text" />
        : <p className="news-reader-empty">{tr("The source did not provide readable full text. Open the original story.", "來源未提供可閱讀的全文，請開啟原文。")}</p>}
      <p className="news-reader-note">{translated ? tr("This shared AI translation is based on the extracted summary; read the full story at the source.", "這是共用的 AI 譯文，內容來自搜尋擷取的摘要；完整報導請見來源網站。") : tr("This extracted summary may be abbreviated; read the full story at the source.", "內容來自搜尋擷取的摘要，可能有所節錄；完整報導請見來源網站。")}</p>
      <nav className="news-reader-pager" aria-label={tr("Other stories", "其他報導")}>
        {previous ? <Link href={readerHref(previous)} className="news-reader-prev"><span>← {tr("Previous", "上一則")}</span><strong>{tr(`Story ${index}`, `第 ${index} 則`)} · {previous.source}</strong></Link> : <span />}
        {next ? <Link href={readerHref(next)} className="news-reader-next"><span>{tr("Next", "下一則")} →</span><strong>{tr(`Story ${index + 2}`, `第 ${index + 2} 則`)} · {next.source}</strong></Link> : <span />}
      </nav>
    </article>}
  </div>;
}
