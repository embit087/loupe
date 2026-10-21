"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

const storageKey = "collections-context-collapsed";
const changeEvent = "collections-context-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(changeEvent, callback);
  };
}

function snapshot() {
  try {
    return window.localStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
}

// startExpanded: the panel opens expanded on every visit and keeps its own state instead of the
// shared, remembered one (used by Topics, whose controls live in this panel).
export function CollectionLayout({ title, context, compactContext, children, className, startExpanded = false }: { title: string; context: ReactNode; compactContext?: (expand: () => void) => ReactNode; children: ReactNode; className?: string; startExpanded?: boolean }) {
  const { tr } = useI18n();
  const persistedCollapsed = useSyncExternalStore(subscribe, snapshot, () => false);
  const [fallbackCollapsed, setFallbackCollapsed] = useState(false);
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const collapsed = startExpanded ? localCollapsed : persistedCollapsed || fallbackCollapsed;
  const contextRef = useRef<HTMLElement>(null);

  const setCollapsed = useCallback((next: boolean) => {
    if (startExpanded) { setLocalCollapsed(next); return; }
    try {
      window.localStorage.setItem(storageKey, String(next));
      window.dispatchEvent(new Event(changeEvent));
    } catch {
      setFallbackCollapsed(next);
    }
  }, [startExpanded]);

  useEffect(() => {
    if (collapsed) return;

    function collapseOnClickAway(event: MouseEvent) {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (!contextRef.current?.contains(event.target as Node)) setCollapsed(true);
    }

    document.addEventListener("click", collapseOnClickAway, true);
    return () => document.removeEventListener("click", collapseOnClickAway, true);
  }, [collapsed, setCollapsed]);

  return (
    <div className={`collection-page${className ? ` ${className}` : ""}${compactContext ? " has-compact-context" : ""}${collapsed ? " context-collapsed" : ""}`}>
      <aside ref={contextRef} className="collection-context" aria-label={tr("Collection information", "選讀資訊")}>
        <button
          type="button"
          className="context-collapse-trigger"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? tr("Expand collection information", "展開選讀資訊") : tr("Collapse collection information", "收合選讀資訊")}
          aria-expanded={!collapsed}
          aria-controls="collection-context-content"
          title={collapsed ? tr("Expand collection information", "展開選讀資訊") : tr("Collapse collection information", "收合選讀資訊")}
        >
          {collapsed ? "‹" : "›"}
        </button>
        <div id="collection-context-content" className="collection-context-content" hidden={collapsed && !compactContext} inert={collapsed && Boolean(compactContext)} aria-hidden={collapsed}>
          {context}
        </div>
        {compactContext
          ? <div className="collection-context-compact" inert={!collapsed} aria-hidden={!collapsed}>{compactContext(() => setCollapsed(false))}</div>
          : collapsed && <h1 className="collection-context-label">{title}</h1>}
      </aside>
      {children}
    </div>
  );
}
