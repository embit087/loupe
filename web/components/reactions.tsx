"use client";

import { useEffect, useRef, useState } from "react";
import { emitLikeChange } from "@/lib/profile-events";
import { useI18n } from "@/lib/i18n";

export type ReactionPost = { author: string; asset: string };
export type Annotation = ReactionPost & { likes: number; dislikes: number; myReaction: -1 | 0 | 1 };

function key(post: ReactionPost) { return `${post.author}/${post.asset}`; }

export function useAnnotations(posts: ReactionPost[], onVoteSaved?: (annotation: Annotation) => void) {
  const selection = JSON.stringify(posts.map(({ author, asset }) => ({ author, asset })));
  const [annotations, setAnnotations] = useState<Record<string, Annotation>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const loaded = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const missing = (JSON.parse(selection) as ReactionPost[]).filter((post) => !loaded.current.has(key(post)));
      if (missing.length === 0) return;
      try {
        const response = await fetch("/api/annotations", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ posts: missing }), signal: controller.signal,
        });
        if (!response.ok) throw new Error("Annotations unavailable");
        const data = await response.json() as { annotations: Annotation[] };
        for (const item of data.annotations) loaded.current.add(key(item));
        setAnnotations((current) => ({ ...current, ...Object.fromEntries(data.annotations.map((item) => [key(item), item])) }));
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Annotations unavailable");
      }
    }
    if (selection !== "[]") void load();
    return () => controller.abort();
  }, [selection]);

  async function vote(post: ReactionPost, reaction: -1 | 1) {
    const id = key(post);
    if (pending[id]) return;
    setPending((current) => ({ ...current, [id]: true }));
    try {
      const next = annotations[id]?.myReaction === reaction ? 0 : reaction;
      const response = await fetch("/api/annotations", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...post, reaction: next }),
      });
      if (!response.ok) throw new Error("Could not save reaction");
      const data = await response.json() as { annotation: Annotation };
      setAnnotations((current) => ({ ...current, [id]: data.annotation }));
      emitLikeChange({ ...post, liked: data.annotation.myReaction === 1 });
      onVoteSaved?.(data.annotation);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save reaction");
    } finally {
      setPending((current) => ({ ...current, [id]: false }));
    }
  }

  return { annotations, pending, error, vote };
}

export function ReactionButtons({ post, annotation, pending, onVote, large = false }: {
  post: ReactionPost;
  annotation?: Annotation;
  pending?: boolean;
  onVote: (post: ReactionPost, reaction: -1 | 1) => void;
  large?: boolean;
}) {
  const { tr } = useI18n();
  return (
    <div className={`reactions${large ? " reactions-large" : ""}`} aria-label={tr("Your annotation", "你的標註")}>
      <button type="button" className={annotation?.myReaction === 1 ? "selected" : ""} disabled={pending || !annotation}
        onClick={() => onVote(post, 1)} aria-label={`${annotation?.myReaction === 1 ? tr("Remove like", "取消喜歡") : tr("Like", "喜歡")} ${post.asset}`} aria-pressed={annotation?.myReaction === 1} data-tooltip={annotation?.myReaction === 1 ? tr("Remove like", "取消喜歡") : tr("Like", "喜歡")}>
        <span aria-hidden="true">♥</span><span>{annotation?.likes ?? "·"}</span>
      </button>
      <button type="button" className={annotation?.myReaction === -1 ? "selected" : ""} disabled={pending || !annotation}
        onClick={() => onVote(post, -1)} aria-label={`${annotation?.myReaction === -1 ? tr("Remove dislike", "取消略過") : tr("Dislike", "略過")} ${post.asset}`} aria-pressed={annotation?.myReaction === -1} data-tooltip={annotation?.myReaction === -1 ? tr("Remove dislike", "取消略過") : tr("Dislike", "略過")}>
        <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 15h6l-.9 4.3A2 2 0 0 0 10 22h1a2 2 0 0 0 1.5-.7L17 15V4a2 2 0 0 0-2-2H6a2 2 0 0 0-1.9 1.4L2 11.5A2.5 2.5 0 0 0 3 15Z"/><path d="M19 2h3v13h-3z"/></svg></span><span>{annotation?.dislikes ?? "·"}</span>
      </button>
    </div>
  );
}

export function AssetReactions({ author, asset }: ReactionPost) {
  const { tr } = useI18n();
  const { annotations, pending, error, vote } = useAnnotations([{ author, asset }]);
  return <div className="detail-section"><span className="detail-label">{tr("Your annotation", "你的標註")}</span>
    <ReactionButtons post={{ author, asset }} annotation={annotations[`${author}/${asset}`]} pending={pending[`${author}/${asset}`]} onVote={vote} large />
    {error && <p className="annotation-error" role="status">{error}</p>}
  </div>;
}
