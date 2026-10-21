"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { categoryHref, formatCount, withMediaFilter, type Author, type CollectionCategory, type MediaFilter } from "@/lib/atlas";
import { ProfileActivityPills, useProfileActivity } from "@/components/profile-activity";
import { SearchToggle } from "@/components/search-panel";
import { SourcesSidebar, SourcesToggle, useRememberArchivePath } from "@/components/sources-sidebar";
import { archiveChangeEvent, emitArchiveChange, emitFollowChange, type ArchiveChange } from "@/lib/profile-events";
import { PlatformSettings } from "@/components/platform-settings";
import { useI18n } from "@/lib/i18n";

type Counts = { all: number; video: number; post: number };
type NavTooltip = { text: string; left: number; top: number };
const SIDEBAR_SCROLL_KEY = "collections-sidebar-scroll-top";
const SIDEBAR_WIDTH_KEY = "collections-sidebar-width";
let archivedProfilesCache: string[] | null = null;
let archivedOpenCache = false;
let viewsOpenCache = true;
let sidebarNavigationAnchor: { author: string; top: number } | null = null;
const DEFAULT_SIDEBAR_WIDTH = 270;
const MIN_SIDEBAR_WIDTH = 190;
const MAX_SIDEBAR_WIDTH = 520;

function clampSidebarWidth(value: number, viewportWidth: number) {
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(value, MAX_SIDEBAR_WIDTH, viewportWidth - 500));
}

type Props = {
  authors: Author[];
  selectedAuthor: string | null;
  category?: CollectionCategory;
  likedView?: boolean;
  favoritesView?: boolean;
  dislikedView?: boolean;
  followedView?: boolean;
  focusedView?: boolean;
  labView?: boolean;
  popularityView?: boolean;
  topicsView?: "news" | "lab";
  // The active Data sources page ("overview" or a source slug); switches the sidebar to that area.
  sourcesView?: string;
  filter: MediaFilter;
  counts: Counts;
  children: ReactNode;
};

function authorHref(username: string) {
  return `/${encodeURIComponent(username)}`;
}

function subscribeToSidebar(callback: () => void) {
  const notify = () => {
    document.documentElement.classList.toggle("sidebar-collapsed", sidebarSnapshot());
    callback();
  };
  window.addEventListener("storage", notify);
  window.addEventListener("collections-sidebar-change", notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener("collections-sidebar-change", notify);
  };
}

function sidebarSnapshot() {
  try {
    return window.localStorage.getItem("collections-sidebar-collapsed") === "true";
  } catch {
    return false;
  }
}

function sidebarWidthSnapshot() {
  try {
    const value = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(value) && value >= MIN_SIDEBAR_WIDTH && value <= MAX_SIDEBAR_WIDTH
      ? value : DEFAULT_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

export function ArchiveShell({ authors, selectedAuthor, category, likedView = false, favoritesView = false, dislikedView = false, followedView = false, focusedView = false, labView = false, popularityView = false, topicsView, sourcesView, filter, counts, children }: Props) {
  const { t, tr } = useI18n();
  const persistedCollapsed = useSyncExternalStore(subscribeToSidebar, sidebarSnapshot, () => false);
  const [fallbackCollapsed, setFallbackCollapsed] = useState(false);
  const collapsed = persistedCollapsed || fallbackCollapsed;
  const persistedWidth = useSyncExternalStore(subscribeToSidebar, sidebarWidthSnapshot, () => DEFAULT_SIDEBAR_WIDTH);
  const [fallbackWidth, setFallbackWidth] = useState<number | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const sidebarWidth = dragWidth ?? fallbackWidth ?? persistedWidth;
  const resizeRef = useRef<{ pointerId: number; startX: number; startWidth: number; currentWidth: number } | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(() => viewsOpenCache);
  // Expanding the sidebar always starts with Views open, however it was left before collapsing.
  const [wasCollapsed, setWasCollapsed] = useState(collapsed);
  if (wasCollapsed !== collapsed) {
    setWasCollapsed(collapsed);
    if (!collapsed) setViewsOpen(true);
  }
  const [archived, setArchived] = useState<string[]>(() => typeof window === "undefined" ? [] : archivedProfilesCache ?? []);
  const [archivedOpen, setArchivedOpen] = useState(() => archivedOpenCache);
  const archiveRevision = useRef(0);
  const [pendingArchive, setPendingArchive] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const [navTooltip, setNavTooltip] = useState<NavTooltip | null>(null);
  const navTooltipTarget = useRef<HTMLElement | null>(null);
  const activityFor = useProfileActivity();
  const sourcesOpen = sourcesView !== undefined;
  useRememberArchivePath(!sourcesOpen);
  const searchRef = useRef<HTMLDivElement>(null);
  const viewsTriggerRef = useRef<HTMLButtonElement>(null);
  const viewsNavRef = useRef<HTMLElement>(null);
  // Collapsed sidebar: Views is one icon that opens its options in a floating panel.
  const [floatViews, setFloatViews] = useState<{ left: number; top: number; maxHeight: number; focus: boolean } | null>(null);
  const floatPanelRef = useRef<HTMLElement>(null);
  // While the column widens, content is laid out at its final width so text never re-wraps mid-animation.
  const [expanding, setExpanding] = useState(false);
  const expandTimer = useRef<number | undefined>(undefined);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const sidebarScrollTop = useRef(0);

  useLayoutEffect(() => {
    try {
      const saved = Number(window.sessionStorage.getItem(SIDEBAR_SCROLL_KEY));
      if (Number.isFinite(saved) && saved > 0) sidebarScrollTop.current = saved;
    } catch {
      // Navigation still works when session storage is unavailable.
    }
    const scroll = sidebarScrollRef.current;
    if (!collapsed && scroll) {
      scroll.scrollTop = sidebarScrollTop.current;
      const anchor = sidebarNavigationAnchor;
      if (anchor && anchor.author === selectedAuthor) {
        const link = [...scroll.querySelectorAll<HTMLElement>("[data-sidebar-profile]")]
          .find((item) => item.dataset.sidebarProfile === selectedAuthor);
        if (link) {
          scroll.scrollTop += link.getBoundingClientRect().top - anchor.top;
          sidebarScrollTop.current = scroll.scrollTop;
          try { window.sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(scroll.scrollTop)); } catch { /* Keep in memory. */ }
        }
        sidebarNavigationAnchor = null;
      }
    }
  }, [collapsed, selectedAuthor]);

  function rememberSidebarScroll() {
    if (collapsed || !sidebarScrollRef.current) return;
    const top = sidebarScrollRef.current.scrollTop;
    sidebarScrollTop.current = top;
    try {
      window.sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(top));
    } catch {
      // Keep the current position in memory for this mount.
    }
  }

  function rememberSidebarClick(event: ReactMouseEvent<HTMLDivElement>) {
    rememberSidebarScroll();
    const link = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-sidebar-profile]") : null;
    const author = link?.dataset.sidebarProfile;
    sidebarNavigationAnchor = author && author !== selectedAuthor ? { author, top: link.getBoundingClientRect().top } : null;
  }

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const revision = archiveRevision.current;
      try {
        const response = await fetch("/api/archived-profiles", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Archived profiles unavailable.");
        const data = await response.json() as { authors: string[] };
        if (!Array.isArray(data.authors)) throw new Error("Archived profiles unavailable.");
        if (revision === archiveRevision.current) {
          archivedProfilesCache = data.authors;
          setArchived(data.authors);
        }
        setArchiveError("");
      } catch (cause) {
        if (!controller.signal.aborted) setArchiveError(cause instanceof Error ? cause.message : "Archived profiles unavailable.");
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    function onArchiveChange(event: Event) {
      const { author, archived: next } = (event as CustomEvent<ArchiveChange>).detail;
      archiveRevision.current += 1;
      setArchived((current) => {
        const updated = next
          ? current.includes(author) ? current : [...current, author]
          : current.filter((username) => username !== author);
        archivedProfilesCache = updated;
        return updated;
      });
    }
    window.addEventListener(archiveChangeEvent, onArchiveChange);
    return () => window.removeEventListener(archiveChangeEvent, onArchiveChange);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!searchRef.current?.contains(event.target as Node)) {
        setSearchOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [searchOpen]);

  useEffect(() => {
    if (!viewsOpen || collapsed || sourcesOpen) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!(event.target instanceof Node)
        || viewsTriggerRef.current?.contains(event.target)
        || viewsNavRef.current?.contains(event.target)) return;
      viewsOpenCache = false;
      setViewsOpen(false);
    }
    document.addEventListener("click", closeOnOutsideClick);
    return () => document.removeEventListener("click", closeOnOutsideClick);
  }, [viewsOpen, collapsed, sourcesOpen]);

  const floatViewsOpen = collapsed && floatViews !== null;

  useEffect(() => {
    if (!floatViewsOpen) return;
    if (floatViews?.focus) floatPanelRef.current?.querySelector<HTMLElement>("a[aria-current='page'], a")?.focus();
    function closeOnOutside(event: PointerEvent) {
      if (!(event.target instanceof Node)
        || viewsTriggerRef.current?.contains(event.target)
        || floatPanelRef.current?.contains(event.target)) return;
      setFloatViews(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setFloatViews(null);
      viewsTriggerRef.current?.focus();
    }
    const close = () => setFloatViews(null);
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", close);
    };
  }, [floatViewsOpen, floatViews]);

  function toggleViews(event: ReactMouseEvent<HTMLButtonElement>) {
    if (collapsed) {
      if (floatViews) { setFloatViews(null); return; }
      const rect = event.currentTarget.getBoundingClientRect();
      const top = Math.max(8, Math.min(rect.top, window.innerHeight - 160));
      hideNavTooltip();
      // Keyboard activation (detail 0) moves focus into the panel.
      setFloatViews({ left: rect.right + 12, top, maxHeight: window.innerHeight - top - 8, focus: event.detail === 0 });
      return;
    }
    setViewsOpen((current) => {
      viewsOpenCache = !current;
      return !current;
    });
  }

  useEffect(() => {
    if (!navTooltip) return;
    function clearOnMove() {
      navTooltipTarget.current = null;
      setNavTooltip(null);
    }
    window.addEventListener("scroll", clearOnMove, true);
    window.addEventListener("resize", clearOnMove);
    return () => {
      window.removeEventListener("scroll", clearOnMove, true);
      window.removeEventListener("resize", clearOnMove);
    };
  }, [navTooltip]);

  function tooltipTarget(target: EventTarget | null) {
    // The floating Views panel already shows full labels.
    if (!(target instanceof Element) || target.closest(".views-float-panel")) return null;
    return target.closest<HTMLElement>("[data-nav-tooltip]");
  }

  function showNavTooltip(target: HTMLElement | null) {
    const label = target?.dataset.navTooltip;
    if (!target || !label) return;
    const rect = target.getBoundingClientRect();
    const tooltipWidth = 240;
    const fitsRight = rect.right + tooltipWidth + 20 <= window.innerWidth;
    navTooltipTarget.current = target;
    setNavTooltip({
      text: label,
      left: fitsRight ? rect.right + 10 : Math.max(8, rect.left - tooltipWidth - 10),
      top: Math.max(34, Math.min(window.innerHeight - 34, rect.top + rect.height / 2)),
    });
  }

  function hideNavTooltip() {
    navTooltipTarget.current = null;
    setNavTooltip(null);
  }

  function onNavPointerOut(event: ReactPointerEvent<HTMLElement>) {
    const target = tooltipTarget(event.target);
    if (target !== navTooltipTarget.current) return;
    if (event.relatedTarget instanceof Node && target?.contains(event.relatedTarget)) return;
    hideNavTooltip();
  }

  function onNavBlur(event: ReactFocusEvent<HTMLElement>) {
    const target = tooltipTarget(event.target);
    if (target !== navTooltipTarget.current) return;
    if (event.relatedTarget instanceof Node && target?.contains(event.relatedTarget)) return;
    hideNavTooltip();
  }

  function toggleSidebar() {
    setFloatViews(null);
    const nextCollapsed = !collapsed;
    if (!nextCollapsed) viewsOpenCache = true;
    window.clearTimeout(expandTimer.current);
    setExpanding(!nextCollapsed);
    // Matches the .18s grid-template-columns transition, with margin.
    if (!nextCollapsed) expandTimer.current = window.setTimeout(() => setExpanding(false), 320);
    document.documentElement.classList.toggle("sidebar-collapsed", nextCollapsed);
    try {
      window.localStorage.setItem("collections-sidebar-collapsed", String(nextCollapsed));
      window.dispatchEvent(new Event("collections-sidebar-change"));
    } catch {
      setFallbackCollapsed(nextCollapsed);
    }
  }

  function saveSidebarWidth(value: number) {
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(value));
      setFallbackWidth(null);
      window.dispatchEvent(new Event("collections-sidebar-change"));
    } catch {
      setFallbackWidth(value);
    }
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (collapsed || event.button !== 0) return;
    event.preventDefault();
    const startWidth = event.currentTarget.parentElement?.getBoundingClientRect().width ?? sidebarWidth;
    resizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth, currentWidth: startWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragWidth(startWidth);
  }

  function moveResize(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const next = clampSidebarWidth(resize.startWidth + event.clientX - resize.startX, window.innerWidth);
    resize.currentWidth = next;
    setDragWidth(next);
  }

  function finishResize(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resizeRef.current = null;
    saveSidebarWidth(resize.currentWidth);
    setDragWidth(null);
  }

  function resizeWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home") return;
    event.preventDefault();
    const next = event.key === "Home" ? DEFAULT_SIDEBAR_WIDTH
      : sidebarWidth + (event.key === "ArrowRight" ? 20 : -20);
    saveSidebarWidth(clampSidebarWidth(next, window.innerWidth));
  }

  async function toggleArchived(author: string, next: boolean) {
    if (pendingArchive) return;
    setPendingArchive(author);
    try {
      const response = await fetch("/api/archived-profiles", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, archived: next }),
      });
      if (!response.ok) throw new Error(next ? "Could not archive profile." : "Could not restore profile.");
      emitArchiveChange({ author, archived: next });
      if (next) emitFollowChange({ author, following: false });
      setArchiveError("");
    } catch (cause) {
      setArchiveError(cause instanceof Error ? cause.message : "Could not update profile archive.");
    } finally {
      setPendingArchive(null);
    }
  }

  const activeCategory = category ?? authors.find((author) => author.username === selectedAuthor)?.collection ?? "design";
  const seed = activeCategory === "kol" ? "demo.trail" : "demo.studio";
  const base = favoritesView ? `/favorites?category=${activeCategory}` : labView ? (activeCategory === "kol" ? "/exp-lab/kol" : "/exp-lab") : likedView ? `/liked?category=${activeCategory}` : dislikedView ? `/disliked?category=${activeCategory}` : followedView ? `/followed?category=${activeCategory}` : selectedAuthor ? authorHref(selectedAuthor) : categoryHref(activeCategory);
  const archivedSet = new Set(archived);
  const eligible = authors.filter((author) => author.collection === activeCategory).filter((author) =>
    filter === "all" || (filter === "video" ? author.videoCount : author.postCount) > 0);
  const availableCount = eligible.filter((author) => author.username === seed || !archivedSet.has(author.username)).length;
  const matching = eligible.filter((author) =>
    `${author.name} ${author.username}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
  const related = matching.filter((author) => author.username === seed || !archivedSet.has(author.username))
    .sort((a, b) => Number(b.username === seed) - Number(a.username === seed));
  const archivedProfiles = matching.filter((author) => author.username !== seed && archivedSet.has(author.username));
  const archivedForCategory = eligible.filter((author) => author.username !== seed && archivedSet.has(author.username));
  const showArchivedProfiles = archivedOpen || query.trim().length > 0;

  const viewLinks = <>
    <Link href={withMediaFilter(`/favorites?category=${activeCategory}`, filter)} prefetch={false} className={`view-link${favoritesView ? " selected" : ""}`} aria-current={favoritesView ? "page" : undefined} aria-label={tr("Open favorites", "開啟收藏夾")} data-nav-tooltip={tr("Saved posts", "已收藏的貼文")}>
      <span className="view-icon" aria-hidden="true">▣</span><span className="nav-copy"><strong>{tr("Favorites", "收藏夾")}</strong><small>{tr("Saved posts", "已收藏的貼文")}</small></span>
    </Link>
    <Link href={withMediaFilter(categoryHref(activeCategory), filter)} prefetch={false} className={`view-link${selectedAuthor === null && !likedView && !favoritesView && !dislikedView && !followedView && !focusedView && !labView && !popularityView ? " selected" : ""}`} aria-current={selectedAuthor === null && !likedView && !favoritesView && !dislikedView && !followedView && !focusedView && !labView && !popularityView ? "page" : undefined} aria-label={tr(`Browse all ${activeCategory === "kol" ? "KOL" : "Design"} creators and posts`, `瀏覽所有${activeCategory === "kol" ? "KOL" : "設計"}創作者與貼文`)} data-nav-tooltip={tr(`Browse all ${activeCategory === "kol" ? "KOL" : "Design"} creators and posts`, `瀏覽所有${activeCategory === "kol" ? "KOL" : "設計"}創作者與貼文`)}>
      <span className="view-icon">◎</span><span className="nav-copy"><strong>{t(activeCategory === "kol" ? "allKOLCreators" : "allDesignCreators")}</strong><small>{t("collectedPosts")}</small></span>
    </Link>
    <Link href={withMediaFilter(`/focused-profiles?category=${activeCategory}`, filter)} prefetch={false} className={`view-link${focusedView ? " selected" : ""}`} aria-current={focusedView ? "page" : undefined} aria-label={tr("Learn why two social profiles anchor the collections", "了解兩位精選創作者的選入原因")} data-nav-tooltip={tr("Learn why two social profiles anchor the collections", "了解兩位精選創作者的選入原因")}>
      <span className="view-icon">✦</span><span className="nav-copy"><strong>{t("focusedProfiles")}</strong><small>{t("focusedHint")}</small></span>
    </Link>
    <Link href={withMediaFilter(`/liked?category=${activeCategory}`, filter)} prefetch={false} className={`view-link${likedView ? " selected" : ""}`} aria-current={likedView ? "page" : undefined} aria-label={tr(`View liked ${activeCategory === "kol" ? "KOL" : "Design"} posts`, `查看喜歡的${activeCategory === "kol" ? "KOL" : "設計"}貼文`)} data-nav-tooltip={tr(`View liked ${activeCategory === "kol" ? "KOL" : "Design"} posts`, `查看喜歡的${activeCategory === "kol" ? "KOL" : "設計"}貼文`)}>
      <span className="view-icon">♥</span><span className="nav-copy"><strong>{t("likedPosts")}</strong><small>{t("likedHint")}</small></span>
    </Link>
    <Link href={withMediaFilter(`/disliked?category=${activeCategory}`, filter)} prefetch={false} className={`view-link${dislikedView ? " selected" : ""}`} aria-current={dislikedView ? "page" : undefined} aria-label={tr(`View disliked ${activeCategory === "kol" ? "KOL" : "Design"} posts`, `查看略過的${activeCategory === "kol" ? "KOL" : "設計"}貼文`)} data-nav-tooltip={tr(`View disliked ${activeCategory === "kol" ? "KOL" : "Design"} posts`, `查看略過的${activeCategory === "kol" ? "KOL" : "設計"}貼文`)}>
      <span className="view-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 15h6l-.9 4.3A2 2 0 0 0 10 22h1a2 2 0 0 0 1.5-.7L17 15V4a2 2 0 0 0-2-2H6a2 2 0 0 0-1.9 1.4L2 11.5A2.5 2.5 0 0 0 3 15Z"/><path d="M19 2h3v13h-3z"/></svg></span><span className="nav-copy"><strong>{t("dislikedPosts")}</strong><small>{t("dislikedHint")}</small></span>
    </Link>
    <Link href={withMediaFilter(`/followed?category=${activeCategory}`, filter)} prefetch={false} className={`view-link${followedView ? " selected" : ""}`} aria-current={followedView ? "page" : undefined} aria-label={tr(`View posts from followed ${activeCategory === "kol" ? "KOL" : "Design"} accounts`, `查看已追蹤${activeCategory === "kol" ? "KOL" : "設計"}帳號的貼文`)} data-nav-tooltip={tr(`View posts from followed ${activeCategory === "kol" ? "KOL" : "Design"} accounts`, `查看已追蹤${activeCategory === "kol" ? "KOL" : "設計"}帳號的貼文`)}>
      <span className="view-icon">✓</span><span className="nav-copy"><strong>{t("followed")}</strong><small>{t("followedHint")}</small></span>
    </Link>
    {activeCategory === "kol" && <Link href="/category/kol/popularity" prefetch={false} className={`view-link${popularityView ? " selected" : ""}`} aria-current={popularityView ? "page" : undefined} aria-label={tr("Compare KOL popularity and engagement", "比較 KOL 熱門程度與互動數")} data-nav-tooltip={tr("Compare KOL popularity and engagement", "比較 KOL 熱門程度與互動數")}>
      <span className="view-icon" aria-hidden="true">▲</span><span className="nav-copy"><strong>{t("popularity")}</strong><small>{t("popularityHint")}</small></span>
    </Link>}
  </>;

  return (
    <div className={`site-shell${collapsed ? " sidebar-collapsed" : ""}${expanding && !collapsed ? " sidebar-expanding" : ""}${dragWidth !== null ? " sidebar-resizing" : ""}`}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <aside className="sidebar" data-category={activeCategory} aria-label={tr("Collection navigation", "收藏導覽")}
        onClick={(event) => {
          if (!collapsed || (event.target instanceof Element && event.target.closest("a, button, input, select, textarea, [role='button']"))) return;
          toggleSidebar();
        }}
        onPointerOver={(event) => showNavTooltip(tooltipTarget(event.target))}
        onPointerOut={onNavPointerOut}
        onFocusCapture={(event) => showNavTooltip(tooltipTarget(event.target))}
        onBlurCapture={onNavBlur}
        onClickCapture={hideNavTooltip}
        onKeyDown={(event) => { if (event.key === "Escape") hideNavTooltip(); }}>
        <div className="sidebar-brand">
          <Link href="/" aria-label={tr("Open the Loupe home page", "開啟 Loupe 首頁")} data-nav-tooltip={tr("Open the Loupe home page", "開啟 Loupe 首頁")} className="brand-mark">
            <span aria-hidden="true">L</span>
          </Link>
          <span className="sidebar-brand-copy"><strong>LOUPE</strong><small>{sourcesOpen ? t("dataSources") : t("motionAtlas")}</small></span>
          <div className="sidebar-brand-actions"><SearchToggle /><SourcesToggle open={sourcesOpen} /></div>
        </div>

        <button
          type="button"
          className="collapse-trigger"
          onClick={toggleSidebar}
          aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
          aria-expanded={!collapsed}
          data-nav-tooltip={collapsed ? tr("Expand the collection navigation", "展開收藏導覽") : tr("Collapse the collection navigation", "收合收藏導覽")}
        >
          {collapsed ? "›" : "‹"}
        </button>

        {!collapsed && <div className="sidebar-resize-handle" role="separator" aria-label={tr("Resize sidebar", "調整側欄寬度")}
          aria-orientation="vertical" aria-valuemin={MIN_SIDEBAR_WIDTH} aria-valuemax={MAX_SIDEBAR_WIDTH}
          aria-valuenow={Math.round(sidebarWidth)} tabIndex={0}
          title={tr("Drag to resize sidebar · Arrow keys adjust · Home resets", "拖曳以調整側欄寬度 · 方向鍵微調 · Home 重設")}
          onPointerDown={startResize} onPointerMove={moveResize} onPointerUp={finishResize}
          onPointerCancel={finishResize} onKeyDown={resizeWithKeyboard}
          onDoubleClick={() => saveSidebarWidth(DEFAULT_SIDEBAR_WIDTH)} />}

        <div className="sidebar-scroll" ref={sidebarScrollRef} onScroll={rememberSidebarScroll} onClickCapture={rememberSidebarClick}>
          {sourcesOpen ? <SourcesSidebar active={sourcesView} /> : <>
          <nav className="category-tabs" aria-label={tr("Collections and labs", "收藏與實驗室")}>
            {(["design", "kol"] as const).map((value) => {
              const label = value === "kol" ? "KOL" : "Design";
              const active = !topicsView && activeCategory === value;
              return <div key={value} className={`category-pair${active ? " active" : ""}`}>
                <Link href={withMediaFilter(categoryHref(value), filter)} prefetch={false}
                  className={`category-tab category-posts-tab${active && !labView ? " selected" : ""}`}
                  aria-current={active && !labView && selectedAuthor === null && !likedView && !favoritesView && !dislikedView && !followedView && !focusedView && !popularityView ? "page" : undefined}
                  aria-label={tr(`Browse ${label} posts`, `瀏覽${value === "kol" ? " KOL" : "設計"}貼文`)} data-nav-tooltip={tr(`Browse ${label} posts`, `瀏覽${value === "kol" ? " KOL" : "設計"}貼文`)}>
                  <span className="category-tab-icon" aria-hidden="true">{value === "kol"
                    ? <svg viewBox="0 0 24 24" fill="none"><path d="M4 9h4l9-4v14l-9-4H4V9Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="m8 15 1.5 5h3L11 16M20 9a4 4 0 0 1 0 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    : <svg viewBox="0 0 24 24" fill="none"><path d="m4 20 4.5-1 11-11L16 4.5l-11 11L4 20Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="m14.5 6 3.5 3.5M6.5 16.5l2 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>}</span>
                  <span className="category-tab-label">{value === "kol" ? label : t("design")}</span>
                  <small>{authors.filter((author) => author.collection === value).length}</small>
                </Link>
                <Link href={value === "kol" ? "/exp-lab/kol" : "/exp-lab"} prefetch={false}
                  className={`category-tab category-lab-tab${active && labView ? " selected" : ""}`}
                  aria-current={active && labView ? "page" : undefined}
                  aria-label={tr(`Open ${label} Exp Lab`, `開啟${value === "kol" ? " KOL" : "設計"}實驗室`)} data-nav-tooltip={tr(`Open ${label} Exp Lab · saved posts and studies`, `開啟${value === "kol" ? " KOL" : "設計"}實驗室 · 已收藏貼文與研究`)}>
                  <span className="category-lab-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5 20.5 12 12 20.5 3.5 12 12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg></span><span className="category-lab-label">{t("lab")}</span>
                </Link>
              </div>;
            })}
            <div className={`category-pair topics-pair${topicsView ? " active" : ""}`}>
              <Link href="/topics" prefetch={false} className={`category-tab category-posts-tab${topicsView === "news" ? " selected" : ""}`}
                aria-current={topicsView === "news" ? "page" : undefined} aria-label={tr("Browse Topics news", "瀏覽主題新聞")} data-nav-tooltip={tr("Browse dated Topics news", "瀏覽每日主題新聞")}>
                <span className="category-tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 4v16M5.1 8l13.8 8M5.1 16l13.8-8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></span><span className="category-tab-label">{t("topics")}</span>
              </Link>
              <Link href="/topics/lab" prefetch={false} className={`category-tab category-lab-tab${topicsView === "lab" ? " selected" : ""}`}
                aria-current={topicsView === "lab" ? "page" : undefined} aria-label={tr("Open Topics Lab", "開啟新聞實驗室")} data-nav-tooltip={tr("Open saved Topics news", "開啟已收藏的主題新聞")}>
                <span className="category-lab-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5 20.5 12 12 20.5 3.5 12 12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg></span><span className="category-lab-label">{t("lab")}</span>
              </Link>
            </div>
          </nav>
          {topicsView ? <div className="topics-sidebar-note"><span className="side-heading">{t("newsDesk")}</span><p>{t("topicsIntro")}</p></div> : <>
          <button type="button" ref={viewsTriggerRef} className={`side-heading side-heading-toggle${floatViewsOpen ? " float-open" : ""}`}
            aria-expanded={collapsed ? floatViewsOpen : viewsOpen} aria-controls="collection-views-nav" onClick={toggleViews}
            aria-label={collapsed ? (floatViewsOpen ? tr("Close views", "關閉檢視") : tr("Show views", "顯示檢視")) : undefined}
            data-nav-tooltip={collapsed && !floatViewsOpen ? tr("Show views: all creators, focused profiles, liked, disliked, followed", "顯示檢視：所有創作者、精選創作者、喜歡、略過、追蹤中") : undefined}>
            <span className="side-heading-icon" aria-hidden="true"><svg viewBox="0 0 20 20" width="18" height="18" fill="none"><path d="M4 5.5h1.5M8 5.5h8M4 10h1.5M8 10h8M4 14.5h1.5M8 14.5h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></span>
            <span className="side-heading-text">{t("views")}</span><span className="side-heading-chevron" aria-hidden="true">{viewsOpen ? "⌃" : "⌄"}</span>
          </button>
          <nav id={floatViewsOpen ? undefined : "collection-views-nav"} ref={viewsNavRef} className="view-nav" aria-label={tr("Collection views", "收藏檢視")} hidden={collapsed || !viewsOpen}>
            {viewLinks}
          </nav>

          {!labView && !focusedView && !popularityView && <>
            <nav className="filter-nav" aria-label={tr("Media filters", "媒體篩選")}>
              {([
                ["video", t("videos"), counts.video],
                ["post", t("imagePosts"), counts.post],
              ] as const).map(([value, label, count]) => (
                <Link key={value} href={withMediaFilter(base, filter === value ? "all" : value)} prefetch={false} className={`filter-link${filter === value ? " selected" : ""}`} aria-current={filter === value ? "page" : undefined} title={filter === value ? tr(`Show all ${counts.all} posts`, `顯示全部 ${counts.all} 則貼文`) : tr(`Show ${label.toLowerCase()}`, `顯示${label}`)}>
                  {value === "video" ? <svg className="filter-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2" y="3" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="m8 6.5 5 3.5-5 3.5z" fill="currentColor"/></svg> : <svg className="filter-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2" y="3" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/><path d="m3 15 4.5-4 2.5 2 2.5-3 4.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>}
                  <span className="filter-name">{label}</span><span>{count}</span>
                </Link>
              ))}
            </nav>
          </>}

          <div className="related-heading">
            <span>{t(activeCategory === "kol" ? "similarCreators" : "relatedProfiles")}</span>
            <div className="related-actions" ref={searchRef}>
              <span>{availableCount}</span>
              <button
                type="button"
                className="profile-search-trigger"
                onClick={() => { setSearchOpen((value) => !value); setQuery(""); }}
                aria-label={searchOpen ? tr("Close profile search", "關閉創作者搜尋") : tr("Find a related profile", "尋找相關創作者")}
                aria-expanded={searchOpen}
                aria-controls={searchOpen ? "profile-search-popover" : undefined}
                title={searchOpen ? tr("Close profile search", "關閉創作者搜尋") : tr("Find a related profile", "尋找相關創作者")}
              >
                <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.7"/><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
              </button>
              {searchOpen && (
                <div id="profile-search-popover" className="profile-search-popover">
                  <input className="profile-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setSearchOpen(false); setQuery(""); } }} placeholder={tr("Find a profile", "搜尋創作者")} aria-label={tr("Find a related profile", "尋找相關創作者")} autoFocus />
                </div>
              )}
            </div>
          </div>
          <p className="side-note">{t(activeCategory === "kol" ? "kolRelatedNote" : "relatedNote")}</p>
          {archivedForCategory.length > 0 && <div className="archived-section">
            <button type="button" className="archived-trigger" onClick={() => setArchivedOpen((value) => {
              archivedOpenCache = !value;
              return !value;
            })}
              aria-expanded={showArchivedProfiles} aria-controls={showArchivedProfiles ? "archived-profile-list" : undefined}>
              <span>{t("archivedProfiles")}</span><span>{archivedForCategory.length} {showArchivedProfiles ? "▴" : "▾"}</span>
            </button>
            {showArchivedProfiles && <nav id="archived-profile-list" className="profile-list archived-profile-list" aria-label={t("archivedProfiles")}>
              {archivedProfiles.map((author) => <div key={author.username} className="profile-row">
                <Link href={withMediaFilter(authorHref(author.username), filter)} prefetch={false} data-sidebar-profile={author.username} className="profile-link">
                  <span className="profile-copy"><strong>{author.name}</strong><small>@{author.username}</small></span>
                </Link>
                <button type="button" className="profile-action" disabled={pendingArchive !== null}
                  onClick={() => void toggleArchived(author.username, false)} aria-label={tr(`Restore @${author.username}`, `還原 @${author.username}`)} title={tr("Restore profile", "還原創作者")}>↶</button>
              </div>)}
              {archivedProfiles.length === 0 && <p className="side-note">{t("noArchivedProfiles")}</p>}
            </nav>}
          </div>}
          {archiveError && <p className="side-note archive-error" role="status">{archiveError}</p>}
          <nav className="profile-list" aria-label={activeCategory === "kol" ? tr("Similar KOL creators", "相似的 KOL 創作者") : t("relatedProfiles")}>
            {related.map((author, index) => (
              <div key={author.username} className={`profile-row${author.username === seed ? " featured-profile" : ""}`}>
                <Link href={withMediaFilter(authorHref(author.username), filter)} prefetch={false} data-sidebar-profile={author.username} className={`profile-link${selectedAuthor === author.username ? " selected" : ""}`} aria-current={selectedAuthor === author.username ? "page" : undefined}>
                  <span className="profile-rank">{author.username === seed ? "✦" : String(index + (related[0]?.username === seed ? 0 : 1)).padStart(2, "0")}</span>
                  <span className="profile-copy"><strong>{author.name}</strong><small>@{author.username} · {filter === "video" ? author.videoCount : filter === "post" ? author.postCount : author.count} {t("from2026")}</small>{author.username === seed && <span className="featured-profile-label">{t("featuredCreator")}</span>}{activeCategory === "kol" && <small>{formatCount(author.followers ?? null)} {t("followers")} · {author.popularity?.likesKnown ? `${formatCount(Math.round(author.popularity.likes / author.popularity.likesKnown))} ${t("averageLikes")}` : t("likesHidden")}</small>}<ProfileActivityPills activity={activityFor(author.username)} username={author.username} /></span>
                </Link>
                {author.username !== seed && <button type="button" className="profile-action" disabled={pendingArchive !== null}
                  onClick={() => void toggleArchived(author.username, true)} aria-label={tr(`Archive and unfollow @${author.username}`, `封存並取消追蹤 @${author.username}`)} title={tr("Archive and unfollow profile", "封存並取消追蹤創作者")}>
                  <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true"><path d="M3 5.5h14M7 5.5v-2h6v2M5 5.5l.8 11h8.4l.8-11M8 8.5v5m4-5v5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/></svg>
                </button>}
              </div>
            ))}
            {related.length === 0 && <p className="side-note">{t("noProfiles")}</p>}
          </nav>
          </>}
          </>}
        </div>
        {collapsed && <button type="button" className="sidebar-expand-area" onClick={toggleSidebar} aria-label={t("expandSidebar")} />}
        <PlatformSettings collapsed={collapsed} sidebarWidth={sidebarWidth} />
      </aside>

      <div className="main-column" data-lab-page={labView || topicsView === "lab" || Boolean(sourcesView) ? "" : undefined}>
        <main>{children}</main>
        {(labView || topicsView === "lab" || Boolean(sourcesView)) && <div className="lab-mode-message" role="status">
          <h1>{tr("Lab mode is off", "實驗室模式已關閉")}</h1>
          <p>{tr("Open Settings and switch to Lab to use this workspace.", "請開啟設定並切換至實驗室模式，以使用這個工作區。")}</p>
        </div>}
      </div>
      {floatViewsOpen && floatViews && createPortal(
        <nav id="collection-views-nav" ref={floatPanelRef} className="view-nav views-float-panel" aria-label={tr("Collection views", "收藏檢視")}
          style={{ left: floatViews.left, top: floatViews.top, maxHeight: floatViews.maxHeight }}
          onClick={(event) => {
            // Portal events still bubble to the sidebar, whose collapsed click expands it.
            event.stopPropagation();
            if (event.target instanceof Element && event.target.closest("a")) setFloatViews(null);
          }}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && (floatPanelRef.current?.contains(next) || viewsTriggerRef.current?.contains(next))) return;
            if (next) setFloatViews(null);
          }}>
          <span className="views-float-heading">{t("views")}</span>
          {viewLinks}
        </nav>, document.body)}
      {navTooltip && createPortal(<div className="sidebar-nav-tooltip" aria-hidden="true" style={{ left: navTooltip.left, top: navTooltip.top }}>{navTooltip.text}</div>, document.body)}
    </div>
  );
}
