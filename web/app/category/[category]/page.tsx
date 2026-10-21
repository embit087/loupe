import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollectionPage } from "@/components/collection-page";
import { parseFilter, type CollectionCategory } from "@/lib/atlas";

type Props = {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ type?: string | string[] }>;
};

function validCategory(value: string): value is CollectionCategory {
  return value === "design" || value === "kol";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  return { title: validCategory(category) ? `${category === "kol" ? "KOL" : "Design"} creators · 2026 collection` : "Category not found" };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ category }, { type }] = await Promise.all([params, searchParams]);
  if (!validCategory(category)) notFound();
  return <CollectionPage category={category} filter={parseFilter(type)} />;
}
