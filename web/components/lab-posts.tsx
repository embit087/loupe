"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { isLabCategory, type LabCategory } from "@/lib/lab-categories";
import type { CollectionCategory } from "@/lib/atlas";
import { useI18n } from "@/lib/i18n";

export type LabPostKey = { author: string; asset: string };
export type LabPost = LabPostKey & { categories: LabCategory[] };
type LabContext = {
  posts: LabPost[];
  ready: boolean;
  error: string;
  pending: Record<string, boolean>;
  setSelected: (post: LabPostKey, selected: boolean) => Promise<void>;
  setCategory: (post: LabPostKey, category: LabCategory, enabled: boolean) => Promise<void>;
};

const Context = createContext<LabContext | null>(null);
const key = ({ author, asset }: LabPostKey) => `${author}/${asset}`;
const refreshEveryMs = 5000;

export function LabPostsProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<LabPost[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const syncRevision = useRef(0);
  const activeMutations = useRef(0);
  const broadcast = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    let mounted = true;
    let loading = false;
    const controllers = new Set<AbortController>();
    async function refresh() {
      if (loading || activeMutations.current > 0) return;
      loading = true;
      const revision = syncRevision.current;
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const response = await fetch("/api/lab-posts", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Exp Lab unavailable");
        const data = await response.json() as { posts: LabPost[] };
        if (!Array.isArray(data.posts)) throw new Error("Exp Lab unavailable");
        if (!mounted || revision !== syncRevision.current) return;
        setPosts(data.posts.map((post) => ({ ...post,
          categories: Array.isArray(post.categories) ? post.categories.filter(isLabCategory) : [],
        })));
        setReady(true);
        setError("");
      } catch (cause) {
        if (mounted && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Exp Lab unavailable");
      } finally {
        controllers.delete(controller);
        loading = false;
      }
    }
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(onVisible, refreshEveryMs);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("collections-exp-lab");
      channel.onmessage = () => void refresh();
      broadcast.current = channel;
    }
    return () => {
      mounted = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      for (const controller of controllers) controller.abort();
      broadcast.current?.close();
      broadcast.current = null;
    };
  }, []);

  async function setSelected(post: LabPostKey, selected: boolean) {
    const id = key(post);
    if (!ready || pending[id]) return;
    activeMutations.current += 1;
    syncRevision.current += 1;
    setPending((current) => ({ ...current, [id]: true }));
    try {
      const response = await fetch("/api/lab-posts", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...post, selected }),
      });
      if (!response.ok) throw new Error("Could not update Exp Lab");
      const result = await response.json() as { categories: LabCategory[] };
      const categories = Array.isArray(result.categories) ? result.categories.filter(isLabCategory) : [];
      setPosts((current) => selected
        ? current.some((item) => key(item) === id)
          ? current.map((item) => key(item) === id ? { ...item, categories } : item)
          : [{ ...post, categories }, ...current]
        : current.filter((item) => key(item) !== id));
      setError("");
      broadcast.current?.postMessage("changed");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not update Exp Lab";
      setError(message);
      throw new Error(message);
    } finally {
      activeMutations.current -= 1;
      syncRevision.current += 1;
      setPending((current) => ({ ...current, [id]: false }));
    }
  }

  async function setCategory(post: LabPostKey, category: LabCategory, enabled: boolean) {
    const id = key(post);
    if (!ready || pending[id] || !posts.some((item) => key(item) === id)) return;
    activeMutations.current += 1;
    syncRevision.current += 1;
    setPending((current) => ({ ...current, [id]: true }));
    try {
      const response = await fetch("/api/lab-posts", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...post, category, enabled }),
      });
      if (!response.ok) throw new Error("Could not update Lab category");
      const result = await response.json() as { categories: LabCategory[] };
      if (!Array.isArray(result.categories)) throw new Error("Could not read Lab category state");
      setPosts((current) => current.map((item) => key(item) === id ? {
        ...item, categories: result.categories.filter(isLabCategory),
      } : item));
      setError("");
      broadcast.current?.postMessage("changed");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not update Lab category";
      setError(message);
      throw new Error(message);
    } finally {
      activeMutations.current -= 1;
      syncRevision.current += 1;
      setPending((current) => ({ ...current, [id]: false }));
    }
  }

  return <Context.Provider value={{ posts, ready, error, pending, setSelected, setCategory }}>{children}</Context.Provider>;
}

export function useLabPosts() {
  const context = useContext(Context);
  if (!context) throw new Error("LabPostsProvider is missing");
  return context;
}

export function LabToggle({ author, asset, collection = "design", large = false, favorite = false }: LabPostKey & { collection?: CollectionCategory; large?: boolean; favorite?: boolean }) {
  const { tr } = useI18n();
  const { posts, ready, error, pending, setSelected } = useLabPosts();
  const [actionError, setActionError] = useState("");
  const id = key({ author, asset });
  const selected = posts.some((post) => key(post) === id);
  const labName = collection === "kol" ? "KOL Exp Lab" : "Design Exp Lab";

  async function toggle() {
    setActionError("");
    try { await setSelected({ author, asset }, !selected); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "Could not update Exp Lab"); }
  }

  return <span data-lab-feature={favorite ? undefined : ""} className={`lab-control${large ? " lab-control-large" : ""}`}>
    <button type="button" className={`lab-toggle${selected ? " selected" : ""}`} onClick={() => void toggle()}
      disabled={!ready || Boolean(pending[id])} aria-pressed={selected}
      aria-label={favorite
        ? selected ? tr(`Remove ${asset} from Favorites`, `將 ${asset} 從收藏夾移除`) : tr(`Save ${asset} to Favorites`, `將 ${asset} 加入收藏夾`)
        : selected ? tr(`Remove ${asset} from ${labName}`, `將 ${asset} 從${collection === "kol" ? "KOL" : "設計"}實驗室移除`) : tr(`Add ${asset} to ${labName}`, `將 ${asset} 加入${collection === "kol" ? "KOL" : "設計"}實驗室`)}
      data-tooltip={!ready && error ? error : favorite ? selected ? tr("Remove from Favorites", "從收藏夾移除") : tr("Save to Favorites", "加入收藏夾") : selected ? tr(`Remove from ${labName}`, "從實驗室移除") : tr(`Add to ${labName}`, "加入實驗室")}>
      <span aria-hidden="true">{selected ? "✓" : "+"}</span>{favorite ? selected ? tr("Saved", "已收藏") : tr("Save", "收藏") : selected ? tr("In Lab", "已加入") : tr("Add to Lab", "加入實驗室")}
    </button>
    {actionError && <span className="lab-action-error" role="status">{actionError}</span>}
  </span>;
}
