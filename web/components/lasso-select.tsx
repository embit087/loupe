"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

// Rectangle marquee selection over any descendants carrying data-select-id: items the box touches are selected.
// Plain drag replaces the selection, Shift adds, Alt/Option removes. A click toggles one item,
// Shift+click selects the range from the last clicked item. Dragging near the top or bottom
// edge scrolls the page so a lasso can span more than one screen. With dragToSelect, a mouse drag
// starts a lasso even outside select mode (and turns it on); a plain click keeps its normal action.

type Point = { x: number; y: number };
type Box = { id: string; element: HTMLElement; left: number; top: number; right: number; bottom: number };
type Mode = "replace" | "add" | "remove";
type Drag = {
  pointerId: number; start: Point; client: Point; anchor: Point | null; current: Point | null; mode: Mode; active: boolean;
  boxes: Box[]; base: Set<string>; result: Set<string>; frame: number; scrollFrame: number; targetId: string | null;
  passive: boolean; // started outside select mode: becomes a lasso only once the pointer moves
};

const START_DISTANCE = 4;
const EDGE = 64;

// Container coordinates, so the box stays anchored while the page scrolls.
function toRect(a: Point, b: Point) {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
}

export function LassoArea({ enabled, ids, selected, onSelect, children, dragToSelect = false, onStart }: {
  enabled: boolean;
  dragToSelect?: boolean;
  onStart?: () => void;
  ids: string[];
  selected: Set<string>;
  onSelect: (next: Set<string>) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const drag = useRef<Drag | null>(null);
  const anchor = useRef<string | null>(null);
  const suppressClick = useRef(false);
  const [lassoing, setLassoing] = useState(false);

  useEffect(() => () => {
    if (drag.current) { cancelAnimationFrame(drag.current.frame); cancelAnimationFrame(drag.current.scrollFrame); }
  }, []);

  // Selected items are marked on the element itself, so any collection gets the styling
  // without per-item code; newly rendered items (infinite load) are marked as they appear.
  useLayoutEffect(() => {
    const area = ref.current;
    if (!area) return;
    const sync = () => {
      for (const element of area.querySelectorAll<HTMLElement>("[data-select-id]")) {
        const on = enabled && selected.has(element.dataset.selectId!);
        if (on) element.dataset.selected = ""; else delete element.dataset.selected;
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(area, { childList: true, subtree: true });
    return () => observer.disconnect();
  });

  function local(client: Point): Point {
    const rect = ref.current!.getBoundingClientRect();
    return { x: client.x - rect.left, y: client.y - rect.top };
  }

  function measure(): Box[] {
    const rect = ref.current!.getBoundingClientRect();
    return [...ref.current!.querySelectorAll<HTMLElement>("[data-select-id]")].map((element) => {
      const box = element.getBoundingClientRect();
      return { id: element.dataset.selectId!, element, left: box.left - rect.left, top: box.top - rect.top, right: box.right - rect.left, bottom: box.bottom - rect.top };
    });
  }

  function clearPreview(state: Drag) {
    for (const box of state.boxes) delete box.element.dataset.lasso;
  }

  function render(state: Drag) {
    state.frame = 0;
    if (!state.anchor || !state.current) return;
    const box = toRect(state.anchor, state.current);
    pathRef.current?.setAttribute("d", `M${box.left} ${box.top}H${box.right}V${box.bottom}H${box.left}Z`);
    // More items may have loaded while auto-scrolling.
    if (ref.current && ref.current.querySelectorAll("[data-select-id]").length !== state.boxes.length) { clearPreview(state); state.boxes = measure(); }
    const hits = new Set(state.boxes.filter((item) => item.right >= box.left && item.left <= box.right && item.bottom >= box.top && item.top <= box.bottom).map((item) => item.id));
    state.result = state.mode === "replace" ? hits
      : state.mode === "add" ? new Set([...state.base, ...hits])
        : new Set([...state.base].filter((id) => !hits.has(id)));
    for (const item of state.boxes) item.element.dataset.lasso = state.result.has(item.id) ? "in" : "out";
  }

  function schedule(state: Drag) {
    if (!state.frame) state.frame = requestAnimationFrame(() => render(state));
  }

  function track(state: Drag) {
    state.current = local(state.client);
    schedule(state);
  }

  function autoScroll(state: Drag) {
    const y = state.client.y;
    const speed = y < EDGE ? -Math.ceil((EDGE - y) / 3) : y > window.innerHeight - EDGE ? Math.ceil((y - (window.innerHeight - EDGE)) / 3) : 0;
    // Instant, not the page's smooth scrolling, so the lasso tracks the pointer frame by frame.
    if (speed) { window.scrollBy({ top: speed, behavior: "instant" }); track(state); }
    state.scrollFrame = requestAnimationFrame(() => autoScroll(state));
  }

  function finish(commit: boolean) {
    const state = drag.current;
    if (!state) return;
    cancelAnimationFrame(state.frame);
    cancelAnimationFrame(state.scrollFrame);
    if (state.active) {
      if (commit) render(state);
      clearPreview(state);
      pathRef.current?.setAttribute("d", "");
      setLassoing(false);
      if (commit) onSelect(state.result);
    }
    drag.current = null;
  }

  function toggle(id: string | null, shift: boolean) {
    if (!id) { if (!shift) onSelect(new Set()); return; }
    const next = new Set(selected);
    const from = anchor.current ? ids.indexOf(anchor.current) : -1;
    const to = ids.indexOf(id);
    if (shift && from >= 0 && to >= 0) {
      for (const rangeId of ids.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(rangeId);
    } else if (next.has(id)) next.delete(id);
    else next.add(id);
    anchor.current = id;
    onSelect(next);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("[data-select-ignore]")) return;
    if (!enabled) {
      // Outside select mode, only watch: clicks, focus and links behave normally unless the pointer moves.
      if (!dragToSelect || event.pointerType === "touch" || (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true]"))) return;
      const client = { x: event.clientX, y: event.clientY };
      drag.current = {
        pointerId: event.pointerId, start: client, client, anchor: null, current: null, active: false, boxes: [], frame: 0, scrollFrame: 0, passive: true,
        mode: event.altKey ? "remove" : event.shiftKey ? "add" : "replace", base: new Set(selected), result: new Set(selected), targetId: null,
      };
      return;
    }
    // Cards are inert while selecting: no links, playback, text selection or image dragging.
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Moves still arrive while over the area. */ }
    const client = { x: event.clientX, y: event.clientY };
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-select-id]") : null;
    drag.current = {
      pointerId: event.pointerId, start: client, client, anchor: null, current: null, active: false, boxes: [], frame: 0, scrollFrame: 0, passive: false,
      mode: event.altKey ? "remove" : event.shiftKey ? "add" : "replace", base: new Set(selected), result: new Set(selected),
      targetId: target?.dataset.selectId ?? null,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    state.client = { x: event.clientX, y: event.clientY };
    if (!state.active) {
      if (Math.hypot(state.client.x - state.start.x, state.client.y - state.start.y) < START_DISTANCE) return;
      if (state.passive) {
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Moves still arrive while over the area. */ }
        window.getSelection()?.removeAllRanges();
        onStart?.();
      }
      state.active = true;
      state.boxes = measure();
      state.anchor = local(state.start);
      setLassoing(true);
      state.scrollFrame = requestAnimationFrame(() => autoScroll(state));
    }
    track(state);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (state.active) {
      finish(true);
      // The browser may still fire a click on the item under the pointer; a lasso must not open it.
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 0);
    } else if (state.passive) drag.current = null;
    else { drag.current = null; toggle(state.targetId, event.shiftKey); }
  }

  function onClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; return; }
    if (event.target instanceof Element && event.target.closest("[data-select-ignore]")) return;
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    // Keyboard activation (Enter/Space on a focused link or button) toggles its item.
    if (event.detail === 0) toggle(event.target instanceof Element ? event.target.closest<HTMLElement>("[data-select-id]")?.dataset.selectId ?? null : null, event.shiftKey);
  }

  useEffect(() => {
    if (!lassoing) return;
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopImmediatePropagation(); finish(false); } };
    window.addEventListener("keydown", cancel, true);
    return () => window.removeEventListener("keydown", cancel, true);
  });

  return <div ref={ref} className={`lasso-area${enabled ? " selecting" : ""}${lassoing ? " lassoing" : ""}${dragToSelect ? " drag-select" : ""}`}
    onPointerDownCapture={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => finish(false)}
    onClickCapture={onClickCapture} onDragStartCapture={(event) => { if (enabled || drag.current) event.preventDefault(); }}>
    {children}
    <svg className="lasso-overlay" aria-hidden="true"><path ref={pathRef} /></svg>
  </div>;
}
