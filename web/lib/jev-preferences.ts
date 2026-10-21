"use client";

import { useSyncExternalStore } from "react";

export type JevFeature = "overlap" | "theme";
const key = "collections-jev-features";
const event = "collections-jev-features-change";
type Preferences = Record<JevFeature, boolean>;
const defaults: Preferences = { overlap: true, theme: true };

function snapshot(): string {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(event, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(event, callback); };
}
export function useJevPreferences(): Preferences {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  try { return { ...defaults, ...JSON.parse(raw) }; } catch { return defaults; }
}
export function setJevPreference(feature: JevFeature, enabled: boolean) {
  const current = (() => { try { return JSON.parse(snapshot()) as Preferences; } catch { return defaults; } })();
  localStorage.setItem(key, JSON.stringify({ ...defaults, ...current, [feature]: enabled }));
  window.dispatchEvent(new Event(event));
}
