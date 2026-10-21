import type { Metadata } from "next";
import { FavoritesCollection } from "@/components/favorites-collection";
import { authors, getCategoryPosts, parseCategory, parseFilter } from "@/lib/atlas";
import { card } from "@/lib/cards";

export const metadata: Metadata = { title: "Favorites · 2026 collection" };

export default async function FavoritesPage({ searchParams }: { searchParams: Promise<{ type?: string | string[]; category?: string | string[] }> }) {
  const { type, category } = await searchParams;
  const selectedCategory = parseCategory(category);
  return <FavoritesCollection authors={authors} cards={getCategoryPosts(selectedCategory).map(card)}
    category={selectedCategory} filter={parseFilter(type)} />;
}
