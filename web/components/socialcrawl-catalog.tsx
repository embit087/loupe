"use client";

import { useMemo, useState } from "react";
import type { CatalogEndpoint } from "@/lib/socialcrawl";
import { creditLabel, formatCredits } from "@/lib/socialcrawl-format";
import { useI18n } from "@/lib/i18n";
import translations from "@/content/socialcrawl-zh.json";

const tiers = ["standard", "advanced", "premium"] as const;

export function SocialcrawlCatalog({ endpoints, platforms, focus }: { endpoints: CatalogEndpoint[]; platforms: string[]; focus: string[] }) {
  const { tr } = useI18n();
  const translated = (key: string, english: string) => tr(english, (translations as Record<string, string>)[key] ?? english);
  const [platform, setPlatform] = useState("all");
  const [tier, setTier] = useState<string>("all");
  const [meteredOnly, setMeteredOnly] = useState(false);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return endpoints.filter((endpoint) =>
      (platform === "all" || endpoint.platform === platform)
      && (tier === "all" || endpoint.tier === tier)
      && (!meteredOnly || endpoint.metered)
      && (!needle || endpoint.path.toLowerCase().includes(needle) || endpoint.summary.toLowerCase().includes(needle)
        || ((translations as Record<string, string>)[`endpoint.${endpoint.id}.summary`] ?? "").toLowerCase().includes(needle)));
  }, [endpoints, platform, tier, meteredOnly, query]);

  const total = rows.reduce((sum, endpoint) => sum + endpoint.cost, 0);

  return <div className="sc-catalog">
    <div className="sc-quick" role="group" aria-label={tr("Platform", "平台")}>
      {["all", ...focus].map((name) => <button key={name} type="button" className={platform === name ? "selected" : ""} aria-pressed={platform === name} onClick={() => setPlatform(name)}>{name === "all" ? tr("All", "全部") : name}</button>)}
      <select value={focus.includes(platform) || platform === "all" ? "" : platform} onChange={(event) => setPlatform(event.target.value || "all")} aria-label={tr("Other platform", "其他平台")}>
        <option value="">{tr("Other platforms…", "其他平台…")}</option>
        {platforms.filter((name) => !focus.includes(name)).map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
    </div>
    <div className="sc-filters">
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("Search path or summary", "搜尋路徑或摘要")} aria-label={tr("Search endpoints", "搜尋端點")} />
      <div className="sc-quick" role="group" aria-label={tr("Tier", "級別")}>
        {["all", ...tiers].map((name) => <button key={name} type="button" className={tier === name ? "selected" : ""} aria-pressed={tier === name} onClick={() => setTier(name)}>{name === "all" ? tr("All", "全部") : name === "standard" ? tr("standard", "標準") : name === "advanced" ? tr("advanced", "進階") : tr("premium", "高級")}</button>)}
      </div>
      <label className="sc-check"><input type="checkbox" checked={meteredOnly} onChange={(event) => setMeteredOnly(event.target.checked)} /> {tr("Metered only", "僅顯示計量端點")}</label>
      <span className="sc-count">{rows.length} {tr("endpoints", "個端點")} · {tr("base cost total", "基本費用合計")} {formatCredits(total)}</span>
    </div>
    <div className="kol-metrics-scroll source-table sc-table"><table><thead><tr><th>{tr("Endpoint", "端點")}</th><th>{tr("What it returns", "回傳內容")}</th><th>{tr("Tier", "級別")}</th><th className="num">{tr("Credits", "點數")}</th></tr></thead><tbody>
      {rows.map((endpoint) => <tr key={endpoint.id}>
        <th><code>{endpoint.method} {endpoint.path}</code></th>
        <td>{translated(`endpoint.${endpoint.id}.summary`, endpoint.summary)}{endpoint.formula && <details><summary>{tr("How it is metered", "計費方式")}</summary><p>{translated(`endpoint.${endpoint.id}.formula`, endpoint.formula)}</p></details>}</td>
        <td><span className={`sc-tier ${endpoint.tier}`}>{endpoint.tier === "standard" ? tr("standard", "標準") : endpoint.tier === "advanced" ? tr("advanced", "進階") : tr("premium", "高級")}</span></td>
        <td className="num">{creditLabel(endpoint)}{endpoint.metered && <small>{tr("metered", "計量")}</small>}</td>
      </tr>)}
    </tbody></table></div>
  </div>;
}
