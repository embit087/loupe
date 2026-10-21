import { CollectionPage } from "@/components/collection-page";
import { parseFilter } from "@/lib/atlas";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  const { type } = await searchParams;
  return <CollectionPage filter={parseFilter(type)} />;
}
