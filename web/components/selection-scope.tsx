"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LassoArea } from "@/components/lasso-select";
import { useI18n } from "@/lib/i18n";

// App-wide multi-selection. A scope is one selectable collection (posts, frames, studies, assets,
// stories). Items opt in with data-select-id. Only one scope selects at a time: entering one
// leaves the others. Batch actions are added to the selection bar later.

const scopeEvent = "collections-selection-scope";

export type SelectionScope = {
  name: string;
  ids: string[];
  selecting: boolean;
  selected: Set<string>;
  enter: () => void;
  exit: () => void;
  setSelected: (next: Set<string>) => void;
};

// A collection with its own selection (e.g. frames with batch labels) passes value/onChange;
// leaving select mode then keeps that selection instead of clearing it.
export function useSelectionScope(name: string, ids: string[], { shortcut = false, value, onChange, onExit }: { shortcut?: boolean; value?: Set<string>; onChange?: (next: Set<string>) => void; onExit?: () => void } = {}): SelectionScope {
  const [selecting, setSelecting] = useState(false);
  const [ownPicked, setOwnPicked] = useState<Set<string>>(new Set());
  const controlled = value !== undefined && onChange !== undefined;
  const picked = controlled ? value : ownPicked;
  const setPicked = controlled ? onChange : setOwnPicked;
  const idSet = new Set(ids);
  // Items that left the collection (filter, removal) drop out of the selection.
  const selected = new Set([...picked].filter((id) => idSet.has(id)));

  function enter() {
    window.dispatchEvent(new CustomEvent(scopeEvent, { detail: name }));
    setSelecting(true);
  }
  function exit() {
    setSelecting(false);
    if (!controlled) setPicked(new Set());
    onExit?.();
  }

  useEffect(() => {
    function onScope(event: Event) {
      if ((event as CustomEvent<string>).detail !== name) { setSelecting(false); if (!controlled) setOwnPicked(new Set()); onExit?.(); }
    }
    window.addEventListener(scopeEvent, onScope);
    return () => window.removeEventListener(scopeEvent, onScope);
  }, [name, controlled, onExit]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const key = event.key.toLowerCase();
      if (shortcut && key === "s" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (selecting) exit(); else enter();
      } else if (selecting && event.key === "Escape") {
        if (picked.size) setPicked(new Set()); else exit();
      } else if (selecting && key === "a" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPicked(new Set(ids));
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return { name, ids, selecting, selected, enter, exit, setSelected: setPicked };
}

export function SelectToggle({ scope, noun, nouns = `${noun}s`, onExit }: { scope: SelectionScope; noun: string; nouns?: string; onExit?: () => void }) {
  const { tr } = useI18n();
  return <button type="button" className={`select-toggle${scope.selecting ? " selected" : ""}`} aria-pressed={scope.selecting}
    onClick={() => { if (scope.selecting) { scope.exit(); onExit?.(); } else scope.enter(); }}
    title={scope.selecting ? tr("Leave select mode", "離開選取模式") : tr(`Select ${nouns}: click, Shift+click, or drag a lasso`, `選取${noun}：點選、Shift 加選或拖曳框選`)}>
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3.5c4 0 7 1.9 7 4.3S14 12 10 12 3 10.2 3 7.8 6 3.5 10 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.6 2"/><path d="M6.5 11.5c-.6 1.4-.2 2.7 1.1 3.3.9.4 1 1.3.4 2.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
    {scope.selecting ? tr("Done", "完成") : tr("Select", "選取")}
  </button>;
}

export function SelectionBar({ scope, noun, nouns = `${noun}s`, actions, preview, origin, onExit, className }: { scope: SelectionScope; noun: string; nouns?: string; actions?: ReactNode; preview?: ReactNode; origin?: ReactNode; onExit?: () => void; className?: string }) {
  const { tr } = useI18n();
  if (!scope.selecting) return null;
  const total = scope.ids.length;
  return <div className={`selection-bar${className ? ` ${className}` : ""}`} role="region" aria-label={tr(`${noun} selection`, `${noun}選取`)}>
    <div className="selection-bar-summary">
      {preview && scope.selected.size > 0 ? <div className="selection-bar-preview-wrap"><button type="button" className="selection-bar-preview-trigger" aria-label={tr(`Show ${scope.selected.size} selected ${nouns}`, `查看已選取的 ${scope.selected.size} 項${noun}`)}>{tr(`${scope.selected.size} ${scope.selected.size === 1 ? noun : nouns} selected`, `已選取 ${scope.selected.size} 項`)}</button><div className="selection-bar-preview" role="region" aria-label={tr("Selected items", "已選取項目")}>{preview}</div></div>
        : <strong aria-live="polite">{tr(`${scope.selected.size} ${scope.selected.size === 1 ? noun : nouns} selected`, `已選取 ${scope.selected.size} 項`)}</strong>}
      <span className="selection-bar-hint">{tr("Drag a box to select · Shift adds · ⌥ removes · Shift+click for a range", "拖曳框選 · Shift 加選 · ⌥ 移除 · Shift+點選連續範圍")}</span>
      {origin && scope.selected.size > 0 && <span className="selection-bar-origin">{origin}</span>}
    </div>
    <div className="selection-bar-actions" aria-label={tr("Batch actions", "批次操作")}>{actions ?? <span>{tr("Batch actions will appear here", "批次操作會顯示於此")}</span>}</div>
    <div className="selection-bar-controls">
      <button type="button" onClick={() => scope.setSelected(new Set(scope.ids))} disabled={scope.selected.size === total}>{tr(`Select all ${total}`, `全選 ${total} 項`)}</button>
      <button type="button" onClick={() => scope.setSelected(new Set())} disabled={!scope.selected.size}>{tr("Clear", "清除")}</button>
      <button type="button" className="selection-bar-done" onClick={() => { scope.exit(); onExit?.(); }}>{tr("Done", "完成")}</button>
    </div>
  </div>;
}

// dragToSelect: a mouse drag starts a lasso without pressing Select first. Off for text-heavy
// collections (stories, notes) where dragging should still select text.
export function SelectionArea({ scope, children, dragToSelect = true }: { scope: SelectionScope; children: ReactNode; dragToSelect?: boolean }) {
  return <LassoArea enabled={scope.selecting} ids={scope.ids} selected={scope.selected} onSelect={scope.setSelected}
    dragToSelect={dragToSelect} onStart={scope.enter}>{children}</LassoArea>;
}

// For server-rendered collections: a small toolbar with the trigger, the lasso area and the bar.
export function SelectableSection({ name, noun, nouns = `${noun}s`, ids, children }: { name: string; noun: string; nouns?: string; ids: string[]; children: ReactNode }) {
  const { tr } = useI18n();
  const scope = useSelectionScope(name, ids);
  return <>
    <div className="select-toolbar"><span>{tr(`${ids.length} ${ids.length === 1 ? noun : nouns}`, `${ids.length} 項`)}</span><SelectToggle scope={scope} noun={noun} nouns={nouns} /></div>
    <SelectionArea scope={scope}>{children}</SelectionArea>
    <SelectionBar scope={scope} noun={noun} nouns={nouns} />
  </>;
}
