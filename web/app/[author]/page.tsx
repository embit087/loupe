import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollectionPage } from "@/components/collection-page";
import { getAuthor, parseFilter } from "@/lib/atlas";

type Props = {
  params: Promise<{ author: string }>;
  searchParams: Promise<{ type?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { author } = await params;
  const profile = getAuthor(author);
  return { title: profile ? `${profile.name} · 2026 collection` : "Creator not found" };
}

export default async function AuthorPage({ params, searchParams }: Props) {
  const [{ author }, { type }] = await Promise.all([params, searchParams]);
  const profile = getAuthor(author);
  if (!profile) notFound();
  return <CollectionPage author={profile} filter={parseFilter(type)} />;
}
