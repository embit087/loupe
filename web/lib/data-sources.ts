// Data sourcing is documented separately from Exp Lab: this area records how
// posts were fetched, not what they show. Add a new provider as another entry.
import sourceTranslations from "@/content/data-sources-zh.json";

export type SourceStatus = "in use" | "planned";

export type SourceEndpoint = { method: string; path: string; params: string; returns: string };
export type SourceFile = { path: string; holds: string };

export type DataSource = {
  slug: string;
  name: string;
  provider: string;
  icon: string;
  status: SourceStatus;
  summary: string;
  usedFor: string[];
  endpoints: SourceEndpoint[];
  files: SourceFile[];
  policy: string[];
  steps: string[];
  caveats: string[];
};

export const dataSources: DataSource[] = [
  {
    slug: "instagram-looter",
    name: "Instagram Looter",
    provider: "RapidAPI",
    icon: "R",
    status: "in use",
    summary: "Profile, related-profile and feed responses for every creator except Demo Studio's own posts. Each response is saved as raw JSON with a metadata file beside it.",
    usedFor: [
      "Design collection: the 79 profiles in Demo Studio's related-profiles response, one feed request each on 2026-09-29 between 01:48 and 01:53 UTC. All 79 returned OK.",
      "KOL collection: @demo.trail plus nine accounts picked from its related-profiles response for outdoor clothing, equipment, hiking and gear overlap. All 10 feeds returned HTTP 200.",
      "One continuation: a second feed page for @demo.type (from max_id), which added four 2026 posts.",
    ],
    endpoints: [
      { method: "GET", path: "/profile", params: "username", returns: "Profile, including follower count (edge_followed_by)" },
      { method: "GET", path: "/related-profiles", params: "id", returns: "Instagram's suggested related profiles for one account" },
      { method: "GET", path: "/user-feeds", params: "id, count=100, allow_restricted_media=false", returns: "Recent posts (12 per page in practice), with more_available and next_max_id" },
    ],
    files: [
      { path: "instagram-data/manifest.json", holds: "Design run: endpoint, query, policy, the 79 candidates, per-account status, byte size and rate headers, plus continuations" },
      { path: "instagram-data/related-profiles.json", holds: "Demo Studio's related-profiles response that seeded the Design candidates" },
      { path: "instagram-data/accounts/<id>_<username>/feed.json", holds: "Raw user-feeds response per Design account (feed-page-2.json for a continuation)" },
      { path: "instagram-data/kol/manifest.json", holds: "KOL run: seed, selection rule, and each account's role, feed status and 2026 count" },
      { path: "instagram-data/kol/<username>/{profile,related-profiles,feed}.json", holds: "Raw KOL responses; each has a .meta.json with requested_at, endpoint, query, HTTP status and rate headers" },
    ],
    policy: [
      "One request per account: no retries and no pagination unless a continuation is recorded in the manifest.",
      "Only 2026 posts enter the collection; older items stay in the saved response.",
      "Save the response and its metadata before parsing, so the collection can be rebuilt without calling the API again.",
    ],
    steps: [
      "Request /profile (for follower counts) or go straight to /user-feeds with the account id.",
      "Write the raw body to feed.json (or profile.json) and the request details to the matching .meta.json.",
      "Add the account to the run's manifest with its status, item count, more_available and next_max_id.",
      "Rebuild the index: npm run sync:atlas for Design, python3 scripts/sync-kol.py for KOL. Both scripts stop if counts or files no longer match.",
    ],
    caveats: [
      "The rate headers recorded a plan quota of 150 requests (x-ratelimit-requests-limit); check the remaining count in the latest .meta.json before a new run.",
      "Media URLs in feed responses are signed and expire within days (the oe parameter). Download anything that must last; see Local media.",
      "Related profiles are Instagram's suggestions. They show audience overlap, not visual similarity.",
      "Some posts hide likes and views (like_and_view_counts_disabled); those counts are stored as unknown, not zero.",
    ],
  },
  {
    slug: "profile-page",
    name: "Profile page capture",
    provider: "Instagram web",
    icon: "Z",
    status: "in use",
    summary: "Demo Studio's own posts, captured from his public profile page instead of an API, with the videos saved locally.",
    usedFor: [
      "The 10 local 2026 videos in the Design collection, and the style atlas built from them.",
    ],
    endpoints: [],
    files: [
      { path: "posts.json", holds: "Captured post entries with shortcode and the media URLs found on the page" },
      { path: "<date>_<code>.mp4 / .jpg", holds: "Downloaded media at the archive root, named by post date and shortcode" },
      { path: "style-atlas.html", holds: "The original atlas page; its inline items, candidates and candidateMedia feed content/atlas.json" },
    ],
    policy: [
      "Media is downloaded once and served from the archive, so these posts do not depend on signed URLs.",
    ],
    steps: [
      "Update style-atlas.html in the sibling archive.",
      "Run npm run sync:atlas to rewrite content/atlas.json.",
    ],
    caveats: [
      "No engagement counts were captured for these posts, so likes and comments show as unknown.",
    ],
  },
  {
    slug: "local-media",
    name: "Local media",
    provider: "Archive files",
    icon: "M",
    status: "in use",
    summary: "Design and KOL posters, videos, first frames, and study media are archived in R2; the sibling archive remains a local fallback.",
    usedFor: [
      "Poster thumbnails for every card and asset page.",
      "Full carousel items, photos and videos for Exp Lab studies.",
    ],
    endpoints: [],
    files: [
      { path: "instagram-data/thumbnails/<id>_<username>/<code>.jpg", holds: "Design posters; thumbnails-status.json records 941 requested, 940 served from cache and 1 fetched" },
      { path: "instagram-data/kol/<username>/thumbnails/<code>.jpg", holds: "KOL posters; sync-kol.py stops if one is missing" },
      { path: "output/data/experiment-lab/<asset>/source/", holds: "Media downloaded for an Exp Lab study from the post's saved feed URLs" },
    ],
    policy: [
      "Binary media is stored in R2 and indexed by content/media-cache.json; the app redirects media requests to the media Worker.",
      "The sibling COLLECTIONS_SOURCE_ROOT archive (default ../sample-archive) is used only for assets missing from the R2 manifest.",
    ],
    steps: [
      "For a new study, run python3 scripts/build-lab-studies.py <author>/<asset> while the feed URLs are still valid.",
    ],
    caveats: [
      "The archive stores post covers; full carousel items are available for posts with an Exp Lab study.",
    ],
  },
  {
    slug: "socialcrawl",
    name: "SocialCrawl",
    provider: "SocialCrawl",
    icon: "S",
    status: "in use",
    summary: "One API key for 630 priced endpoints on 67 platforms, billed in credits. It supplied 38 of @demo.trail's KOL posts and the share counts, video lengths and collaborators the Instagram Looter feed lacks. Prices, the credit plan and every call's spend are tracked below so costs are checked against the plan before and after each run.",
    usedFor: [
      "One-request depth test on 2026-09-30: profile/posts/full?handle=demo.trail&limit=50 returned 50 posts for 25 credits in 28 s (five pages walked server-side; has_more stayed true). Instagram Looter had returned 12.",
      "scripts/sync-kol.py merged it by shortcode: 38 posts added (37 videos, 1 carousel, July–September 2026 plus pinned posts) and the 12 already collected refreshed with newer counts.",
      "Fields only SocialCrawl reports: shares (46 of 50 posts; the shares leg covered 92%), video length, pinned flag, collaborators (@demo.collab on one post) and caption language. Saves came back empty.",
    ],
    endpoints: [
      { method: "GET", path: "/v1/instagram/profile/posts/full", params: "handle, limit ≤ 50, cursor", returns: "Up to 50 posts in one call with share counts; 5 credits per page of about 12, 25 at limit=50" },
      { method: "GET", path: "/v1/credits/balance", params: "none", returns: "Current balance and recent deduction count (0 credits)" },
      { method: "GET", path: "/v1/credits/transactions", params: "limit ≤ 100, cursor, request_id", returns: "The provider's own receipt ledger: deductions negative, refunds positive (0 credits)" },
      { method: "GET", path: "/v1/status", params: "none, no key", returns: "Each platform's circuit state: operational, degraded or down (0 credits)" },
      { method: "GET", path: "/v1/utility/plan", params: "query (plain words)", returns: "Suggested calls for a job, to compare with our goal estimate (0 credits)" },
      { method: "GET", path: "/v1/instagram/profile", params: "handle", returns: "Profile with follower count; 1 credit" },
      { method: "GET", path: "/v1/instagram/profile/posts", params: "handle, since, cursor", returns: "One page of posts; 1 credit per page, up to 17 with audio or paid labels" },
      { method: "GET", path: "/v1/instagram/post/comments", params: "url (post link), sort, cursor", returns: "One page of comments with free sentiment, question, purchase-intent and complaint labels; 5 credits" },
    ],
    files: [
      { path: "content/socialcrawl.json (this project)", holds: "Price catalogue: every endpoint's tier, base cost, metered min/max and formula, plus the credit packs" },
      { path: "content/socialcrawl-plan.json (this project)", holds: "Credit budget and the goals every call must name, with the request counts behind each estimate" },
      { path: "socialcrawl-data/docs/<date>/", holds: "The openapi.json, llms.txt and pricing page each catalogue snapshot was built from" },
      { path: "socialcrawl-data/ledger.jsonl", holds: "One line per call: goal, endpoint, query, HTTP status, request_id, cached, credits_used, credits_remaining, estimate" },
      { path: "socialcrawl-data/raw/<goal>/<time>_<request>.json", holds: "Raw response body; the .meta.json beside it has the request, Idempotency-Key, X-Cache and credit headers" },
      { path: "socialcrawl-data/transactions.json", holds: "Provider receipts from /v1/credits/transactions, written by reconcile" },
      { path: "instagram-data/kol/<username>/thumbnails/<code>.jpg", holds: "Posters for posts first found by SocialCrawl, downloaded by sync-kol.py from the response's thumbnail URL" },
    ],
    policy: [
      "The key travels only in the x-api-key header, never in a URL. It is read from SOCIALCRAWL_API_KEY or this project's .env.local, which git ignores.",
      "Only call paths that exist in the catalogue; the script refuses anything else. If the API adds an endpoint, refresh the catalogue first.",
      "Every billed call names a goal from the plan. The script refuses a call whose worst-case price could take the goal past its cap (typical + 20%) or total spend past the budget, and warns at 80% of the budget.",
      "Page lists only with pagination.next_cursor sent back as cursor, and stop when has_more is false. Never build or decode a cursor.",
      "For a refresh, pass since=YYYY-MM-DD (or stop_at_id) on post lists so only pages with new posts are paid for.",
      "Leave caching on: a cache hit costs 0. Send Cache-Control: no-cache only when a live fetch is truly needed, since it is billed.",
      "On 429 or 503 wait for Retry-After and retry with the same Idempotency-Key, so the retry cannot be billed twice. 502 and 503 are refunded.",
      "If a platform keeps returning 502 or 503, check /v1/status instead of retrying; a degraded or down platform does not recover sooner.",
      "On success: false, branch on error.type and follow error.doc_url. Parse responses defensively; fields are only ever added.",
      "Save the raw body and its metadata before parsing, as with Instagram Looter.",
    ],
    steps: [
      "Buy the pack named in the plan (Starter, 2,500 credits, £15; sign-up gives 100 free) and put the key in .env.local as SOCIALCRAWL_API_KEY.",
      "python3 scripts/socialcrawl.py estimate: check each goal's typical, worst-case and cap against the budget.",
      "python3 scripts/socialcrawl.py balance: records the starting balance in the ledger.",
      "Run a goal's calls, e.g. python3 scripts/socialcrawl.py get --goal kol-refresh /v1/instagram/profile handle=demo.trail. Add --pages N to follow the cursor.",
      "Open this page to compare spend with the plan, then python3 scripts/socialcrawl.py reconcile to check the local ledger against the provider's receipts.",
      "Run npm run sync:kol. It merges every saved SocialCrawl post list for the KOL accounts, downloads missing posters, and records on each post which response its counts came from. It makes no API calls.",
      "Refresh prices with python3 scripts/sync-socialcrawl.py; the raw docs are kept per date so a price change can be traced.",
    ],
    caveats: [
      "Prices are the provider's published base cost and metered range. Paid labels, hydration (include=…), and max_pages multiply the cost; the worst-case column covers them.",
      "Free cache hits return credits_remaining: null, so Balance shows the last billed call or balance check, not the current second.",
      "Pack prices are in GBP and were read from the pricing page, which can change without a spec version bump.",
      "Some endpoints hold credits up front and refund the unused part; credits_used in the response is the settled amount.",
    ],
  },
];

export function getDataSource(slug: string): DataSource | undefined {
  return dataSources.find((source) => source.slug === slug);
}

export function localizeDataSource(source: DataSource, locale: "en" | "zh-Hant"): DataSource {
  if (locale === "en") return source;
  const strings = (sourceTranslations as Record<string, Record<string, string>>)[source.slug];
  if (!strings) return source;
  const translate = (value: string) => strings[value] ?? value;
  return {
    ...source,
    summary: translate(source.summary),
    usedFor: source.usedFor.map(translate),
    endpoints: source.endpoints.map((endpoint) => ({ ...endpoint, returns: translate(endpoint.returns) })),
    files: source.files.map((file) => ({ ...file, holds: translate(file.holds) })),
    policy: source.policy.map(translate),
    steps: source.steps.map(translate),
    caveats: source.caveats.map(translate),
  };
}

export function sourceHref(source: DataSource): string {
  return `/sources/${source.slug}`;
}
