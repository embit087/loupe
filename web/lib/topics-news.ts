// Shared by the Topics feed and the news reader: topic list, dates, and cleanup of provider text.

export type Topic = "all" | "fabric" | "supply-chain" | "european-brands" | "common-ground" | "ice-breakers" | "entertainment";
export type Article = { id: string; url: string; title: string; summary: string; publishedAt: string | null; source: string; image: string | null; language: "en" | "zh-Hant" | "de" | "und"; topic?: Topic };
export const articleLanguageName = (language: Article["language"], locale: "en" | "zh-Hant") => ({
  en: locale === "zh-Hant" ? "英文" : "English",
  "zh-Hant": locale === "zh-Hant" ? "繁中" : "Traditional Chinese",
  de: locale === "zh-Hant" ? "德文" : "German",
  und: locale === "zh-Hant" ? "其他語言" : "Other language",
})[language];

export const topics: { id: Topic; label: string; detail: string }[] = [
  { id: "all", label: "All", detail: "Every topic for the day" },
  { id: "fabric", label: "Fabric", detail: "Technical materials & mills" },
  { id: "supply-chain", label: "Supply chain", detail: "Sourcing, mills & regulation" },
  { id: "european-brands", label: "European brands", detail: "Performance brands & fabric launches" },
  { id: "common-ground", label: "Common ground", detail: "Sustainability & circular textiles" },
  { id: "ice-breakers", label: "Ice breakers", detail: "Surprising textile science" },
  { id: "entertainment", label: "Entertainment", detail: "Fabrics in film, stage & sport" },
];
export const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const validDate = (value: string | undefined) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && value <= today() ? value : today();
export const dateLabel = (date: string) => new Intl.DateTimeFormat("en", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00Z`));
export const dateLabelZh = (date: string) => new Intl.DateTimeFormat("zh-TW", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${date}T12:00:00Z`));
export const topicLabelZh = (topic: Topic) => ({ all: "全部", fabric: "布料", "supply-chain": "供應鏈", "european-brands": "歐洲品牌", "common-ground": "共同話題", "ice-breakers": "破冰話題", entertainment: "娛樂" })[topic];
// Providers prefix extracted text with crawl metadata; the card already shows source and date.
// Crawled page script (analytics snippets, viewer setup) is dropped by shape: code is dense in
// braces, brackets, semicolons and "=", which prose (even with parentheses) rarely is.
export const looksLikeCode = (line: string) => {
  const codeCandidate = line.replace(/\[\d+(?:,\s*\d+)*\]/g, "");
  const strong = (codeCandidate.match(/[{}[\];=]/g) ?? []).length;
  return strong >= 2 || (strong >= 1 && /[;{}=]\s*,?$/.test(line)) ||
    /\bfunction\s*\(|=>|new Date\(|createElement|googletagmanager|['"]gtm\.|\b(?:window|document)\.\w|\b(?:gtag|dataLayer)\b/.test(line) ||
    // Page metadata such as JSON-LD: "key": … or key: "value",
    /^\s*"[^"]+"\s*:/.test(line) || /^\s*[\w@.-]+\s*:\s*["'[{].*["'\]}],?\s*$/.test(line);
};
export const readableSummary = (text: string) => text
  .replace(/^[ \t]*(?:published(?: on)?|source|language|author|url|date)\s*:[^\n]*$/gim, "")
  .split("\n").filter((line) => !looksLikeCode(line)).join("\n")
  .trim();
// Some crawls hold nothing beyond the headline and page script; those cards point to the source instead.
export const hasBody = (article: Article) => {
  const words = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return words(readableSummary(article.summary)).replaceAll(words(article.title), "").replace(/\bstory\b/g, "").trim().length >= 15;
};
export const apiQuery = (date: string, topic: Topic, query: string, from?: string) => new URLSearchParams({ date, topic, ...(from && from !== date ? { from } : {}), ...(query.trim() ? { query: query.trim() } : {}) }).toString();
