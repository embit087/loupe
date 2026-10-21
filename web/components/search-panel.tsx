"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n";

// Search trigger for the sidebar header. The panel floats above the page: drag its bar to move it,
// drag the bottom-right grip to resize it. Its body is an empty placeholder for features specified later.
const POSITION_KEY = "collections-search-panel-position";
const SIZE_KEY = "collections-search-panel-size";
const MARGIN = 8;
const DEFAULT_SIZE = { width: 640, height: 460 };
const MIN_SIZE = { width: 360, height: 260 };
type Position = { x: number; y: number };
type Size = { width: number; height: number };

function fitSize(size: Size): Size {
  return {
    width: Math.round(Math.max(Math.min(size.width, window.innerWidth - MARGIN * 2), Math.min(MIN_SIZE.width, window.innerWidth - MARGIN * 2))),
    height: Math.round(Math.max(Math.min(size.height, window.innerHeight - MARGIN * 2), Math.min(MIN_SIZE.height, window.innerHeight - MARGIN * 2))),
  };
}

function clamp(position: Position, size: Size): Position {
  return {
    x: Math.round(Math.min(Math.max(position.x, MARGIN), window.innerWidth - size.width - MARGIN)),
    y: Math.round(Math.min(Math.max(position.y, MARGIN), window.innerHeight - size.height - MARGIN)),
  };
}

function centered(size: Size): Position {
  return clamp({ x: (window.innerWidth - size.width) / 2, y: (window.innerHeight - size.height) / 2 }, size);
}

function read<T>(key: string, valid: (value: T) => boolean): T | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "null") as T | null;
    return value && valid(value) ? value : null;
  } catch {
    return null;
  }
}

function remember(key: string, value: Position | Size) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* Lasts for this visit only. */ }
}

type Frame = Position & Size;

function savedFrame(): Frame {
  const size = fitSize(read<Size>(SIZE_KEY, (value) => Number.isFinite(value.width) && Number.isFinite(value.height)) ?? DEFAULT_SIZE);
  const position = read<Position>(POSITION_KEY, (value) => Number.isFinite(value.x) && Number.isFinite(value.y));
  return { ...size, ...(position ? clamp(position, size) : centered(size)) };
}

export function SearchToggle() {
  const { tr } = useI18n();
  const [frame, setFrame] = useState<Frame | null>(null);
  const [dragging, setDragging] = useState<"move" | "resize" | null>(null);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; start: Frame; last: Frame } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const open = frame !== null;

  useEffect(() => {
    if (!open) return;
    barRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setFrame(null);
      triggerRef.current?.focus();
    }
    const keepInside = () => setFrame((current) => {
      if (!current) return current;
      const size = fitSize(current);
      return { ...size, ...clamp(current, size) };
    });
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", keepInside);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", keepInside);
    };
  }, [open]);

  function close() {
    setFrame(null);
    triggerRef.current?.focus();
  }

  function apply(next: Frame) {
    setFrame(next);
    remember(POSITION_KEY, { x: next.x, y: next.y });
    remember(SIZE_KEY, { width: next.width, height: next.height });
  }

  function moveTo(position: Position) {
    if (frame) apply({ ...frame, ...clamp(position, frame) });
  }

  function resizeTo(size: Size) {
    if (!frame) return;
    // Grow up to the viewport edge from the current corner; never below the minimum.
    const width = Math.round(Math.min(Math.max(size.width, MIN_SIZE.width), window.innerWidth - frame.x - MARGIN));
    const height = Math.round(Math.min(Math.max(size.height, MIN_SIZE.height), window.innerHeight - frame.y - MARGIN));
    return { ...frame, width, height };
  }

  function startDrag(mode: "move" | "resize", event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || !frame) return;
    if (mode === "move" && event.target instanceof Element && event.target.closest("button")) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, start: frame, last: frame };
    setDragging(mode);
  }

  function continueDrag(event: ReactPointerEvent<HTMLElement>) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.startX, dy = event.clientY - state.startY;
    state.last = dragging === "resize"
      ? resizeTo({ width: state.start.width + dx, height: state.start.height + dy }) ?? state.last
      : { ...state.start, ...clamp({ x: state.start.x + dx, y: state.start.y + dy }, state.start) };
    setFrame(state.last);
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    apply(state.last);
    drag.current = null;
    setDragging(null);
  }

  function keyStep(event: ReactKeyboardEvent<HTMLElement>, mode: "move" | "resize") {
    if (!frame) return;
    const step = event.shiftKey ? 64 : 16;
    const deltas: Record<string, Position> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    if (event.key === "Home") {
      event.preventDefault();
      if (mode === "move") moveTo(centered(frame));
      else { const next = resizeTo(DEFAULT_SIZE); if (next) apply(next); }
      return;
    }
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    if (mode === "move") moveTo({ x: frame.x + delta.x, y: frame.y + delta.y });
    else { const next = resizeTo({ width: frame.width + delta.x, height: frame.height + delta.y }); if (next) apply(next); }
  }

  return <>
    <button ref={triggerRef} type="button" className={`search-toggle${open ? " selected" : ""}`} onClick={() => open ? close() : setFrame(savedFrame())}
      aria-label={open ? tr("Close search", "關閉搜尋") : tr("Search", "搜尋")} aria-haspopup="dialog" aria-expanded={open} data-nav-tooltip={tr("Search", "搜尋")}>
      <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true">
        <circle cx="8.75" cy="8.75" r="5.25" stroke="currentColor" strokeWidth="1.6" />
        <path d="m12.75 12.75 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
    {frame && createPortal(
      // Portal events still bubble to the sidebar, whose collapsed click expands it.
      <section className={`search-panel${dragging ? ` ${dragging === "move" ? "dragging" : "resizing"}` : ""}`} role="dialog" aria-label={tr("Search", "搜尋")}
        style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }} onClick={(event) => event.stopPropagation()}>
        <div ref={barRef} className="search-panel-bar" tabIndex={0} role="toolbar" aria-label={tr("Search panel. Drag, or use arrow keys, to move it; Home re-centres.", "搜尋面板。可拖曳或使用方向鍵移動；Home 可置中。")}
          onPointerDown={(event) => startDrag("move", event)} onPointerMove={continueDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
          onKeyDown={(event) => keyStep(event, "move")} onDoubleClick={() => moveTo(centered(frame))}>
          <span className="search-panel-grip" aria-hidden="true"><svg viewBox="0 0 20 20" fill="currentColor"><circle cx="7" cy="5" r="1.4"/><circle cx="13" cy="5" r="1.4"/><circle cx="7" cy="10" r="1.4"/><circle cx="13" cy="10" r="1.4"/><circle cx="7" cy="15" r="1.4"/><circle cx="13" cy="15" r="1.4"/></svg></span>
          <span className="search-panel-title">{tr("Search", "搜尋")}</span>
          <button type="button" className="search-panel-close" onClick={close} aria-label={tr("Close search", "關閉搜尋")}>
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5.5 5.5 9 9m0-9-9 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="search-panel-body" />
        <div className="search-panel-resize" tabIndex={0} role="button" aria-label={tr("Resize search panel. Drag, or use arrow keys; Home restores the default size.", "調整搜尋面板大小。可拖曳或使用方向鍵；Home 可還原預設尺寸。")}
          title={tr("Drag to resize · double-click to reset", "拖曳調整大小 · 連按兩下重設")}
          onPointerDown={(event) => startDrag("resize", event)} onPointerMove={continueDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
          onKeyDown={(event) => keyStep(event, "resize")} onDoubleClick={() => { const next = resizeTo(DEFAULT_SIZE); if (next) apply(next); }}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M14 6 6 14M14 10.5 10.5 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </div>
      </section>, document.body)}
  </>;
}
