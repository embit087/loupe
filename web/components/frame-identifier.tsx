"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";

export function FrameIdentifier({ value }: { value: string }) {
  const { tr } = useI18n();
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(tr("Copied", "已複製"));
    } catch {
      setStatus(tr("Select the ID to copy it", "請選取識別碼後複製"));
    }
  }

  return <div className="lab-frame-identifier">
    <code>{value}</code>
    <button type="button" onClick={() => void copy()} aria-label={tr("Copy unique frame ID", "複製畫面唯一識別碼")}>{tr("Copy ID", "複製識別碼")}</button>
    {status && <span role="status">{status}</span>}
  </div>;
}
