import archive from "@/content/atlas.json";
import kolArchive from "@/content/kol.json";

export type MediaKind = "video" | "photo" | "carousel";
export type MediaFilter = "all" | "video" | "post";
export type CollectionCategory = "design" | "kol";

export type Author = {
  username: string;
  name: string;
  count: number;
  videoCount: number;
  postCount: number;
  collection: CollectionCategory;
  followers?: number;
  popularity?: Popularity;
};

export type Popularity = {
  likes: number;
  likesKnown: number;
  comments: number;
  commentsKnown: number;
  plays: number;
  playsKnown: number;
  shares: number;
  sharesKnown: number;
  hiddenPosts: number;
};

export type Post = {
  author: string;
  asset: string;
  code: string;
  kind: MediaKind;
  date: string;
  caption: string;
  category: string;
  posterPath: string;
  videoPath: string;
  videoUrl: string;
  imageUrl: string;
  permalink: string;
  likeCount: number | null;
  commentCount: number | null;
  playCount?: number | null;
  countsHidden?: boolean;
  carouselCount: number;
  // Fields below exist only on KOL posts. SocialCrawl adds shares, length, pinned, collaborators and language.
  shareCount?: number | null;
  durationSeconds?: number | null;
  pinned?: boolean;
  coauthors?: string[];
  language?: string;
  source?: string;
  countsSource?: string;
  countsAt?: string;
};

// Which saved responses the KOL counts come from, e.g. Instagram Looter 2026-09-29 and SocialCrawl 2026-09-30.
export const kolCaptures = kolArchive.captures as { source: string; date: string }[];

export const posts = [...archive.posts, ...kolArchive.posts] as Post[];
posts.sort((a, b) => (b.date.localeCompare(a.date) || a.author.localeCompare(b.author) || a.asset.localeCompare(b.asset)));
const mediaCounts = new Map<string, { video: number; post: number }>();
const popularity = new Map<string, Popularity>();
for (const post of posts) {
  const counts = mediaCounts.get(post.author) ?? { video: 0, post: 0 };
  counts[post.kind === "video" ? "video" : "post"] += 1;
  mediaCounts.set(post.author, counts);
  const metrics = popularity.get(post.author) ?? { likes: 0, likesKnown: 0, comments: 0, commentsKnown: 0, plays: 0, playsKnown: 0, shares: 0, sharesKnown: 0, hiddenPosts: 0 };
  if (post.likeCount !== null) { metrics.likes += post.likeCount; metrics.likesKnown++; }
  if (post.commentCount !== null) { metrics.comments += post.commentCount; metrics.commentsKnown++; }
  if (post.playCount != null) { metrics.plays += post.playCount; metrics.playsKnown++; }
  if (post.shareCount != null) { metrics.shares += post.shareCount; metrics.sharesKnown++; }
  if (post.countsHidden) metrics.hiddenPosts++;
  popularity.set(post.author, metrics);
}
const sourceAuthors = [
  ...(archive.authors as Omit<Author, "videoCount" | "postCount" | "collection">[]).map((author) => ({ ...author, collection: "design" as const })),
  ...(kolArchive.authors as Omit<Author, "videoCount" | "postCount" | "collection">[]).map((author) => ({ ...author, collection: "kol" as const })),
];
export const authors: Author[] = sourceAuthors.map((author) => ({
  ...author,
  videoCount: mediaCounts.get(author.username)?.video ?? 0,
  postCount: mediaCounts.get(author.username)?.post ?? 0,
  popularity: author.collection === "kol" ? popularity.get(author.username) : undefined,
}));

const authorIndex = new Map(authors.map((author) => [author.username, author]));
const postIndex = new Map(posts.map((post) => [`${post.author}/${post.asset}`, post]));

export function getAuthor(username: string): Author | undefined {
  return authorIndex.get(username);
}

export function getPost(author: string, asset: string): Post | undefined {
  return postIndex.get(`${author}/${asset}`);
}

export function getAuthorPosts(username: string): Post[] {
  return posts.filter((post) => post.author === username);
}

export function getCategoryAuthors(category: CollectionCategory): Author[] {
  return authors.filter((author) => author.collection === category);
}

export function getCategoryPosts(category: CollectionCategory): Post[] {
  const handles = new Set(getCategoryAuthors(category).map((author) => author.username));
  return posts.filter((post) => handles.has(post.author));
}

export function categoryHref(category: CollectionCategory): string {
  return `/category/${category}`;
}

export function parseCategory(value?: string | string[]): CollectionCategory {
  return (Array.isArray(value) ? value[0] : value) === "kol" ? "kol" : "design";
}

export function parseFilter(value?: string | string[]): MediaFilter {
  const selected = Array.isArray(value) ? value[0] : value;
  return selected === "video" || selected === "post" ? selected : "all";
}

export function withMediaFilter(href: string, filter: MediaFilter): string {
  return filter === "all" ? href : `${href}${href.includes("?") ? "&" : "?"}type=${filter}`;
}

export function filterPosts(items: Post[], filter: MediaFilter): Post[] {
  if (filter === "video") return items.filter((post) => post.kind === "video");
  if (filter === "post") return items.filter((post) => post.kind !== "video");
  return items;
}

export function authorHref(username: string): string {
  return `/${encodeURIComponent(username)}`;
}

export function postHref(post: Post): string {
  return `${authorHref(post.author)}/${encodeURIComponent(post.asset)}`;
}

export function posterHref(post: Post): string {
  return `/media/${encodeURIComponent(post.author)}/${encodeURIComponent(post.asset)}/poster`;
}

export function videoHref(post: Post): string {
  return `/media/${encodeURIComponent(post.author)}/${encodeURIComponent(post.asset)}/video`;
}

export function formatDate(date: string): string {
  return `${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6, 8)}`;
}

export function formatCount(count: number | null): string {
  return count === null ? "" : new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(count);
}
