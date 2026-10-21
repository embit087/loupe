import type { Metadata } from "next";
import { FollowedCollection } from "@/components/followed-collection";
import { card } from "@/lib/cards";
import { authors, getCategoryPosts, parseCategory, parseFilter } from "@/lib/atlas";

export const metadata: Metadata = { title: "Followed · 2026 collection" };

export default async function FollowedPage({ searchParams }: { searchParams: Promise<{ type?: string | string[]; category?: string | string[] }> }) {
  const { type, category } = await searchParams;
  const selectedCategory = parseCategory(category);
  return <FollowedCollection authors={authors} cards={getCategoryPosts(selectedCategory).map(card)} category={selectedCategory} filter={parseFilter(type)} />;
}
