import { SocialcrawlCatalog } from "@/components/socialcrawl-catalog";
import { endpointById, focusPlatforms, loadSpend, platformSummaries, pricedEndpoints, socialcrawlCatalog, socialcrawlPlan, type GoalSpend } from "@/lib/socialcrawl";
import { creditLabel, formatCredits as n } from "@/lib/socialcrawl-format";
import { serverTr } from "@/lib/i18n-server";
import translations from "@/content/socialcrawl-zh.json";

// The five requests a collection run needs on each compared platform.
const roles = ["Profile", "Post list", "One post", "Comments", "Transcript"] as const;
const roleEndpoints: Record<string, (string | null)[]> = {
  instagram: ["/instagram/profile", "/instagram/profile/posts", "/instagram/post", "/instagram/post/comments", "/instagram/media/transcript"],
  twitter: ["/twitter/profile", "/twitter/user/tweets", "/twitter/tweet", "/twitter/tweet/replies", "/twitter/tweet/transcript"],
  youtube: ["/youtube/channel", "/youtube/channel/videos", "/youtube/video", "/youtube/video/comments", "/youtube/video/transcript"],
  tiktok: ["/tiktok/profile", "/tiktok/profile/videos", "/tiktok/post", "/tiktok/post/comments", "/tiktok/post/transcript"],
  reddit: ["/reddit/profile", "/reddit/subreddit", "/reddit/post", "/reddit/post/comments", "/reddit/post/transcript"],
  linkedin: ["/linkedin/profile", "/linkedin/profile/posts", "/linkedin/post", "/linkedin/post/comments", "/linkedin/post/transcript"],
  xiaohongshu: ["/xiaohongshu/profile", "/xiaohongshu/profile/posts", "/xiaohongshu/post", "/xiaohongshu/post/comments", null],
};

const platformLabel: Record<string, string> = { twitter: "X (twitter)", xiaohongshu: "Xiaohongshu", youtube: "YouTube", tiktok: "TikTok", linkedin: "LinkedIn", instagram: "Instagram", reddit: "Reddit" };

const money = (value: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: value < 1 ? 4 : 2 }).format(value);
const pct = (value: number, of: number) => (of ? Math.min(100, (value / of) * 100) : 0);

function goalState(row: GoalSpend, tr: (english: string, taiwanese: string) => string) {
  if (row.spent > row.estimate.cap) return { label: tr("Over cap", "超過上限"), tone: "alert" };
  if (row.calls === 0) return { label: tr("Not started", "尚未開始"), tone: "idle" };
  if (row.calls >= row.estimate.calls) return { label: tr("Calls done", "請求完成"), tone: "done" };
  return { label: tr(`${row.calls} of ${n(row.estimate.calls)} calls`, `已完成 ${row.calls}／${n(row.estimate.calls)} 次請求`), tone: "active" };
}

export async function SocialcrawlMonitor() {
  const tr = await serverTr();
  const translated = (key: string, english: string) => tr(english, (translations as Record<string, string>)[key] ?? english);
  const spend = await loadSpend();
  const budget = socialcrawlPlan.budget;
  const planned = spend.goals.reduce((sum, row) => sum + row.estimate.typical, 0);
  const worst = spend.goals.reduce((sum, row) => sum + row.estimate.worst, 0);
  // Remaining planned work: what each goal still expects to spend at its typical estimate.
  const toGo = spend.goals.reduce((sum, row) => sum + Math.max(0, row.estimate.typical - row.spent), 0);
  const headroom = budget.credits - spend.spent - toGo;
  const warnAt = budget.credits * 0.8;
  const pack = socialcrawlCatalog.packs.find((item) => item.name === budget.pack);
  const platforms = platformSummaries();

  return <>
    <section className="source-section" id="cost-monitor">
      <div className="lab-frames-heading"><div><p className="eyebrow">{tr("Cost monitor", "費用監控")}</p><h2>{tr("Spend against the plan", "費用與預算比較")}</h2></div></div>
      <div className="sc-tiles">
        <div className="sc-tile"><span>{tr("Budget", "預算")}</span><strong>{n(budget.credits)}</strong><small>{budget.pack} {tr("pack", "方案")}{pack ? ` · ${money(pack.price, pack.currency)}` : ""} · {budget.period}</small></div>
        <div className="sc-tile"><span>{tr("Planned", "預計")}</span><strong>{n(planned)}</strong><small>{pct(planned, budget.credits).toFixed(0)}% {tr("of budget", "預算占比")} · {tr("worst case", "最高估計")} {n(worst)}</small></div>
        <div className={`sc-tile${spend.spent > warnAt ? " alert" : ""}`}><span>{tr("Spent", "已花費")}</span><strong>{n(spend.spent)}</strong><small>{spend.calls ? tr(`${n(spend.calls)} calls · last ${spend.lastCallAt?.slice(0, 16).replace("T", " ")} UTC`, `${n(spend.calls)} 次請求 · 最近一次 ${spend.lastCallAt?.slice(0, 16).replace("T", " ")} UTC`) : tr("No calls recorded yet", "尚無請求紀錄")}</small></div>
        <div className="sc-tile"><span>{tr("Balance", "餘額")}</span><strong>{spend.balance === null ? "—" : n(spend.balance)}</strong><small>{spend.balanceAt ? tr(`Reported ${spend.balanceAt.slice(0, 16).replace("T", " ")} UTC`, `回報時間 ${spend.balanceAt.slice(0, 16).replace("T", " ")} UTC`) : tr("Unknown until the first billed call or balance check", "首次付費請求或查詢餘額後才會顯示")}</small></div>
        <div className={`sc-tile${headroom < 0 ? " alert" : ""}`}><span>{tr("Headroom", "剩餘額度")}</span><strong>{n(headroom)}</strong><small>{tr("Budget − spent − planned work still to do", "預算－已花費－尚待執行的預計費用")}</small></div>
      </div>
      <div className="sc-bar" role="img" aria-label={tr(`Spent ${n(spend.spent)}, planned still to do ${n(toGo)}, budget ${n(budget.credits)} credits`, `已花費 ${n(spend.spent)} 點；尚待執行 ${n(toGo)} 點；預算 ${n(budget.credits)} 點`)}>
        <span className="spent" style={{ width: `${pct(spend.spent, budget.credits)}%` }} />
        <span className="planned" style={{ width: `${pct(toGo, budget.credits)}%` }} />
        <i className="sc-bar-mark" style={{ left: "80%" }} title={tr("80% review line", "80% 檢查線")} />
      </div>
      <p className="sc-legend"><span className="spent" /> {tr("Spent", "已花費")} <span className="planned" /> {tr("Planned, not yet spent", "預計但尚未花費")} <span className="mark" /> {tr("80% review line", "80% 檢查線")} · {translated("budget.rule", budget.rule)}</p>
      {!spend.ledgerFound && <p className="sc-note">{tr("No ledger yet at", "尚無紀錄檔：")} <code>{spend.ledgerPath}</code>。{tr("The first scripts/socialcrawl.py call creates it; until then Spent is 0 and Balance is unknown.", "第一次執行 scripts/socialcrawl.py 後會建立；此前已花費為 0，餘額未知。")}</p>}
      {spend.unplanned > 0 && <p className="sc-note alert">{tr(`${n(spend.unplanned)} credits were spent on calls that name no goal in the plan.`, `${n(spend.unplanned)} 點花在未指定計畫目標的請求上。`)}</p>}
      {spend.reconciled && <p className={`sc-note${spend.reconciled.providerSpent !== spend.spent ? " alert" : ""}`}>{tr("Provider ledger", "供應商帳本")} (/v1/credits/transactions, {spend.reconciled.fetchedAt.slice(0, 10)}): {n(spend.reconciled.providerSpent)} {tr("credits net", "點淨額")} · {tr("local ledger", "本機帳本")} {n(spend.spent)}{spend.reconciled.providerSpent !== spend.spent ? tr(" — they differ; check for calls made outside the script", " — 金額不同，請檢查是否有腳本以外的請求") : tr(" — they match", " — 金額相符")}。</p>}
    </section>

    <section className="source-section" id="goals">
      <div className="lab-frames-heading"><div><p className="eyebrow">{tr("Goals", "目標")}</p><h2>{spend.goals.length} {tr("planned jobs", "項預定工作")}</h2></div></div>
      <p className="sc-note">{tr("Typical = base price × calls. Worst = every call at its metered maximum. Cap = typical + 20%; the fetch script refuses a call that could take a goal past its cap. Edit goals in", "一般估計＝基本價格×請求次數；最高估計＝每次請求均按計量上限計算。上限為一般估計加 20%；擷取腳本會拒絕超過目標上限的請求。請在此檔案編輯目標：")} <code>content/socialcrawl-plan.json</code>。</p>
      <div className="kol-metrics-scroll source-table"><table className="sc-goals"><thead><tr><th>{tr("Goal", "目標")}</th><th>{tr("Requests", "請求")}</th><th className="num">{tr("Typical", "一般估計")}</th><th className="num">{tr("Worst", "最高估計")}</th><th className="num">{tr("Cap", "上限")}</th><th className="num">{tr("Spent", "已花費")}</th><th>{tr("Progress", "進度")}</th></tr></thead><tbody>
        {spend.goals.map((row) => {
          const state = goalState(row, tr);
          return <tr key={row.goal.id}>
            <th><strong>{translated(`goal.${row.goal.id}.title`, row.goal.title)}</strong><code>{row.goal.id}</code><p>{translated(`goal.${row.goal.id}.why`, row.goal.why)}</p></th>
            <td><ul>{row.goal.calls.map((call) => { const endpoint = endpointById(call.endpoint); return <li key={call.endpoint}>{n(call.count)} × <code>{call.endpoint.replace("GET ", "")}</code> <span className="sc-muted">@ {endpoint ? creditLabel(endpoint) : "?"}</span></li>; })}</ul></td>
            <td className="num">{n(row.estimate.typical)}</td>
            <td className="num">{n(row.estimate.worst)}</td>
            <td className="num">{n(row.estimate.cap)}</td>
            <td className="num">{n(row.spent)}{row.cachedCalls > 0 && <small>{row.cachedCalls} {tr("cached", "次快取")}</small>}{row.failedCalls > 0 && <small>{row.failedCalls} {tr("failed", "次失敗")}</small>}</td>
            <td><div className="sc-mini"><span style={{ width: `${pct(row.spent, row.estimate.cap)}%` }} className={state.tone} /></div><small className={`sc-state ${state.tone}`}>{state.label}</small></td>
          </tr>;
        })}
      </tbody><tfoot><tr><th>{tr("Total", "合計")}</th><td>{n(spend.goals.reduce((sum, row) => sum + row.estimate.calls, 0))} {tr("calls", "次請求")}</td><td className="num">{n(planned)}</td><td className="num">{n(worst)}</td><td className="num">{n(spend.goals.reduce((sum, row) => sum + row.estimate.cap, 0))}</td><td className="num">{n(spend.spent)}</td><td /></tr></tfoot></table></div>
    </section>

    <section className="source-section" id="packs">
      <div className="lab-frames-heading"><div><p className="eyebrow">{tr("Pricing", "價格")}</p><h2>{tr("Credit packs", "點數方案")}</h2></div></div>
      <p className="sc-note">{tr("One-time packs; credits never expire and there is no subscription. Cache hits cost 0 and 502/503 failures are refunded. Captured from the pricing page on", "一次性購買，點數不會過期，也沒有訂閱費。快取命中不計費，502／503 失敗會退款。價格資料擷取於")} {socialcrawlCatalog.fetchedAt.slice(0, 10)}。</p>
      <div className="kol-metrics-scroll source-table"><table><thead><tr><th>{tr("Pack", "方案")}</th><th className="num">{tr("Credits", "點數")}</th><th className="num">{tr("Price", "價格")}</th><th className="num">{tr("Per credit", "每點價格")}</th><th className="num">{tr("Plan at this rate", "依此價格估算")}</th><th>{tr("Covers the plan", "是否足夠")}</th></tr></thead><tbody>
        {socialcrawlCatalog.packs.map((item) => <tr key={item.name} className={item.name === budget.pack ? "sc-current" : undefined}>
          <th>{item.name}{item.name === budget.pack && <small> {tr("current budget", "目前預算")}</small>}<p className="sc-muted">{translated(`pack.${item.name}.note`, item.note)}</p></th>
          <td className="num">{n(item.credits)}</td>
          <td className="num">{money(item.price, item.currency)}</td>
          <td className="num">{item.price ? money(item.perCredit, item.currency) : "—"}</td>
          <td className="num">{item.price ? money(planned * item.perCredit, item.currency) : "—"}</td>
          <td>{item.credits >= planned ? tr(`Yes, ${n(item.credits - planned)} left`, `足夠，剩餘 ${n(item.credits - planned)} 點`) : tr(`No, ${n(planned - item.credits)} short`, `不足，還差 ${n(planned - item.credits)} 點`)}</td>
        </tr>)}
      </tbody></table></div>
    </section>

    <section className="source-section" id="compare">
      <div className="lab-frames-heading"><div><p className="eyebrow">{tr("Compare", "比較")}</p><h2>{tr("Cost of a collection run by platform", "各平台收藏請求費用")}</h2></div></div>
      <p className="sc-note">{tr("Credits per request (per page for lists). Ranges are metered: the low end is a plain call, the high end adds optional hydration or paid labels.", "每次請求所需點數（清單以每頁計）。區間價格依使用量計算：低值為一般請求，高值包含選用的補充資料或付費標籤。")}</p>
      <div className="kol-metrics-scroll source-table"><table><thead><tr><th>{tr("Platform", "平台")}</th><th className="num">{tr("Endpoints", "端點")}</th>{roles.map((role) => <th key={role} className="num">{({ Profile: tr("Profile", "個人檔案"), "Post list": tr("Post list", "貼文清單"), "One post": tr("One post", "單篇貼文"), Comments: tr("Comments", "留言"), Transcript: tr("Transcript", "逐字稿") } as Record<string, string>)[role]}</th>)}</tr></thead><tbody>
        {focusPlatforms.map((platform) => {
          const summary = platforms.find((row) => row.platform === platform);
          return <tr key={platform}>
            <th>{platformLabel[platform] ?? platform}</th>
            <td className="num">{summary?.endpoints ?? 0}</td>
            {roleEndpoints[platform].map((path, index) => { const endpoint = path ? endpointById(`GET ${path}`) : undefined; return <td key={roles[index]} className="num" title={endpoint ? `${endpoint.method} ${endpoint.path}` : undefined}>{endpoint ? creditLabel(endpoint) : "—"}</td>; })}
          </tr>;
        })}
      </tbody></table></div>
      <details className="sc-all-platforms">
        <summary>{tr(`All ${platforms.length} platforms by tier`, `依級別檢視全部 ${platforms.length} 個平台`)}</summary>
        <div className="kol-metrics-scroll source-table"><table><thead><tr><th>{tr("Platform", "平台")}</th><th className="num">{tr("Endpoints", "端點")}</th><th className="num">{tr("Standard (1)", "標準（1）")}</th><th className="num">{tr("Advanced (5)", "進階（5）")}</th><th className="num">{tr("Premium (10)", "高級（10）")}</th><th className="num">{tr("Metered", "計量")}</th><th className="num">{tr("Range", "區間")}</th></tr></thead><tbody>
          {platforms.map((row) => <tr key={row.platform}><th>{row.platform}</th><td className="num">{row.endpoints}</td><td className="num">{row.standard}</td><td className="num">{row.advanced}</td><td className="num">{row.premium}</td><td className="num">{row.metered}</td><td className="num">{row.min === row.max ? row.min : `${row.min}–${n(row.max)}`}</td></tr>)}
        </tbody></table></div>
      </details>
    </section>

    <section className="source-section" id="catalogue">
      <div className="lab-frames-heading"><div><p className="eyebrow">{tr("Catalogue", "端點目錄")}</p><h2>{pricedEndpoints.length} {tr("priced endpoints", "個付費端點")}</h2></div></div>
      <p className="sc-note">{tr("From the OpenAPI spec", "資料取自 OpenAPI 規格")}（{tr("docs updated", "文件更新")} {socialcrawlCatalog.docsUpdated}，{tr("snapshot", "快照")} {socialcrawlCatalog.fetchedAt.slice(0, 10)}）：{Object.entries(socialcrawlCatalog.tiers).map(([tier, count]) => `${count} ${tier}`).join(", ")}。{tr("Account endpoints (balance, transactions, cohorts, monitors) cost 0 and are left out. Refresh with", "帳戶端點（餘額、交易、群組、監控）免費，因此未列入。更新目錄請執行")} <code>python3 scripts/sync-socialcrawl.py</code>。</p>
      <SocialcrawlCatalog endpoints={pricedEndpoints} platforms={platforms.map((row) => row.platform).sort()} focus={focusPlatforms} />
    </section>
  </>;
}
