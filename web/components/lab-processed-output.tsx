"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";

type Props = {
  kind: "screen" | "speech";
  text: string;
  timeRange?: string;
};

export function LabProcessedOutput({ kind, text, timeRange }: Props) {
  const { tr } = useI18n();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const isScreen = kind === "screen";
  const source = isScreen ? tr("On-screen text", "畫面文字") : tr("Spoken audio", "語音內容");
  const copyLabel = isScreen ? tr("Copy reviewed on-screen text", "複製已校對的畫面文字") : tr("Copy speech transcript", "複製語音逐字稿");

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return <div className={`lab-processed-output ${isScreen ? "lab-scene-text" : "lab-scene-speech"}`}>
    <div className="lab-processed-heading">
      <span className="detail-label">{source} <span aria-hidden="true">·</span> {isScreen ? tr("Reviewed OCR", "已校對 OCR") : tr("Transcript", "逐字稿")}{timeRange ? ` · ${timeRange}` : ""}</span>
      <button type="button" onClick={() => void copyText()} aria-label={copyLabel} title={copyLabel}>
        {copyState === "copied" ? tr("Copied ✓", "已複製 ✓") : tr("Copy", "複製")}
      </button>
    </div>
    <p>{text}</p>
    {copyState === "error" && <span className="lab-copy-feedback" role="status">{tr("Copy unavailable. Select the text to copy it.", "無法直接複製，請選取文字後複製。")}</span>}
    {copyState === "copied" && <span className="sr-only" role="status">{source} {tr("copied to clipboard", "已複製到剪貼簿")}</span>}
  </div>;
}
