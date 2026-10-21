import type { Metadata } from "next";
import { ArchiveShell } from "@/components/archive-shell";
import { NewsReader } from "@/components/news-reader";
import { authors } from "@/lib/atlas";

export const metadata: Metadata = { title: "Reader · Topics", description: "Read one story from the Topics news desk." };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string; from?: string; topic?: string; query?: string }> };

export default async function NewsReaderPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <ArchiveShell authors={authors} selectedAuthor={null} topicsView="news" filter="all" counts={{ all: 0, video: 0, post: 0 }}>
    <NewsReader id={id} initialDate={query.date} initialFrom={query.from} initialTopic={query.topic} initialQuery={query.query} />
  </ArchiveShell>;
}
