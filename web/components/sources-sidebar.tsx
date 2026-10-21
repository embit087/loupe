"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { dataSources, sourceHref, type DataSource } from "@/lib/data-sources";
import { useI18n } from "@/lib/i18n";

const LAST_ARCHIVE_KEY = "collections-last-archive";

// The archive remembers where the viewer was so the book can switch back to it.
export function useRememberArchivePath(active: boolean) {
  useEffect(() => {
    if (!active) return;
    try {
      window.sessionStorage.setItem(LAST_ARCHIVE_KEY, window.location.pathname + window.location.search);
    } catch {
      // Switching back falls back to the collection home.
    }
  }, [active]);
}

function lastArchivePath() {
  try {
    const saved = window.sessionStorage.getItem(LAST_ARCHIVE_KEY);
    return saved?.startsWith("/") && !saved.startsWith("/sources") ? saved : "/";
  } catch {
    return "/";
  }
}

const subscribeToNothing = () => () => {};

export function SourcesToggle({ open }: { open: boolean }) {
  const { tr } = useI18n();
  const returnHref = useSyncExternalStore(subscribeToNothing, lastArchivePath, () => "/");

  const label = open ? tr("Back to the collection", "返回收藏") : tr("Data sources: how posts were fetched", "資料來源：貼文取得方式");
  return (
    <Link href={open ? returnHref : "/sources"} prefetch={false} data-lab-feature className={`sources-toggle${open ? " selected" : ""}`}
      aria-label={label} data-nav-tooltip={label} aria-pressed={open}>
      <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true">
        <path d="M10 5.2C8.6 4 6.6 3.5 3 3.6v11.6c3.6-.1 5.6.4 7 1.6m0-11.6c1.4-1.2 3.4-1.7 7-1.6v11.6c-3.6-.1-5.6.4-7 1.6m0-11.6v11.6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </Link>
  );
}

export function SourcesSidebar({ active }: { active: string }) {
  const { tr } = useI18n();
  const inUse = dataSources.filter((source) => source.status === "in use");
  const planned = dataSources.filter((source) => source.status === "planned");
  return <>
    <p className="side-note sources-side-note">{tr("How the collection's posts were fetched. Insight and style work stays in Exp Lab.", "說明收藏貼文的取得方式；洞察與風格研究則在實驗室進行。")}</p>
    <div className="side-heading">{tr("Data sources", "資料來源")}</div>
    <nav className="view-nav" aria-label={tr("Data sources", "資料來源")}>
      <Link href="/sources" prefetch={false} className={`view-link${active === "overview" ? " selected" : ""}`} aria-current={active === "overview" ? "page" : undefined} aria-label={tr("See all data sources and collection methods", "查看所有資料來源與收藏方法")} data-nav-tooltip={tr("See all data sources and collection methods", "查看所有資料來源與收藏方法")}>
        <span className="view-icon">◎</span><span className="nav-copy"><strong>{tr("Overview", "總覽")}</strong><small>{tr("All methods and files", "所有方法與檔案")}</small></span>
      </Link>
      {[...inUse, ...planned].map((source) => <SourceLink key={source.slug} active={active} source={source} />)}
    </nav>
  </>;
}

function SourceLink({ active, source }: { active: string; source: DataSource }) {
  const { tr } = useI18n();
  const selected = active === source.slug;
  return (
    <Link href={sourceHref(source)} prefetch={false} className={`view-link${selected ? " selected" : ""}`} aria-current={selected ? "page" : undefined} aria-label={tr(`Read about ${source.name}`, `閱讀 ${source.name} 的說明`)} data-nav-tooltip={tr(`Read about ${source.name}`, `閱讀 ${source.name} 的說明`)}>
      <span className="view-icon">{source.icon}</span><span className="nav-copy"><strong>{source.name}</strong><small>{source.status === "planned" ? tr("Planned", "規劃中") : source.provider}</small></span>
    </Link>
  );
}
