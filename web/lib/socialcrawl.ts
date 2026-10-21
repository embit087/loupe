// SocialCrawl prices, credit plan and spend. The price catalogue is a snapshot
// of the public OpenAPI spec (scripts/sync-socialcrawl.py); spend is the ledger
// scripts/socialcrawl.py appends to in the archive for every call it makes.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";
import catalog from "@/content/socialcrawl.json";
import plan from "@/content/socialcrawl-plan.json";

export type Tier = "standard" | "advanced" | "premium" | "account";

export type CatalogEndpoint = {
  id: string;
  method: string;
  path: string;
  platform: string;
  summary: string;
  tier: Tier;
  cost: number;
  min: number;
  max: number;
  metered: boolean;
  formula: string;
};

export type Pack = { name: string; price: number; currency: string; credits: number; note: string; perCredit: number };

export type PlanCall = { endpoint: string; count: number; note?: string };
export type PlanGoal = { id: string; title: string; why: string; status: string; cap?: number; calls: PlanCall[] };

type LedgerRow = {
  kind: "call" | "balance";
  at: string;
  goal?: string;
  endpoint?: string;
  catalog_id?: string;
  http_status?: number;
  cached?: boolean | null;
  credits_used?: number | null;
  credits_remaining?: number | null;
  estimate_cost?: number;
};

export const socialcrawlCatalog = catalog as {
  fetchedAt: string;
  docsUpdated: string | null;
  docsFolder: string;
  specVersion: string;
  packs: Pack[];
  tiers: Record<string, number>;
  endpoints: CatalogEndpoint[];
};

export const socialcrawlPlan = plan as { note: string; budget: { credits: number; pack: string; period: string; rule: string }; goals: PlanGoal[] };

export const pricedEndpoints = socialcrawlCatalog.endpoints.filter((endpoint) => endpoint.tier !== "account");

// Platforms compared side by side on the page, in this order.
export const focusPlatforms = ["instagram", "twitter", "youtube", "tiktok", "reddit", "linkedin", "xiaohongshu"];

const byId = new Map(socialcrawlCatalog.endpoints.map((endpoint) => [endpoint.id, endpoint]));

export function endpointById(id: string): CatalogEndpoint | undefined {
  return byId.get(id);
}

export type GoalEstimate = { typical: number; worst: number; cap: number; calls: number };

export function estimateGoal(goal: PlanGoal): GoalEstimate {
  let typical = 0;
  let worst = 0;
  let calls = 0;
  for (const call of goal.calls) {
    const endpoint = byId.get(call.endpoint);
    if (!endpoint) throw new Error(`Plan goal ${goal.id} names ${call.endpoint}, which is not in the catalogue`);
    typical += call.count * endpoint.cost;
    worst += call.count * endpoint.max;
    calls += call.count;
  }
  // Same rule as scripts/socialcrawl.py: 20% headroom over the typical estimate unless the plan sets a cap.
  return { typical, worst, cap: goal.cap ?? Math.ceil(typical * 1.2), calls };
}

export type PlatformSummary = { platform: string; endpoints: number; standard: number; advanced: number; premium: number; metered: number; min: number; max: number };

export function platformSummaries(): PlatformSummary[] {
  const map = new Map<string, PlatformSummary>();
  for (const endpoint of pricedEndpoints) {
    const row = map.get(endpoint.platform) ?? { platform: endpoint.platform, endpoints: 0, standard: 0, advanced: 0, premium: 0, metered: 0, min: Infinity, max: 0 };
    row.endpoints += 1;
    if (endpoint.tier === "standard" || endpoint.tier === "advanced" || endpoint.tier === "premium") row[endpoint.tier] += 1;
    if (endpoint.metered) row.metered += 1;
    row.min = Math.min(row.min, endpoint.min);
    row.max = Math.max(row.max, endpoint.max);
    map.set(endpoint.platform, row);
  }
  return [...map.values()].sort((a, b) => b.endpoints - a.endpoints || a.platform.localeCompare(b.platform));
}

export type GoalSpend = { goal: PlanGoal; estimate: GoalEstimate; spent: number; calls: number; cachedCalls: number; failedCalls: number };

export type Spend = {
  ledgerFound: boolean;
  ledgerPath: string;
  calls: number;
  spent: number;
  balance: number | null;
  balanceAt: string | null;
  lastCallAt: string | null;
  unplanned: number;
  goals: GoalSpend[];
  reconciled: { fetchedAt: string; providerSpent: number } | null;
};

const archiveRoot = () => path.resolve(/*turbopackIgnore: true*/ process.env.COLLECTIONS_SOURCE_ROOT || path.join(process.cwd(), "..", "sample-archive"));

async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

// Read at request time: the ledger changes whenever the fetch script runs.
export async function loadSpend(): Promise<Spend> {
  await connection();
  const root = archiveRoot();
  const ledgerPath = path.join(root, "socialcrawl-data", "ledger.jsonl");
  const text = await readText(ledgerPath);
  const rows: LedgerRow[] = (text ?? "").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
  const calls = rows.filter((row) => row.kind === "call");
  const used = (row: LedgerRow) => row.credits_used ?? 0;

  let balance: number | null = null;
  let balanceAt: string | null = null;
  for (const row of rows) {
    if (typeof row.credits_remaining === "number" && (!balanceAt || row.at >= balanceAt)) {
      balance = row.credits_remaining;
      balanceAt = row.at;
    }
  }

  const goalIds = new Set(socialcrawlPlan.goals.map((goal) => goal.id));
  const goals = socialcrawlPlan.goals.map((goal) => {
    const mine = calls.filter((row) => row.goal === goal.id);
    return {
      goal,
      estimate: estimateGoal(goal),
      spent: mine.reduce((sum, row) => sum + used(row), 0),
      calls: mine.length,
      cachedCalls: mine.filter((row) => row.cached).length,
      failedCalls: mine.filter((row) => (row.http_status ?? 0) >= 400).length,
    };
  });

  const transactions = await readText(path.join(root, "socialcrawl-data", "transactions.json"));
  let reconciled: Spend["reconciled"] = null;
  if (transactions) {
    const parsed = JSON.parse(transactions) as { fetched_at: string; items: { amount: number }[] };
    reconciled = { fetchedAt: parsed.fetched_at, providerSpent: -parsed.items.reduce((sum, item) => sum + item.amount, 0) };
  }

  return {
    ledgerFound: text !== null,
    ledgerPath: "socialcrawl-data/ledger.jsonl",
    calls: calls.length,
    spent: calls.reduce((sum, row) => sum + used(row), 0),
    balance,
    balanceAt,
    lastCallAt: calls.at(-1)?.at ?? null,
    unplanned: calls.filter((row) => !row.goal || !goalIds.has(row.goal)).reduce((sum, row) => sum + used(row), 0),
    goals,
    reconciled,
  };
}
