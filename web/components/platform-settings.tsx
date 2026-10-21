"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n";
import { setJevPreference, useJevPreferences } from "@/lib/jev-preferences";
import { SettingsIcon } from "@/components/settings-icon";

export function PlatformSettings({ collapsed, sidebarWidth }: { collapsed: boolean; sidebarWidth: number }) {
  const { locale, setLocale, t, tr } = useI18n();
  const jev = useJevPreferences();
  const [open, setOpen] = useState(false);
  const [appearance, setAppearance] = useState<"light" | "dark">("light");
  const [mode, setMode] = useState<"user" | "lab">("user");
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const sync = () => {
      setAppearance(window.localStorage.getItem("collections-theme") === "dark" ? "dark" : "light");
      const next = window.localStorage.getItem("collections-workspace-mode") === "lab" ? "lab" : "user";
      setMode(next);
      document.documentElement.dataset.workspaceMode = next;
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const chooseAppearance = (next: "light" | "dark") => {
    setAppearance(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("collections-theme", next);
  };
  const chooseMode = (next: "user" | "lab") => {
    setMode(next);
    document.documentElement.dataset.workspaceMode = next;
    window.localStorage.setItem("collections-workspace-mode", next);
  };
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [open]);
  return <>
    <button ref={trigger} type="button" className={`platform-settings-trigger${open ? " selected" : ""}`}
      title={t("settings")} aria-label={t("settings")} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <SettingsIcon />
    </button>
    {open && createPortal(<section ref={panel} className="platform-settings-panel" aria-label={t("settings")}
      style={{ left: `min(calc(100vw - 344px), ${collapsed ? 64 : sidebarWidth + 10}px)` }}>
      <header><button type="button" onClick={() => { setOpen(false); trigger.current?.focus(); }} aria-label={t("close")}>×</button></header>
      <fieldset><legend>{t("language")}</legend><div className="platform-settings-choice">
        <button type="button" className={locale === "en" ? "selected" : ""} aria-pressed={locale === "en"} onClick={() => setLocale("en")}>{t("english")}</button>
        <button type="button" className={locale === "zh-Hant" ? "selected" : ""} aria-pressed={locale === "zh-Hant"} onClick={() => setLocale("zh-Hant")}>{t("chinese")}</button>
      </div></fieldset>
      <fieldset><legend>{tr("Appearance", "外觀")}</legend><div className="platform-settings-choice">
        <button type="button" className={appearance === "light" ? "selected" : ""} aria-pressed={appearance === "light"} onClick={() => chooseAppearance("light")}>{tr("Light", "明亮")}</button>
        <button type="button" className={appearance === "dark" ? "selected" : ""} aria-pressed={appearance === "dark"} onClick={() => chooseAppearance("dark")}>{tr("Dark", "深色")}</button>
      </div></fieldset>
      <fieldset><legend>{tr("Workspace", "使用模式")}</legend><div className="platform-settings-choice">
        <button type="button" className={mode === "user" ? "selected" : ""} aria-pressed={mode === "user"} onClick={() => chooseMode("user")}>{tr("User", "使用者")}</button>
        <button type="button" className={mode === "lab" ? "selected" : ""} aria-pressed={mode === "lab"} onClick={() => chooseMode("lab")}>{tr("Lab", "實驗室")}</button>
      </div></fieldset>
      <fieldset data-lab-feature><legend>{t("jevFeatures")}</legend>
        <label><input type="checkbox" checked={jev.overlap} onChange={(event) => setJevPreference("overlap", event.currentTarget.checked)} />{t("jevOverlap")}</label>
        <label><input type="checkbox" checked={jev.theme} onChange={(event) => setJevPreference("theme", event.currentTarget.checked)} />{t("jevTheme")}</label>
      </fieldset>
    </section>, document.body)}
  </>;
}
