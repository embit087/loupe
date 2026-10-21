"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CustomStudy, StudyCategory } from "@/lib/custom-lab";
import { SelectToggle, SelectionArea, SelectionBar, useSelectionScope } from "@/components/selection-scope";
import { useI18n } from "@/lib/i18n";

export function CustomStudyList({ category }: { category: StudyCategory }) {
  const { tr } = useI18n();
  const router = useRouter();
  const [studies, setStudies] = useState<CustomStudy[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const selection = useSelectionScope(`custom-studies:${category}`, studies.map((study) => study.id));
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    function refresh() {
      fetch(`/api/custom-studies?category=${category}`, { cache: "no-store" })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Studies unavailable");
          if (active) { setStudies(result.studies); setError(""); }
        })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Studies unavailable"); })
        .finally(() => { if (active) setReady(true); });
    }
    refresh();
    window.addEventListener("collections-custom-studies-changed", refresh);
    return () => { active = false; window.removeEventListener("collections-custom-studies-changed", refresh); };
  }, [category]);

  async function createStudy() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/custom-studies", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      const result = await response.json();
      if (!response.ok || !result.study?.id) throw new Error(result.error || "Could not create study");
      router.push(category === "topics" ? `/topics/studies/${result.study.id}` : `/exp-lab/studies/${result.study.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create study");
      setBusy(false);
    }
  }

  return <section className="custom-studies" aria-labelledby="custom-studies-heading">
    <div className="lab-frames-heading">
      <div><p className="eyebrow">{tr("Your workspace", "你的工作區")}</p><h2 id="custom-studies-heading">{tr("Open studies", "進行中的研究")}</h2></div>
      <div className="section-actions">
        {studies.length > 0 && <SelectToggle scope={selection} noun="study" nouns="studies" />}
        <button className="custom-study-create" type="button" disabled={busy} onClick={() => void createStudy()}>
          {busy ? tr("Creating…", "建立中…") : tr("+ New blank study", "+ 建立空白研究")}
        </button>
      </div>
    </div>
    <p className="custom-study-description">{category === "topics"
      ? tr("Build a study from saved news sources, notes, links, and uploaded material.", "使用已存新聞來源、筆記、連結與上傳素材建立研究。")
      : tr("Build a study from collected posts, frames, transcripts, OCR, captions, media, uploads, and your own notes.", "使用收藏貼文、影片畫面、語音逐字稿、OCR、說明文字、媒體、上傳素材與筆記建立研究。")}</p>
    {error && <p className="custom-study-error" role="alert">{error}</p>}
    {!ready && !error && <p className="custom-study-muted" role="status">{tr("Loading studies…", "正在載入研究…")}</p>}
    {ready && studies.length === 0 && !error && <p className="custom-study-empty">{tr("No open studies yet. Start with a blank canvas.", "目前沒有進行中的研究，先從空白頁開始。")}</p>}
    {studies.length > 0 && <SelectionArea scope={selection}><div className="custom-study-list">
      {studies.map((study) => <Link key={study.id} href={study.category === "topics" ? `/topics/studies/${study.id}` : `/exp-lab/studies/${study.id}`} className="custom-study-list-item" data-select-id={study.id}>
        <span className="eyebrow">{study.category} / {tr("shared study", "共用研究")}</span>
        <strong>{study.title}</strong>
        <span>{study.assetCount ?? 0} {tr((study.assetCount ?? 0) === 1 ? "asset" : "assets", "項素材")} · {tr("Open study ↗", "開啟研究 ↗")}</span>
      </Link>)}
    </div></SelectionArea>}
    <SelectionBar scope={selection} noun="study" nouns="studies" />
  </section>;
}
