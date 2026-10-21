import type { Metadata } from "next";
import { DislikedCollection } from "@/components/disliked-collection";
import { authors, getCategoryPosts, parseCategory, parseFilter } from "@/lib/atlas";
import { card } from "@/lib/cards";

export const metadata: Metadata = { title: "Disliked posts · 2026 collection" };

export default async function DislikedPage({ searchParams }: { searchParams: Promise<{ type?: string | string[]; category?: string | string[] }> }) {
  const { type, category } = await searchParams;
  const selectedCategory = parseCategory(category);
  return <DislikedCollection authors={authors} cards={getCategoryPosts(selectedCategory).map(card)} category={selectedCategory} filter={parseFilter(type)} />;
}
