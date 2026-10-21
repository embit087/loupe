import type { Metadata } from "next";
import { LikedCollection } from "@/components/liked-collection";
import { authors, getCategoryPosts, parseCategory, parseFilter } from "@/lib/atlas";
import { card } from "@/lib/cards";

export const metadata: Metadata = { title: "Liked posts · 2026 collection" };

export default async function LikedPage({ searchParams }: { searchParams: Promise<{ type?: string | string[]; category?: string | string[] }> }) {
  const { type, category } = await searchParams;
  const selectedCategory = parseCategory(category);
  return <LikedCollection authors={authors} cards={getCategoryPosts(selectedCategory).map(card)} category={selectedCategory} filter={parseFilter(type)} />;
}
