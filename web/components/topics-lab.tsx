"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CustomStudyList } from "@/components/custom-study-list";
import { AddTopicToStudyButton } from "@/components/add-to-study";
import { useI18n } from "@/lib/i18n";

type LabItem = { id: string; collectionKey: string; url: string; title: string; summary: string; topic: string; publishedAt: string | null; note: string; savedAt: string };

export function TopicsLab() {
  const { tr } = useI18n();
  const [items, setItems] = useState<LabItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/topics/lab", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const value = await response.json() as { items?: LabItem[]; error?: string };
      if (!response.ok) throw new Error(tr("Topics Lab unavailable", "新聞實驗室暫時無法使用"));
      if (!controller.signal.aborted) { setItems(value.items ?? []); setLoading(false); }
    }).catch((cause) => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : tr("Topics Lab unavailable", "新聞實驗室暫時無法使用")); setLoading(false); } });
    return () => controller.abort();
  }, [tr]);
  const update = async (item: LabItem, change: { selected?: boolean; note?: string }) => {
    const key = item.collectionKey.split(":");
    const params = new URLSearchParams({ date: key[2], topic: key[3] });
    const response = await fetch(`/api/topics/lab?${params}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, ...change }) });
    if (!response.ok) { setError(tr("Could not save this change.", "無法儲存這項變更。")); return; }
    if (change.selected === false) setItems((current) => current.filter((row) => row.id !== item.id));
    if (typeof change.note === "string") setItems((current) => current.map((row) => row.id === item.id ? { ...row, note: change.note! } : row));
  };
  return <div className="topics-page topics-lab-page"><div className="topics-kicker"><Link href="/topics">{tr("Topics / News", "主題／新聞")}</Link><span>{tr("Independent workspace", "獨立工作區")}</span></div><div className="topics-hero"><div><p className="eyebrow">{tr("Selected signals", "精選線索")}</p><h1>{tr("Topics Lab.", "新聞實驗室")}</h1><p>{tr("Collect sources, add working notes, and bring material into a study.", "收藏資料來源、記下想法，再把素材加入研究。")}</p></div><Link href="/topics" className="topics-lab-link">↗ {tr("Browse news", "瀏覽新聞")}</Link></div><CustomStudyList category="topics" /><div className="topics-lab-heading"><span>{items.length} {tr("saved sources", "則已收藏來源")}</span><span>{tr("Notes stay with each source.", "筆記會與來源一起保存。")}</span></div>{loading && <div className="topics-empty">{tr("Opening your Topics Lab…", "正在開啟新聞實驗室…")}</div>}{error && <div className="topics-empty topics-error" role="alert">{error}</div>}{!loading && !items.length && !error && <div className="topics-empty">{tr("Your Topics Lab is empty. Browse the dated news collections and save anything worth revisiting.", "新聞實驗室目前沒有素材。瀏覽每日新聞，把值得回顧的報導存進來。")}</div>}<div className="topics-lab-grid">{items.map((item) => <article key={item.id} className="topics-lab-card"><div className="topics-lab-card-head"><span>{item.topic.replaceAll("-", " ")} · {item.publishedAt?.slice(0, 10) ?? tr("date unlisted", "日期未列出")}</span><button type="button" onClick={() => void update(item, { selected: false })} aria-label={tr(`Remove ${item.title} from Topics Lab`, `從新聞實驗室移除 ${item.title}`)}>×</button></div><h2>{item.title}</h2><p>{item.summary}</p><div className="topics-lab-card-actions"><a href={item.url} target="_blank" rel="noopener noreferrer">{tr("Open source ↗", "開啟來源 ↗")}</a><AddTopicToStudyButton topicItemId={item.id} title={item.title} /></div><label>{tr("Working note", "研究筆記")}<textarea key={`${item.id}:${item.note}`} defaultValue={item.note} maxLength={3000} placeholder={tr("Why does this matter? What might this spark?", "這則內容為何重要？帶來什麼想法？")} onBlur={(event) => { if (event.target.value !== item.note) void update(item, { note: event.target.value }); }} /></label></article>)}</div></div>;
}
