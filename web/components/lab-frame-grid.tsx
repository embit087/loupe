"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SelectToggle, SelectionArea, SelectionBar, useSelectionScope } from "@/components/selection-scope";
import { createPortal } from "react-dom";
import { labCategories } from "@/lib/lab-categories";
import { formatTimestamp } from "@/lib/experiment-lab";
import { AddToStudyButton } from "@/components/add-to-study";
import type { CollectionCategory } from "@/lib/atlas";
import { useI18n } from "@/lib/i18n";

type FrameItem = { id: string; uid: string; timeSeconds: number; href: string; image: string };
type LabelRow = { frameId: string; label: string };
type FrameCheck = { object: string; matched: boolean; source: string; cache: "hit" | "miss" };
type CheckResult = { key?: string; status?: string; matched?: boolean; source?: string; cache?: "hit" | "miss";
  error?: string; retryAfterSeconds?: number };
type PanelPlacement = { left: number; top?: number; bottom?: number; maxHeight: number };
type Props = {
  author: string;
  asset: string;
  category: CollectionCategory;
  kind: "video" | "carousel" | "photo";
  width: number;
  height: number;
  frames: FrameItem[];
};

async function readFrameCheck(response: Response, onStage: (stage: string) => void): Promise<{ status: number; result: CheckResult }> {
  if (!response.ok || !response.body) return { status: response.status, result: await response.json() as CheckResult };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outcome: { status: number; result: CheckResult } | null = null;
  const receive = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as { type: "stage"; stage: string } | { type: "result"; status: number; result: CheckResult };
    if (event.type === "stage") onStage(event.stage);
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
  if (!outcome) throw new Error("Frame check ended before returning a result");
  return outcome;
}

export function LabFrameGrid({ author, asset, category, kind, width, height, frames }: Props) {
  const { tr } = useI18n();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // The lasso drives the same selection the batch-label bar applies to.
  const selection = useSelectionScope(`frames:${author}/${asset}`, frames.map((frame) => frame.id),
    { value: new Set(selectedIds), onChange: (next) => setSelectedIds(frames.map((frame) => frame.id).filter((id) => next.has(id))) });
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [customLabels, setCustomLabels] = useState<string[]>([]);
  const [customName, setCustomName] = useState("");
  const [panelPlacement, setPanelPlacement] = useState<PanelPlacement | null>(null);
  const [labels, setLabels] = useState<Record<string, string[]>>({});
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportRows, setExportRows] = useState<{ id: string; url: string }[]>([]);
  const [exportError, setExportError] = useState("");
  const [copied, setCopied] = useState(false);
  const [classifyOpen, setClassifyOpen] = useState(false);
  const [classifyObject, setClassifyObject] = useState("");
  const [classifyRunning, setClassifyRunning] = useState(false);
  const [classifyStopped, setClassifyStopped] = useState(false);
  const [classifyCount, setClassifyCount] = useState(0);
  const [classifyTotal, setClassifyTotal] = useState(0);
  const [classifyMatches, setClassifyMatches] = useState<string[]>([]);
  const [classifyErrors, setClassifyErrors] = useState(0);
  const [classifyError, setClassifyError] = useState("");
  const [classifyStages, setClassifyStages] = useState<Record<string, string>>({});
  const [frameChecks, setFrameChecks] = useState<Record<string, FrameCheck[]>>({});
  const classifyAbort = useRef<AbortController | null>(null);
  const classifyInFlight = useRef(false);
  const mutating = useRef(false);
  const revision = useRef(0);
  const broadcast = useRef<BroadcastChannel | null>(null);
  const labelTriggerRef = useRef<HTMLButtonElement>(null);
  const newLabelTriggerRef = useRef<HTMLButtonElement>(null);
  const labelPanelRef = useRef<HTMLDivElement>(null);
  const customNameRef = useRef<HTMLInputElement>(null);
  const focusCustomName = useRef(false);
  const panelOpener = useRef<HTMLButtonElement | null>(null);
  const still = kind !== "video";
  const itemLabel = still ? tr("item", "項目") : tr("slide", "畫面");

  useEffect(() => () => classifyAbort.current?.abort(), []);

  useEffect(() => {
    let mounted = true;
    let loading = false;
    const controllers = new Set<AbortController>();
    async function refresh() {
      if (loading || mutating.current) return;
      loading = true;
      const currentRevision = revision.current;
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const params = new URLSearchParams({ author, asset });
        const response = await fetch(`/api/lab-frames?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(tr("Frame labels unavailable", "無法取得畫面標籤"));
        const result = await response.json() as { labels: LabelRow[]; customLabels: string[] };
        if (!Array.isArray(result.labels) || !Array.isArray(result.customLabels)) throw new Error(tr("Frame labels unavailable", "無法取得畫面標籤"));
        if (!mounted || currentRevision !== revision.current) return;
        const next: Record<string, string[]> = {};
        for (const row of result.labels) {
          if (typeof row.frameId !== "string" || typeof row.label !== "string") continue;
          next[row.frameId] = [...(next[row.frameId] ?? []), row.label];
        }
        setLabels(next);
        setCustomLabels(result.customLabels.filter((name) => typeof name === "string"));
        setReady(true);
        setError("");
      } catch (cause) {
        if (mounted && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : tr("Frame labels unavailable", "無法取得畫面標籤"));
      } finally {
        loading = false;
        controllers.delete(controller);
      }
    }
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(onVisible, 5000);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("collections-lab-frames");
      channel.onmessage = () => void refresh();
      broadcast.current = channel;
    }
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      for (const controller of controllers) controller.abort();
      broadcast.current?.close();
      broadcast.current = null;
    };
  }, [author, asset, tr]);

  useEffect(() => {
    if (!panelPlacement) return;
    function onOutside(event: PointerEvent) {
      if (event.target instanceof Node && !labelPanelRef.current?.contains(event.target)
        && !labelTriggerRef.current?.contains(event.target)
        && !newLabelTriggerRef.current?.contains(event.target)
        && !panelOpener.current?.contains(event.target)) setPanelPlacement(null);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") { setPanelPlacement(null); panelOpener.current?.focus(); }
    }
    function onScroll(event: Event) {
      if (event.target instanceof Node && labelPanelRef.current?.contains(event.target)) return;
      setPanelPlacement(null);
    }
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [panelPlacement]);

  useEffect(() => {
    if (panelPlacement && focusCustomName.current) {
      customNameRef.current?.focus();
      focusCustomName.current = false;
    }
  }, [panelPlacement]);

  function openLabelPanel(create: boolean, opener?: HTMLButtonElement) {
    if (create && panelPlacement) {
      customNameRef.current?.focus();
      return;
    }
    if (panelPlacement) { setPanelPlacement(null); return; }
    panelOpener.current = opener ?? (create ? newLabelTriggerRef : labelTriggerRef).current;
    const rect = panelOpener.current?.getBoundingClientRect();
    if (!rect) return;
    focusCustomName.current = create;
    const width = Math.min(300, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const above = window.innerHeight - rect.bottom < 280 && rect.top > window.innerHeight - rect.bottom;
    setPanelPlacement(above
      ? { left, bottom: window.innerHeight - rect.top + 6, maxHeight: Math.max(100, rect.top - 16) }
      : { left, top: rect.bottom + 6, maxHeight: Math.max(100, window.innerHeight - rect.bottom - 14) });
  }

  function toggleLabel(name: string) {
    setSelectedLabels((current) => current.includes(name)
      ? current.filter((item) => item !== name)
      : current.length < 12 ? [...current, name] : current);
    setMessage("");
  }

  function toggleSelected(id: string) {
    if (!selection.selecting) selection.enter();
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setMessage("");
  }

  async function applyLabels(enabled: boolean) {
    if (!ready || saving || selectedIds.length === 0 || selectedLabels.length === 0) return;
    const frameIds = [...selectedIds];
    const names = [...selectedLabels];
    mutating.current = true;
    revision.current += 1;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/lab-frames", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, asset, frameIds, labels: names, enabled }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(failure?.error || tr("Could not save frame labels", "無法儲存畫面標籤"));
      }
      const result = await response.json() as { frameIds: string[]; labels: string[]; enabled: boolean };
      if (!Array.isArray(result.frameIds) || result.frameIds.length !== frameIds.length
        || !frameIds.every((id) => result.frameIds.includes(id)) || !Array.isArray(result.labels)
        || result.labels.length !== names.length || !names.every((name) => result.labels.includes(name))
        || result.enabled !== enabled)
        throw new Error(tr("Could not confirm frame labels", "無法確認畫面標籤"));
      setLabels((current) => {
        const next = { ...current };
        for (const id of result.frameIds) {
          const existing = next[id] ?? [];
          next[id] = enabled ? [...new Set([...existing, ...names])] : existing.filter((name) => !names.includes(name));
        }
        return next;
      });
      setMessage(tr(`${enabled ? "Added" : "Removed"} ${names.length} ${names.length === 1 ? "label" : "labels"} ${enabled ? "to" : "from"} ${result.frameIds.length} ${result.frameIds.length === 1 ? itemLabel : `${itemLabel}s`}.`, `已${enabled ? "加入" : "移除"} ${names.length} 個標籤，套用於 ${result.frameIds.length} 個${itemLabel}。`));
      broadcast.current?.postMessage("changed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Could not save frame labels", "無法儲存畫面標籤"));
    } finally {
      mutating.current = false;
      revision.current += 1;
      setSaving(false);
    }
  }

  async function createCustomLabel() {
    const name = customName.trim();
    if (!name || name.length > 48 || saving || !ready) return;
    const existing = [...labCategories, ...customLabels].find((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) {
      setSelectedLabels((current) => current.includes(existing) || current.length >= 12 ? current : [...current, existing]);
      setCustomName("");
      setMessage(`${existing} is ready to use.`);
      return;
    }
    mutating.current = true;
    revision.current += 1;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/lab-frames", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(failure?.error || tr("Could not create custom label", "無法建立自訂標籤"));
      }
      const result = await response.json() as { label: string };
      if (typeof result.label !== "string") throw new Error(tr("Could not confirm custom label", "無法確認自訂標籤"));
      setCustomLabels((current) => [...new Set([...current, result.label])].sort((a, b) => a.localeCompare(b)));
      setSelectedLabels((current) => current.includes(result.label) || current.length >= 12 ? current : [...current, result.label]);
      setCustomName("");
      setMessage(`Created ${result.label}. Select frames to apply it.`);
      broadcast.current?.postMessage("changed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("Could not create custom label", "無法建立自訂標籤"));
    } finally {
      mutating.current = false;
      revision.current += 1;
      setSaving(false);
    }
  }

  async function exportUrls() {
    if (!selectedIds.length || exportBusy) return;
    setExportOpen(true); setExportBusy(true); setExportError(""); setExportRows([]); setCopied(false);
    try {
      const response = await fetch("/api/lab-frame-export", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, asset, frameIds: selectedIds }) });
      const value = await response.json() as { frames?: { id: string; url: string }[]; error?: string };
      if (!response.ok || !value.frames) throw new Error(value.error || tr("Could not generate URLs", "無法產生網址"));
      setExportRows(value.frames);
    } catch (cause) { setExportError(cause instanceof Error ? cause.message : tr("Could not generate URLs", "無法產生網址")); }
    finally { setExportBusy(false); }
  }

  async function classifyFrames() {
    const object = classifyObject.trim().replace(/\s+/g, " ");
    if (object.length < 2 || object.length > 80 || classifyInFlight.current) return;
    const targets = selectedIds.length ? frames.filter((frame) => selectedIds.includes(frame.id)) : frames;
    if (!targets.length) return;
    const controller = new AbortController();
    classifyAbort.current = controller;
    classifyInFlight.current = true;
    setClassifyRunning(true); setClassifyStopped(false); setClassifyCount(0); setClassifyTotal(targets.length);
    setClassifyMatches([]); setClassifyErrors(0); setClassifyError(""); setClassifyStages({});
    const matches = new Set<string>();
    let next = 0;
    let completed = 0;
    const wait = async (milliseconds: number) => {
      for (let elapsed = 0; elapsed < milliseconds && !controller.signal.aborted; elapsed += 250)
        await new Promise((resolve) => setTimeout(resolve, Math.min(250, milliseconds - elapsed)));
    };
    const check = async (frame: FrameItem) => {
      setClassifyStages((current) => ({ ...current, [frame.id]: "queued" }));
      try {
        let result: CheckResult | null = null;
        for (let attempt = 0; attempt < 4 && !controller.signal.aborted; attempt++) {
          const response = await fetch("/api/visual-find?stream=1", {
            method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
            body: JSON.stringify({ author, asset, frameId: frame.id, object, provider: "gpt-6-luna" }),
          });
          const received = await readFrameCheck(response, (stage) => setClassifyStages((current) => ({ ...current, [frame.id]: stage })));
          result = received.result;
          if (received.status !== 429) {
            if (received.status >= 400) throw new Error(result.error || `Frame ${frame.id} returned ${received.status}`);
            break;
          }
          setClassifyStages((current) => ({ ...current, [frame.id]: "rate_limit" }));
          await wait(1000 * (Math.min(300, Math.max(1, result.retryAfterSeconds || 3)) + 1));
        }
        if (controller.signal.aborted) return;
        if (result?.status !== "succeeded" || typeof result.matched !== "boolean")
          throw new Error(result?.error || tr("Frame classification unavailable", "無法辨識畫面"));
        if (result.matched) matches.add(frame.id);
        setFrameChecks((current) => {
          const previous = current[frame.id] ?? [];
          const entry: FrameCheck = { object, matched: result.matched!, source: result.source || "lab frame", cache: result.cache || "miss" };
          return { ...current, [frame.id]: [...previous.filter((item) => item.object.toLocaleLowerCase() !== object.toLocaleLowerCase()), entry] };
        });
        setClassifyMatches(frames.filter((item) => matches.has(item.id)).map((item) => item.id));
        setClassifyStages((current) => ({ ...current, [frame.id]: "done" }));
      } catch (cause) {
        if (!controller.signal.aborted) {
          setClassifyErrors((count) => count + 1);
          setClassifyError(cause instanceof Error ? cause.message : tr("Frame classification unavailable", "無法辨識畫面"));
          setClassifyStages((current) => ({ ...current, [frame.id]: "error" }));
        }
      } finally {
        completed++;
        setClassifyCount(completed);
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(8, targets.length) }, async () => {
        while (!controller.signal.aborted && next < targets.length) await check(targets[next++]);
      }));
      const found = frames.filter((frame) => matches.has(frame.id)).map((frame) => frame.id);
      setClassifyMatches(found);
      if (!controller.signal.aborted) {
        setSelectedIds(found);
        if (found.length) selection.enter();
      }
    } finally {
      setClassifyStopped(controller.signal.aborted);
      setClassifyRunning(false);
      classifyInFlight.current = false;
      classifyAbort.current = null;
    }
  }

  return <>
    <div className={`lab-frame-batch${selection.selecting ? " pinned" : ""}`} aria-label={tr("Batch frame labels", "批次畫面標籤")}>
      <SelectToggle scope={selection} noun={tr("frame", "畫面")} />
      <strong aria-live="polite">{selectedIds.length} {tr("selected", "個已選取")}</strong>
      <button type="button" onClick={() => setSelectedIds(frames.map((frame) => frame.id))} disabled={saving || selectedIds.length === frames.length}>{tr("Select all", "全選")}</button>
      <button type="button" onClick={() => setSelectedIds([])} disabled={saving || selectedIds.length === 0}>{tr("Clear", "清除")}</button>
      <button type="button" className="lab-frame-classify-trigger" aria-expanded={classifyOpen} aria-controls="lab-frame-classifier"
        onClick={() => { if (!classifyOpen && !classifyObject && selectedLabels.length === 1) setClassifyObject(selectedLabels[0]); setClassifyOpen(!classifyOpen); }}>
        ✦ {tr("Classify frames", "辨識畫面")}
      </button>
      <button type="button" className="lab-label-trigger" ref={labelTriggerRef} onClick={() => openLabelPanel(false)}
        aria-expanded={Boolean(panelPlacement)} aria-haspopup="dialog" aria-controls={panelPlacement ? "lab-label-panel" : undefined}>
        {tr("Labels", "標籤")}{selectedLabels.length ? ` · ${selectedLabels.length}` : ""} <span aria-hidden="true">{panelPlacement ? "▴" : "▾"}</span>
      </button>
      <button type="button" className="lab-label-new" ref={newLabelTriggerRef} onClick={() => openLabelPanel(true)}
        aria-label={tr("Create a frame label", "建立畫面標籤")} aria-haspopup="dialog" aria-expanded={Boolean(panelPlacement)}
        aria-controls={panelPlacement ? "lab-label-panel" : undefined}>{tr("+ New label", "＋新增標籤")}</button>
      <button type="button" className="lab-frame-apply" onClick={() => void applyLabels(true)}
        title={selectedIds.length === 0 || selectedLabels.length === 0 ? tr("Select frames and labels to apply", "請先選擇畫面與標籤") : undefined}
        disabled={!ready || saving || selectedIds.length === 0 || selectedLabels.length === 0}>{tr("Add labels", "加入標籤")}</button>
      <button type="button" onClick={() => void applyLabels(false)}
        title={selectedIds.length === 0 || selectedLabels.length === 0 ? tr("Select frames and labels to remove", "請先選擇畫面與要移除的標籤") : undefined}
        disabled={!ready || saving || selectedIds.length === 0 || selectedLabels.length === 0}>{tr("Remove labels", "移除標籤")}</button>
      {saving && <span role="status">{tr("Saving…", "儲存中…")}</span>}
    </div>
    {classifyOpen && <section id="lab-frame-classifier" className="lab-frame-classifier" aria-label={tr("Classify study frames", "辨識研究畫面")}>
      <div className="lab-frame-classifier-head"><strong>GPT-6 Luna · {tr("Visual classification", "視覺辨識")}</strong>
        <span>{selectedIds.length
          ? tr(`Selected ${selectedIds.length} of ${frames.length} frames`, `辨識已選的 ${selectedIds.length}／${frames.length} 個畫面`)
          : tr(`All ${frames.length} frames`, `辨識全部 ${frames.length} 個畫面`)}</span></div>
      <p>{tr("Describe one visible object. Matching frames will be selected for review; labels are only added when you choose Add labels.",
        "輸入一種可見物件。符合的畫面會被選取供你確認；只有按下「加入標籤」才會儲存標籤。")}</p>
      <form className="lab-frame-classifier-form" onSubmit={(event) => { event.preventDefault(); void classifyFrames(); }}>
        <input type="text" value={classifyObject} onChange={(event) => setClassifyObject(event.target.value)}
          placeholder={tr("backpack, jacket, shoe…", "背包、外套、鞋子…")} maxLength={80} disabled={classifyRunning}
          aria-label={tr("Object to find in frames", "要在畫面中尋找的物件")} />
        <button type="submit" disabled={classifyRunning || classifyObject.trim().length < 2}>
          {classifyRunning ? tr("Classifying…", "辨識中…") : tr("Classify", "開始辨識")}</button>
        {classifyRunning && <button type="button" className="lab-frame-classifier-stop" onClick={() => classifyAbort.current?.abort()}>
          {tr("Stop", "停止")}</button>}
      </form>
      {classifyTotal > 0 && <div className="lab-frame-classifier-status" role="status">
        <strong>{tr(`${classifyCount}/${classifyTotal} checked · ${classifyMatches.length} matches`, `已辨識 ${classifyCount}／${classifyTotal} 個 · ${classifyMatches.length} 個符合`)}</strong>
        {classifyStopped && <span>{tr("Stopped; completed results kept", "已停止；已完成的結果仍保留")}</span>}
        {!classifyRunning && !classifyStopped && classifyErrors === 0 && <span>{tr("Matching frames selected", "已選取符合的畫面")}</span>}
        {classifyErrors > 0 && <span className="error">{tr(`${classifyErrors} unavailable`, `${classifyErrors} 個無法辨識`)} · {classifyError}</span>}
        {!classifyRunning && classifyMatches.length > 0 && <button type="button" onClick={() => { setSelectedIds(classifyMatches); selection.enter(); }}>
          {tr(`Select ${classifyMatches.length} matches`, `選取 ${classifyMatches.length} 個符合畫面`)}</button>}
      </div>}
      {classifyRunning && <div className="lab-frame-classifier-stages" aria-label={tr("Classification stages", "辨識階段")}>
        {Object.entries(classifyStages).filter(([, stage]) => stage !== "done" && stage !== "error").slice(0, 4).map(([id, stage]) =>
          <span key={id}>{id} · {{ queued: tr("Queued", "排程中"), lab_frame_load: tr("Loading frame", "載入畫面"),
            media_ready: tr("Frame ready", "畫面已載入"), image_prepare: tr("Preparing image", "處理圖片"),
            image_ready: tr("Image ready", "圖片已備妥"), prediction_cache: tr("Checking cache", "檢查快取"),
            openai_processing: tr("Luna analyzing", "Luna 辨識中"), saving_prediction: tr("Saving result", "儲存結果"),
            rate_limit: tr("Waiting to retry", "等待重試") }[stage] || tr("Checking", "辨識中")}</span>)}</div>}
    </section>}
    {panelPlacement && createPortal(<div id="lab-label-panel" className="lab-label-panel" ref={labelPanelRef}
      role="dialog" aria-label={tr("Choose frame labels", "選擇畫面標籤")} style={panelPlacement}>
      <div className="lab-label-panel-heading"><strong>{tr("Labels", "標籤")}</strong><button type="button" onClick={() => setPanelPlacement(null)} aria-label={tr("Close label menu", "關閉標籤選單")}>×</button></div>
      <div className="lab-label-pills" aria-label={tr("Available frame labels", "可用的畫面標籤")}>
        {[...labCategories, ...customLabels].map((name) => <button key={name} type="button"
          className={selectedLabels.includes(name) ? "selected" : ""} aria-pressed={selectedLabels.includes(name)}
          disabled={saving || (!selectedLabels.includes(name) && selectedLabels.length >= 12)}
          onClick={() => toggleLabel(name)}>{name}</button>)}
      </div>
      <form className="lab-frame-create" onSubmit={(event) => { event.preventDefault(); void createCustomLabel(); }}>
        <input ref={customNameRef} type="text" value={customName} onChange={(event) => setCustomName(event.target.value)} maxLength={48}
          placeholder={tr("Custom label name", "自訂標籤名稱")} aria-label={tr("Custom label name", "自訂標籤名稱")} disabled={!ready || saving} />
        <button type="submit" disabled={!ready || saving || !customName.trim()}>{tr("Create", "建立")}</button>
      </form>
    </div>, document.body)}
    {(error || message) && <p className={`lab-frame-feedback${error ? " error" : ""}`} role="status">{error || message}</p>}
    {exportOpen && createPortal(<div className="lab-export-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !exportBusy) setExportOpen(false); }}><section className="lab-export-panel" role="dialog" aria-modal="true" aria-label={tr("Generated frame URLs", "已產生的畫面網址")}>
      <div className="lab-export-head"><span>{tr("COPY AS / URLS", "複製為／網址")}</span><button type="button" disabled={exportBusy} onClick={() => setExportOpen(false)} aria-label={tr("Close", "關閉")}>×</button></div>
      <h2>{tr("Selected frame URLs", "已選畫面網址")}</h2>
      {exportBusy && <p role="status">{tr(`Uploading ${selectedIds.length} full resolution frames…`, `正在上傳 ${selectedIds.length} 個完整解析度畫面…`)}</p>}
      {exportError && <p role="alert" className="lab-export-error">{exportError}</p>}
      {!!exportRows.length && <><div className="lab-export-list">{exportRows.map((row) => <div key={row.id}><strong>{tr("Frame", "畫面")} {row.id}</strong><a href={row.url} target="_blank" rel="noopener noreferrer">{row.url}</a></div>)}</div>
        <button type="button" className="lab-export-copy" onClick={async () => {
          try { await navigator.clipboard.writeText(exportRows.map((row) => row.url).join("\n")); setCopied(true); }
          catch { setExportError(tr("Clipboard unavailable", "無法使用剪貼簿")); }
        }}>{copied ? tr("Copied URLs ✓", "已複製網址 ✓") : tr(`Copy ${exportRows.length} URLs`, `複製 ${exportRows.length} 個網址`)}</button></>}
    </section></div>, document.body)}
    <SelectionArea scope={selection}><div className="lab-frame-grid">
      {frames.map((frame) => {
        const selected = selectedIds.includes(frame.id);
        const active = labels[frame.id] ?? [];
        return <div key={frame.uid} data-frame-uid={frame.uid} data-select-id={frame.id} className={`lab-frame-item${selected ? " selected" : ""}`}>
          <div className="lab-frame-tile">
            {!!frameChecks[frame.id]?.length && <button type="button" className="lab-frame-check-info" data-select-ignore
              aria-label={tr(`Image checks for frame ${frame.id}`, `畫面 ${frame.id} 的辨識紀錄`)}
              title={frameChecks[frame.id].map((check) => `GPT-6 Luna · ${tr("Query", "辨識提問")}: ${check.object} · ${check.matched ? tr("match", "符合") : tr("no match", "不符合")} · ${check.cache === "hit" ? tr("saved", "已儲存") : tr("new", "新結果")}`).join("\n")}>ⓘ</button>}
            <Link href={frame.href} prefetch={false} className="lab-frame-card" title={tr(`Unique frame ID: ${frame.uid}`, `唯一畫面 ID：${frame.uid}`)}
              aria-label={still ? tr(`View item ${frame.id} of ${frames.length}`, `查看第 ${frame.id} 項，共 ${frames.length} 項`) : tr(`View slide ${frame.id} at ${formatTimestamp(frame.timeSeconds)}`, `查看 ${formatTimestamp(frame.timeSeconds)} 的第 ${frame.id} 個畫面`)}>
              <Image src={frame.image} alt={`${itemLabel} ${frame.id} from @${author} ${kind}`} width={360}
                height={Math.round((360 * height) / width)} style={{ aspectRatio: `${width} / ${height}` }}
                sizes="(max-width: 760px) 46vw, (max-width: 1100px) 26vw, 160px" unoptimized loading="lazy" />
              <span className="lab-frame-meta"><strong>{frame.id}</strong><span>{still ? `${frame.id} / ${String(frames.length).padStart(2, "0")}` : formatTimestamp(frame.timeSeconds)}</span></span>
            </Link>
            <button type="button" className="lab-frame-select" aria-pressed={selected}
              aria-label={tr(`${selected ? "Deselect" : "Select"} ${itemLabel} ${frame.id}`, `${selected ? "取消選取" : "選取"}${itemLabel} ${frame.id}`)} onClick={() => toggleSelected(frame.id)}>
              <span aria-hidden="true">{selected ? "✓" : "+"}</span>
            </button>
            <AddToStudyButton className="lab-frame-add-to-study" category={category} author={author} asset={asset} kind="frame" frameId={frame.id} />
          </div>
          {active.length > 0 && <div className="lab-frame-labels" aria-label={tr(`Labels for ${itemLabel} ${frame.id}`, `${itemLabel} ${frame.id} 的標籤`)}>
            {active.map((name) => <span key={name}>{name}</span>)}
          </div>}
        </div>;
      })}
    </div></SelectionArea>
    <SelectionBar scope={selection} noun={tr("frame", "畫面")} actions={<>
      <button type="button" onClick={(event) => openLabelPanel(false, event.currentTarget)} aria-expanded={Boolean(panelPlacement)} aria-haspopup="dialog">{tr("Labels", "標籤")}{selectedLabels.length ? ` · ${selectedLabels.length}` : ""} ▾</button>
      <button type="button" disabled={!selectedIds.length || exportBusy} onClick={() => void exportUrls()}>{tr("Copy as → URLs", "複製為 → 網址")}</button>
      <button type="button" onClick={() => void applyLabels(true)} disabled={!ready || saving || !selectedIds.length || !selectedLabels.length}>{tr("Add labels", "加入標籤")}</button>
      <button type="button" onClick={() => void applyLabels(false)} disabled={!ready || saving || !selectedIds.length || !selectedLabels.length}>{tr("Remove labels", "移除標籤")}</button>
    </>} preview={frames.filter((frame) => selection.selected.has(frame.id)).map((frame) => <div key={frame.uid} className="selection-bar-preview-row"><Image src={frame.image} alt="" width={38} height={38} unoptimized /><span><strong>{tr("Frame", "畫面")} {frame.id}</strong><small>{still ? `${frame.id} / ${frames.length}` : formatTimestamp(frame.timeSeconds)}</small></span></div>)} />
  </>;
}
