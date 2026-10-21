"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export type Locale = "en" | "zh-Hant";

const messages = {
  en: {
    settings: "Settings", language: "Language", english: "English", chinese: "繁體中文（台灣）",
    jevFeatures: "Jev features", jevOverlap: "Review overlapping stories", jevTheme: "Find stories by exact theme",
    close: "Close", collections: "Collections", motionAtlas: "Motion atlas / 2026", dataSources: "Data sources",
    topics: "Topics", newsDesk: "News desk", views: "Views", lab: "Lab", design: "Design",
    allCreators: "All Design creators", collectedPosts: "Collected 2026 posts", focusedProfiles: "Focused profiles",
    focusedHint: "Why these two accounts", likedPosts: "Liked posts", likedHint: "Your liked collection",
    dislikedPosts: "Disliked posts", dislikedHint: "Posts you set aside", followed: "Followed",
    followedHint: "Posts from followed accounts", popularity: "Popularity", popularityHint: "Instagram snapshot by creator",
    videos: "Videos", imagePosts: "Image posts", relatedProfiles: "Related profiles",
    similarCreators: "Similar creators", archivedProfiles: "Archived profiles", featuredCreator: "Featured creator",
    allKOLCreators: "All KOL creators", allDesignCreators: "All Design creators", topicsIntro: "Daily material, brand, supply chain, and conversation inspiration. Save promising stories to Topics Lab.",
    relatedNote: "Featured creator appears first. Similarity for other profiles is unverified. Archive to hide and unfollow other profiles.",
    kolRelatedNote: "Featured creator appears first. Other suggestions were selected for outdoor style and gear overlap. Archive to hide and unfollow other profiles.",
    noProfiles: "No matching profiles.", noArchivedProfiles: "No matching archived profiles.", from2026: "from 2026", followers: "followers", averageLikes: "avg likes", likesHidden: "likes hidden",
    search: "Search", sources: "Sources", expandSidebar: "Expand sidebar", collapseSidebar: "Collapse sidebar",
  },
  "zh-Hant": {
    settings: "設定", language: "語言", english: "English", chinese: "繁體中文（台灣）",
    jevFeatures: "Jev 功能", jevOverlap: "檢查重複報導", jevTheme: "依精確主題尋找報導",
    close: "關閉", collections: "收藏", motionAtlas: "動態圖鑑／2026", dataSources: "資料來源",
    topics: "新聞", newsDesk: "新聞選讀", views: "檢視", lab: "實驗室", design: "設計",
    allCreators: "所有設計創作者", collectedPosts: "2026 年收藏貼文", focusedProfiles: "精選創作者",
    focusedHint: "了解這兩位創作者", likedPosts: "喜歡的貼文", likedHint: "你喜歡的收藏",
    dislikedPosts: "略過的貼文", dislikedHint: "你暫時略過的貼文", followed: "追蹤中",
    followedHint: "已追蹤帳號的貼文", popularity: "熱門程度", popularityHint: "創作者的 Instagram 數據",
    videos: "影片", imagePosts: "圖片貼文", relatedProfiles: "相關創作者",
    similarCreators: "相似創作者", archivedProfiles: "已封存的創作者", featuredCreator: "精選創作者",
    allKOLCreators: "所有 KOL 創作者", allDesignCreators: "所有設計創作者", topicsIntro: "每天瀏覽布料、品牌、供應鏈與話題靈感，並把值得研究的報導存入新聞實驗室。",
    relatedNote: "精選創作者會顯示在最前面。其他創作者的相似度尚未驗證；封存可隱藏並取消追蹤。",
    kolRelatedNote: "精選創作者會顯示在最前面。其他建議依戶外風格與裝備相關性挑選；封存可隱藏並取消追蹤。",
    noProfiles: "找不到符合條件的創作者。", noArchivedProfiles: "找不到符合條件的已封存創作者。", from2026: "則 2026 年貼文", followers: "位追蹤者", averageLikes: "平均喜歡數", likesHidden: "喜歡數未公開",
    search: "搜尋", sources: "來源", expandSidebar: "展開側欄", collapseSidebar: "收合側欄",
  },
} as const;

type Key = keyof typeof messages.en;
type I18n = { locale: Locale; setLocale: (next: Locale) => void; t: (key: Key) => string; tr: (english: string, taiwanese: string) => string };
const Context = createContext<I18n | null>(null);

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const router = useRouter();
  const [locale, updateLocale] = useState<Locale>(initialLocale);
  const tr = useCallback((english: string, taiwanese: string) => locale === "zh-Hant" ? taiwanese : english, [locale]);
  const t = useCallback((key: Key) => messages[locale][key], [locale]);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const setLocale = (next: Locale) => {
    if (next === locale) return;
    document.cookie = `collections-locale=${encodeURIComponent(next)}; path=/; max-age=31536000; SameSite=Lax`;
    updateLocale(next);
    router.refresh();
  };
  return <Context.Provider value={{ locale, setLocale, t, tr }}>{children}</Context.Provider>;
}

export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error("I18nProvider is missing");
  return value;
}
