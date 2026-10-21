import type { CardPost } from "@/components/post-grid";
import {
  authorHref,
  authors,
  formatDate,
  postHref,
  posterHref,
  videoHref,
  type Post,
} from "@/lib/atlas";

export function card(post: Post): CardPost {
  const author = authors.find((entry) => entry.username === post.author);
  return {
    author: post.author,
    authorName: author?.name || post.author,
    authorHref: authorHref(post.author),
    asset: post.asset,
    href: postHref(post),
    poster: posterHref(post),
    video: post.kind === "video" ? videoHref(post) : "",
    kind: post.kind,
    carouselCount: post.carouselCount,
    date: formatDate(post.date),
    category: post.category ? ({ collage: "Poster collage", identity: "Identity & type", campaign: "Campaign & objects" } as Record<string, string>)[post.category] || post.category : "",
    collection: author?.collection ?? "design",
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    playCount: post.playCount ?? null,
    countsHidden: post.countsHidden ?? false,
    shareCount: post.shareCount ?? null,
  };
}
