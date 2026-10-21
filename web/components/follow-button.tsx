"use client";

import { useEffect, useState } from "react";
import { emitArchiveChange, emitFollowChange, followChangeEvent, type FollowChange } from "@/lib/profile-events";
import { useI18n } from "@/lib/i18n";

export function FollowButton({ author, initialFollowing, onChange }: {
  author: string;
  initialFollowing?: boolean;
  onChange?: (following: boolean) => void;
}) {
  const { tr } = useI18n();
  const [following, setFollowing] = useState(initialFollowing ?? false);
  const [loading, setLoading] = useState(initialFollowing === undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onFollowChange(event: Event) {
      const detail = (event as CustomEvent<FollowChange>).detail;
      if (detail.author === author) setFollowing(detail.following);
    }
    window.addEventListener(followChangeEvent, onFollowChange);
    return () => window.removeEventListener(followChangeEvent, onFollowChange);
  }, [author]);

  useEffect(() => {
    if (initialFollowing !== undefined) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/follows", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Following unavailable");
        const data = await response.json() as { authors: string[] };
        if (!Array.isArray(data.authors)) throw new Error("Following unavailable");
        setFollowing(data.authors.includes(author));
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Following unavailable");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [author, initialFollowing]);

  async function toggle() {
    if (loading || pending) return;
    const next = !following;
    setPending(true);
    try {
      const response = await fetch("/api/follows", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, following: next }),
      });
      if (!response.ok) throw new Error("Could not save follow");
      setFollowing(next);
      setError("");
      emitFollowChange({ author, following: next });
      if (next) emitArchiveChange({ author, archived: false });
      onChange?.(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save follow");
    } finally {
      setPending(false);
    }
  }

  return <span className="follow-control">
    <button type="button" className={`follow-button${following ? " selected" : ""}`} onClick={toggle} disabled={loading || pending}
      aria-pressed={following} aria-label={`${following ? tr("Unfollow", "取消追蹤") : tr("Follow", "追蹤")} @${author}`}>
      <span aria-hidden="true">{following ? "✓" : "+"}</span>{loading ? tr("Loading", "讀取中") : following ? tr("Following", "追蹤中") : tr("Follow", "追蹤")}
    </button>
    {error && <span className="follow-error" role="status">{error}</span>}
  </span>;
}
