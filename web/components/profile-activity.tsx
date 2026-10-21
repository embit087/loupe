"use client";

import { useEffect, useState } from "react";
import { useLabPosts } from "@/components/lab-posts";
import { followChangeEvent, likeChangeEvent, type FollowChange, type LikeChange } from "@/lib/profile-events";
import { useI18n } from "@/lib/i18n";

export type ProfileActivity = { liked: number; followed: boolean; lab: number };

const postKey = ({ author, asset }: { author: string; asset: string }) => `${author}/${asset}`;
let likedCache: Set<string> | null = null;
let followedCache: Set<string> | null = null;

// This browser's likes and follows plus the shared Exp Lab, per creator.
export function useProfileActivity(): (username: string) => ProfileActivity {
  const { posts: labPosts } = useLabPosts();
  const [liked, setLiked] = useState<Set<string>>(() => likedCache ?? new Set());
  const [followed, setFollowed] = useState<Set<string>>(() => followedCache ?? new Set());

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const [likedResponse, followsResponse] = await Promise.allSettled([
        fetch("/api/liked", { cache: "no-store", signal: controller.signal }).then((response) => response.ok ? response.json() : null),
        fetch("/api/follows", { cache: "no-store", signal: controller.signal }).then((response) => response.ok ? response.json() : null),
      ]);
      if (controller.signal.aborted) return;
      // Pills are a hint; a missing service just leaves them off.
      if (likedResponse.status === "fulfilled" && Array.isArray(likedResponse.value?.posts)) {
        likedCache = new Set((likedResponse.value.posts as { author: string; asset: string }[]).map(postKey));
        setLiked(likedCache);
      }
      if (followsResponse.status === "fulfilled" && Array.isArray(followsResponse.value?.authors)) {
        followedCache = new Set(followsResponse.value.authors as string[]);
        setFollowed(followedCache);
      }
    }
    void load();

    function onLikeChange(event: Event) {
      const detail = (event as CustomEvent<LikeChange>).detail;
      setLiked((current) => {
        const next = new Set(current);
        if (detail.liked) next.add(postKey(detail));
        else next.delete(postKey(detail));
        likedCache = next;
        return next;
      });
    }
    function onFollowChange(event: Event) {
      const detail = (event as CustomEvent<FollowChange>).detail;
      setFollowed((current) => {
        const next = new Set(current);
        if (detail.following) next.add(detail.author);
        else next.delete(detail.author);
        followedCache = next;
        return next;
      });
    }
    window.addEventListener(likeChangeEvent, onLikeChange);
    window.addEventListener(followChangeEvent, onFollowChange);
    return () => {
      controller.abort();
      window.removeEventListener(likeChangeEvent, onLikeChange);
      window.removeEventListener(followChangeEvent, onFollowChange);
    };
  }, []);

  const likedByAuthor = countByAuthor([...liked].map((key) => key.slice(0, key.indexOf("/"))));
  const labByAuthor = countByAuthor(labPosts.map((post) => post.author));
  return (username) => ({
    liked: likedByAuthor.get(username) ?? 0,
    followed: followed.has(username),
    lab: labByAuthor.get(username) ?? 0,
  });
}

function countByAuthor(authors: string[]) {
  const counts = new Map<string, number>();
  for (const author of authors) counts.set(author, (counts.get(author) ?? 0) + 1);
  return counts;
}

export function ProfileActivityPills({ activity, username }: { activity: ProfileActivity; username: string }) {
  const { tr } = useI18n();
  if (!activity.liked && !activity.followed && !activity.lab) return null;
  return (
    <span className="profile-pills">
      {activity.liked > 0 && <span className="profile-pill liked" title={tr(`${activity.liked} liked posts from @${username}`, `喜歡 @${username} 的 ${activity.liked} 則貼文`)}><span aria-hidden="true">♥</span>{activity.liked} {tr("liked", "個喜歡")}</span>}
      {activity.followed && <span className="profile-pill followed" title={tr(`You follow @${username}`, `你已追蹤 @${username}`)}><span aria-hidden="true">✓</span>{tr("Followed", "追蹤中")}</span>}
      {activity.lab > 0 && <span className="profile-pill lab" title={tr(`${activity.lab} posts from @${username} in Exp Lab`, `@${username} 有 ${activity.lab} 則貼文存於實驗室`)}><span aria-hidden="true">◇</span>{activity.lab} {tr("in Lab", "則在實驗室")}</span>}
    </span>
  );
}
