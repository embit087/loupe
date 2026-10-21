"use client";

import { readableSummary, topicLabelZh, topics, type Article, type Topic } from "@/lib/topics-news";
import { useI18n } from "@/lib/i18n";
import { useEffect, useState } from "react";

type ExaLedger = { collectionCount: number; requestCount: number; pricedCount: number; unpricedCount: number;
  reportedUsd: number; estimatedUnpricedUsd: { min: number; max: number }; estimatedTotalUsd: { min: number; max: number };
  requests: { date: string; topic: string; fetchedAt: string; olderPage: number; language: string; status: number; request: { query?: string; numResults?: number }; costUsd: number | null; estimatedUsd: { min: number; max: number } }[];
  translations: { requestCount: number; completedCount: number; failedCount: number; uniqueArticleCount: number; meteredCount: number;
    inputTokens: number; outputTokens: number; totalTokens: number; cachedInputTokens: number;
    days: { date: string; completed: number; failed: number; inputTokens: number; outputTokens: number; totalTokens: number }[];
    runs: { articleId: string; title: string | null; model: string; processedAt: string; status: number; completed: boolean;
      inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; cachedInputTokens: number | null }[] };
  suggestions: { requestCount: number; completedCount: number; failedCount: number; meteredCount: number;
    inputTokens: number; outputTokens: number } | null };

export type NewsProcessing = {
  topic?: Topic;
  endpoint: string;
  requests: { query: string; type: string; numResults: number; startPublishedDate: string; endPublishedDate: string; contents: { text: { maxCharacters: number } } }[];
  refreshCooldownSeconds: number;
  lastCheckedAt: string;
  nextAllowedAt: string;
  exaEstimateUsd: { min: number; max: number };
  exaRuns: { fetchedAt: string; exaCostUsd: number }[];
  exaObservedTotalUsd: number;
  olderRequests?: NewsProcessing["requests"];
  olderReview?: { model: string; threshold: number; instructions: string;
    jevRuns: { olderPage: number; fetchedAt: string; checked: number; accepted: number; inputTokens: number; outputTokens: number }[] };
  initialReview?: { model: string; checked: number; accepted: number };
  filters: string[];
  translation: { model: string; maxOutputTokens: number; instructions: string; input: string };
};

export type TranslationMeter = { cache: "hit" | "miss"; input: number; output: number; total: number };

const dollars = (value: number) => `$${value.toFixed(3)}`;
const number = (value: number) => Math.round(value).toLocaleString();

export function TopicsProcessingPanel({ processing, articles, newArticleIds, translationMeter, onClose }: {
  processing: NewsProcessing[];
  articles: Article[];
  newArticleIds: string[];
  translationMeter: Record<string, TranslationMeter>;
  onClose: () => void;
}) {
  const { locale, tr } = useI18n();
  const topicName = (topic: Topic) => locale === "zh-Hant" ? topicLabelZh(topic) : topics.find((item) => item.id === topic)?.label ?? topic;
  const [ledger, setLedger] = useState<ExaLedger | null>(null);
  const [ledgerError, setLedgerError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/topics/cost", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return await response.json() as ExaLedger; })
      .then((value) => { if (!controller.signal.aborted) setLedger(value); })
      .catch(() => { if (!controller.signal.aborted) setLedgerError(tr("Usage history unavailable", "無法取得用量紀錄")); });
    return () => controller.abort();
  }, [tr]);
  const minExa = processing.reduce((sum, item) => sum + item.exaEstimateUsd.min, 0);
  const maxExa = processing.reduce((sum, item) => sum + item.exaEstimateUsd.max, 0);
  const jevRuns = processing.flatMap((item) => item.olderReview?.jevRuns ?? []);
  const jevInput = jevRuns.reduce((sum, item) => sum + item.inputTokens, 0);
  const jevOutput = jevRuns.reduce((sum, item) => sum + item.outputTokens, 0);
  const newEnglish = articles.filter((article) => newArticleIds.includes(article.id) && article.language === "en");
  const characters = newEnglish.reduce((sum, article) => sum + article.title.length + readableSummary(article.summary).length, 0);
  const minInput = Math.ceil(characters / 5) + newEnglish.length * 80;
  const maxInput = Math.ceil(characters / 2) + newEnglish.length * 220;
  const maxOutput = newEnglish.length * (processing[0]?.translation.maxOutputTokens ?? 2400);
  const charged = newEnglish.map((article) => translationMeter[article.id]).filter((item) => item?.cache === "miss");
  const totals = charged.reduce((sum, item) => ({ input: sum.input + item.input, output: sum.output + item.output, total: sum.total + item.total }),
    { input: 0, output: 0, total: 0 });
  const finished = newEnglish.filter((article) => Boolean(translationMeter[article.id])).length;
  const nextAllowedAt = processing.map((item) => Date.parse(item.nextAllowedAt)).filter(Number.isFinite).sort((a, b) => b - a)[0];

  return <section className="topics-processing-panel" aria-label={tr("News processing and cost", "新聞處理流程與費用")}>
    <header className="topics-processing-head">
      <div><span className="topics-processing-eyebrow">{tr("NEWS / OPERATIONS", "新聞／處理紀錄")}</span><h2>{tr("Processing & cost", "處理流程與費用")}</h2></div>
      <button type="button" onClick={onClose} aria-label={tr("Close processing details", "關閉處理詳情")}>×</button>
    </header>
    <div className="topics-processing-body">
      <div className="topics-processing-intro">
        <p>{tr("The selected day is archived first. Scrolling past its stories searches four older windows covering 30 days. Jev admits only strongly relevant older sources. Complete Exa and Jev responses are saved with the collection.", "系統會先封存所選日期的報導。捲過當天報導後，會搜尋過去 30 天的四個時段；Jev 只會納入高度相關的舊報導。Exa 與 Jev 的完整回應會隨選讀紀錄保存。")}</p>
        <div className="topics-processing-pipeline" aria-label={tr("Processing stages", "處理階段")}>
          {[tr("01 · Archive", "01 · 封存"), tr("02 · Exa search", "02 · Exa 搜尋"), tr("03 · Jev review", "03 · Jev 篩選"), tr("04 · Translate", "04 · 翻譯")].map((stage) => <span key={stage}>{stage}</span>)}
        </div>
      </div>
      <div className="topics-processing-section-title"><h3>{tr("Cost overview", "費用總覽")}</h3><span>EXA / USD</span></div>
      <dl className="topics-processing-metrics">
        <div className="topics-processing-metric-primary"><dt>{tr("Estimated Exa cost so far", "目前 Exa 費用估計")}</dt><dd>{ledger ? `${dollars(ledger.estimatedTotalUsd.min)}–${dollars(ledger.estimatedTotalUsd.max)}` : ledgerError ? tr("Unavailable", "暫時無法取得") : "—"}</dd><small>{tr("All archived requests", "所有已封存請求")}</small></div>
        <div><dt>{tr("Next Exa refresh", "下次 Exa 更新")}</dt><dd>{dollars(minExa)}–{dollars(maxExa)}</dd><small>{tr("Estimated range", "估計區間")}</small></div>
        <div><dt>{tr("Archived Exa requests", "已封存的 Exa 請求")}</dt><dd>{ledger ? number(ledger.requestCount) : ledgerError ? "—" : "…"}</dd><small>{ledger ? `${number(ledger.collectionCount)} ${tr("collections", "份選讀紀錄")}` : ledgerError ? tr("Unavailable", "暫時無法取得") : tr("Loading…", "讀取中…")}</small></div>
      </dl>
      <div className="topics-processing-accounting">
        <div><span>{tr("Provider-reported cost", "供應商回報費用")}</span><strong>{ledger ? dollars(ledger.reportedUsd) : "—"}</strong><small>{ledger ? `${ledger.pricedCount}/${ledger.requestCount} ${tr("priced", "次已計價")}` : ""}</small></div>
        <div><span>{tr("Without a reported cost", "未回報費用的請求")}</span><strong>{ledger ? number(ledger.unpricedCount) : "—"}</strong><small>{ledger?.unpricedCount ? `${dollars(ledger.estimatedUnpricedUsd.min)}–${dollars(ledger.estimatedUnpricedUsd.max)} ${tr("estimated", "估計")}` : tr("No estimate needed", "無需估算")}</small></div>
      </div>
      <div className="topics-processing-section-title"><h3>{tr("Model usage", "模型用量")}</h3><span>TOKENS</span></div>
      <div className="topics-processing-models">
        <div><div className="topics-processing-model-head"><strong>OpenAI</strong><span>{newEnglish.length ? `${finished}/${newEnglish.length} ${tr("translated", "則已翻譯")}` : tr("No new English stories", "沒有新的英文報導")}</span></div><p>{tr("This refresh · estimated", "本次更新 · 預估")}: {newEnglish.length ? `${number(minInput)}–${number(maxInput + maxOutput)}` : "0"}</p><div className="topics-processing-token-pills"><span>{tr("Input", "輸入")} <b>{number(totals.input)}</b></span><span>{tr("Output", "輸出")} <b>{number(totals.output)}</b></span><span>{tr("Total", "合計")} <b>{number(totals.total)}</b></span></div></div>
        <div><div className="topics-processing-model-head"><strong>Jev</strong><span>{tr("Older story review", "舊報導篩選")}</span></div><p>{tr("Metered lookback usage", "回溯實際用量")}</p><div className="topics-processing-token-pills"><span>{tr("Input", "輸入")} <b>{number(jevInput)}</b></span><span>{tr("Output", "輸出")} <b>{number(jevOutput)}</b></span><span>{tr("Total", "合計")} <b>{number(jevInput + jevOutput)}</b></span></div></div>
      </div>
      <div className="topics-processing-section-title"><h3>{tr("OpenAI translation history", "OpenAI 翻譯歷史紀錄")}</h3><span>{tr("All saved runs", "所有已保存執行紀錄")}</span></div>
      <div className="topics-processing-translation-overview">
        <div><span>{tr("Completed translations", "已完成翻譯")}</span><strong>{ledger?.translations ? number(ledger.translations.completedCount) : ledgerError ? "—" : "…"}</strong><small>{ledger?.translations ? `${number(ledger.translations.uniqueArticleCount)} ${tr("distinct articles", "則不同報導")}` : ""}</small></div>
        <div><span>{tr("Recorded requests", "已記錄請求")}</span><strong>{ledger?.translations ? number(ledger.translations.requestCount) : ledgerError ? "—" : "…"}</strong><small>{ledger?.translations ? `${number(ledger.translations.failedCount)} ${tr("failed", "次失敗")} · ${number(ledger.translations.meteredCount)} ${tr("with usage", "次有用量資料")}` : ""}</small></div>
        <div><span>{tr("Metered tokens over time", "歷來已記錄 token")}</span><strong>{ledger?.translations ? number(ledger.translations.totalTokens) : ledgerError ? "—" : "…"}</strong><small>{ledger?.translations ? `${number(ledger.translations.inputTokens)} ${tr("input", "輸入")} · ${number(ledger.translations.outputTokens)} ${tr("output", "輸出")}` : ""}</small></div>
      </div>
      <div className="topics-processing-daily" role="region" aria-label={tr("OpenAI translation usage by day", "OpenAI 每日翻譯用量")}>
        <table><thead><tr><th>{tr("Day (UTC)", "日期（UTC）")}</th><th>{tr("Done", "完成")}</th><th>{tr("Failed", "失敗")}</th><th>{tr("Input", "輸入")}</th><th>{tr("Output", "輸出")}</th><th>{tr("Total", "合計")}</th></tr></thead>
          <tbody>{ledger?.translations.days.length ? ledger.translations.days.map((day) => <tr key={day.date}><th scope="row">{day.date}</th><td>{number(day.completed)}</td><td>{number(day.failed)}</td><td>{number(day.inputTokens)}</td><td>{number(day.outputTokens)}</td><td>{number(day.totalTokens)}</td></tr>) : <tr><td colSpan={6}>{ledgerError || (ledger ? tr("No saved translations yet", "尚無已保存的翻譯") : tr("Loading history…", "正在讀取歷史紀錄…"))}</td></tr>}</tbody></table>
      </div>
      <p className="topics-processing-history-note">{tr("Counts come from saved OpenAI responses. Cached reads are not new requests; tokens are summed only where the response includes usage.", "數據來自已保存的 OpenAI 回應。讀取快取不算新請求；只有回應提供用量資料時才會計入 token。")}</p>
      <div className="topics-processing-section-title"><h3>{tr("OpenAI topic suggestions", "OpenAI 主題建議")}</h3><span>gpt-5.4-mini</span></div>
      <div className="topics-processing-translation-overview">
        <div><span>{tr("Suggestion requests", "建議請求")}</span><strong>{ledger?.suggestions ? number(ledger.suggestions.requestCount) : ledgerError ? "—" : "…"}</strong><small>{ledger?.suggestions ? `${number(ledger.suggestions.completedCount)} ${tr("completed", "已完成")} · ${number(ledger.suggestions.failedCount)} ${tr("failed", "失敗")}` : ""}</small></div>
        <div><span>{tr("Metered requests", "已記錄用量請求")}</span><strong>{ledger?.suggestions ? number(ledger.suggestions.meteredCount) : ledgerError ? "—" : "…"}</strong><small>{tr("Usage is recorded from model responses", "用量依模型回應記錄")}</small></div>
        <div><span>{tr("Suggestion tokens", "主題建議 token")}</span><strong>{ledger?.suggestions ? number(ledger.suggestions.inputTokens + ledger.suggestions.outputTokens) : ledgerError ? "—" : "…"}</strong><small>{ledger?.suggestions ? `${number(ledger.suggestions.inputTokens)} ${tr("input", "輸入")} · ${number(ledger.suggestions.outputTokens)} ${tr("output", "輸出")}` : ""}</small></div>
      </div>
      <div className="topics-processing-refresh"><span>{tr("Next refresh eligible", "下次可更新時間")}</span><strong>{nextAllowedAt ? new Date(nextAllowedAt).toLocaleString(locale === "zh-Hant" ? "zh-TW" : "en-US") : tr("On next collection load", "下次載入選讀紀錄時")}</strong></div>
      <div className="topics-processing-section-title"><h3>{tr("Request and processing details", "請求與處理詳情")}</h3><span>{tr("Expand a section", "展開查看")}</span></div>
      <div className="topics-processing-details">
    <details><summary>{tr("Archived Exa request ledger", "Exa 請求紀錄")} ({ledger?.requestCount ?? 0})</summary>
      {ledgerError && <p role="alert">{tr("Could not load the request ledger:", "無法讀取請求紀錄：")} {ledgerError}</p>}
      {ledger?.requests.map((run, index) => <div className="topics-processing-request" key={`${run.date}-${run.topic}-${run.fetchedAt}-${run.language}-${index}`}>
        <strong>{run.date} · {topics.some((item) => item.id === run.topic) ? topicName(run.topic as Topic) : run.topic} · {run.language} · {run.olderPage ? tr(`older window ${run.olderPage}`, `回溯時段 ${run.olderPage}`) : tr("selected day", "所選日期")}</strong>
        <span>{new Date(run.fetchedAt).toLocaleString(locale === "zh-Hant" ? "zh-TW" : "en-US")} · HTTP {run.status} · {run.costUsd === null ? `${tr("estimated", "估計")} ${dollars(run.estimatedUsd.min)}–${dollars(run.estimatedUsd.max)}` : dollars(run.costUsd)}</span>
        <code>{run.request.query} · {run.request.numResults} {tr("results requested", "筆搜尋結果")}</code>
      </div>)}
    </details>
    <details><summary>{tr("OpenAI translation request ledger", "OpenAI 翻譯請求紀錄")} ({ledger?.translations.requestCount ?? 0})</summary>
      {ledger?.translations.runs.map((run, index) => <div className="topics-processing-request" key={`${run.articleId}-${run.processedAt}-${index}`}>
        <strong>{run.title || run.articleId} · {run.model}</strong>
        <span>{new Date(run.processedAt).toLocaleString(locale === "zh-Hant" ? "zh-TW" : "en-US")} · HTTP {run.status} · {run.completed ? tr("completed", "已完成") : tr("failed", "失敗")}</span>
        <code>{tr("Input", "輸入")} {run.inputTokens === null ? "—" : number(run.inputTokens)} · {tr("Output", "輸出")} {run.outputTokens === null ? "—" : number(run.outputTokens)} · {tr("Total", "合計")} {run.totalTokens === null ? "—" : number(run.totalTokens)}{run.cachedInputTokens ? ` · ${tr("cached input", "快取輸入")} ${number(run.cachedInputTokens)}` : ""}</code>
      </div>)}
    </details>
    <details><summary>{tr("Exa request parameters for this view", "此檢視的 Exa 請求參數")} ({processing.reduce((sum, item) => sum + item.requests.length, 0)})</summary>
      {processing.flatMap((item) => item.requests.map((request, index) => <div className="topics-processing-request" key={`${item.topic ?? "custom"}-${index}`}>
        <strong>{item.topic ? topicName(item.topic) : tr("Custom", "自訂")} · {index === 0 ? tr("Primary search", "主要搜尋") : tr("Traditional Chinese search", "繁中搜尋")}</strong>
        <code>{item.endpoint}</code>
        <pre>{JSON.stringify(request, null, 2)}</pre>
      </div>))}
    </details>
    <details><summary>{tr("Older search and Jev screening", "舊報導搜尋與 Jev 篩選")}</summary>
      <p>{processing[0]?.initialReview
        ? tr("Custom directions can include discussion topics outside textiles. Exa checks the chosen date first; Jev screens those results and each older window for at least 82% direct relevance.", "自訂方向可涵蓋紡織以外的討論話題。Exa 先搜尋所選日期，Jev 再檢查當日與較早時段的結果，要求至少 82% 的直接相關性。")
        : tr("Four non-overlapping windows cover days 1–7, 8–14, 15–21 and 22–30 before the selected date. Exa results first pass language, textile and region checks; Jev then requires at least 82% direct theme relevance.", "四個互不重疊的時段涵蓋所選日期前 1–7、8–14、15–21 及 22–30 天。Exa 結果先經語言、紡織與地區篩選，再由 Jev 要求至少 82% 的直接主題相關性。")}</p>
      {processing[0]?.initialReview && <p>{tr("Selected date", "所選日期")} · {processing[0].initialReview.checked} {tr("checked", "則已檢查")} · {processing[0].initialReview.accepted} {tr("accepted", "則已納入")}</p>}
      {processing[0]?.olderReview && <><code>{processing[0].olderReview.model} · threshold: {processing[0].olderReview.threshold}</code><pre>{processing[0].olderReview.instructions}</pre></>}
      {jevRuns.map((run, index) => <p key={`${run.olderPage}-${index}`}>{tr("Window", "時段")} {run.olderPage} · {run.checked} {tr("checked", "則已檢查")} · {run.accepted} {tr("accepted", "則已納入")} · {number(run.inputTokens)} {tr("in", "輸入")} / {number(run.outputTokens)} {tr("out", "輸出")}</p>)}
      {processing.flatMap((item) => (item.olderRequests ?? []).map((request, index) => <div className="topics-processing-request" key={`${item.topic ?? "custom"}-older-${index}`}>
        <strong>{item.topic ? topicName(item.topic) : tr("Custom", "自訂")} · {tr("older request", "舊報導請求")}</strong><code>{item.endpoint}</code><pre>{JSON.stringify(request, null, 2)}</pre>
      </div>))}
    </details>
    <details><summary>{tr("Processing rules and translation prompt", "處理規則與翻譯提示詞")}</summary>
      <ol>{processing[0]?.filters.map((rule) => <li key={rule}>{rule}</li>)}</ol>
      {processing[0] && <><p>{processing[0].translation.input}</p><code>{processing[0].translation.model} · max_output_tokens: {processing[0].translation.maxOutputTokens}</code><pre>{processing[0].translation.instructions}</pre></>}
    </details>
    <details><summary>{tr("Exa runs for this view", "此檢視的 Exa 執行紀錄")} ({processing.reduce((sum, item) => sum + item.exaRuns.length, 0)})</summary>
      <ul>{processing.flatMap((item) => item.exaRuns.map((run, index) => <li key={`${item.topic ?? "custom"}-${index}`}>
        {item.topic ? `${topicName(item.topic)} · ` : ""}{new Date(run.fetchedAt).toLocaleString(locale === "zh-Hant" ? "zh-TW" : "en-US")} · {dollars(run.exaCostUsd)}
      </li>))}</ul>
    </details>
      </div>
      <p className="topics-processing-note">{tr("Exa charges per search and for results above the included count, not by token. The cost range uses published rates only where the archived response has no provider-reported cost. Cached searches add no new Exa charge.", "Exa 依搜尋次數及超出內含數量的結果計費，不依 token 計費。只有封存回應未回報費用時，才依公開費率估算區間。讀取快取不會新增 Exa 費用。")} <a href="https://exa.ai/pricing" target="_blank" rel="noopener noreferrer">{tr("Exa pricing ↗", "Exa 費率 ↗")}</a></p>
    </div>
  </section>;
}
