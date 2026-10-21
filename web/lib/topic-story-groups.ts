import type { Article } from "./topics-news";

type Pair = { pairKey: string; firstId: string; secondId: string };
type Decision = { pairKey: string; decision: "merge" | "keep" };

/** A confirmed overlap is one story, even when Jev found a chain of pairs. */
export function groupConfirmedStories(articles: Article[], pairs: Pair[], decisions: Decision[]) {
  const index = new Map(articles.map((article, position) => [article.id, position]));
  const parent = new Map(articles.map((article) => [article.id, article.id]));
  const find = (id: string): string => {
    const current = parent.get(id)!;
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const pairByKey = new Map(pairs.map((pair) => [pair.pairKey, pair]));
  for (const decision of decisions) {
    if (decision.decision !== "merge") continue;
    const pair = pairByKey.get(decision.pairKey);
    if (!pair || !parent.has(pair.firstId) || !parent.has(pair.secondId)) continue;
    const first = find(pair.firstId), second = find(pair.secondId);
    if (first !== second) parent.set(second, first);
  }
  const sets = new Map<string, Article[]>();
  for (const article of articles) {
    const root = find(article.id);
    sets.set(root, [...(sets.get(root) ?? []), article]);
  }
  const membersById = new Map<string, Article[]>();
  for (const members of sets.values()) {
    members.sort((a, b) => index.get(a.id)! - index.get(b.id)!);
    for (const member of members) membersById.set(member.id, members);
  }
  return membersById;
}
