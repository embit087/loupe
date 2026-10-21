"use client";

import { assetType } from "@/lib/asset-label";
import { useI18n } from "@/lib/i18n";

// File-type chip in place of a raw asset file name. People see the type; the full name is on
// hover (title) and in data-asset for developers and code agents.
export function AssetName({ asset, className = "" }: { asset: string; className?: string }) {
  const { tr } = useI18n();
  const type = assetType(asset);
  return <span className={`asset-name ${className}`} title={asset} data-asset={asset}>
    <span className="sr-only">{type.label} {tr("file", "檔案")} </span>
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {type.kind === "video" ? <><rect x="3" y="4.5" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="m8.5 8 3.5 2-3.5 2V8Z" fill="currentColor" /></>
        : type.kind === "carousel" ? <><rect x="5.5" y="5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M3.5 13V4.5A1.5 1.5 0 0 1 5 3h8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>
          : type.kind === "photo" ? <><rect x="3" y="4.5" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="m5 13.5 3.5-3.5 2.5 2.5 1.5-1.5 2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></>
            : <path d="M5.5 3h6L15 6.5V17H5.5V3Z M11.5 3v3.5H15" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />}
    </svg>
    <span>{type.extension}</span>
  </span>;
}
