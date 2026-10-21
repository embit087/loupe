import type { Metadata } from "next";
import { ArchiveShell } from "@/components/archive-shell";
import { TopicsFeed } from "@/components/topics-feed";
import { authors } from "@/lib/atlas";

export const metadata: Metadata = { title: "Topics · News desk", description: "Dated news and ideas for the Topics collection." };

export default async function TopicsPage({ searchParams }: { searchParams: Promise<{ date?: string; from?: string; topic?: string; query?: string }> }) {
  const params = await searchParams;
  return <ArchiveShell authors={authors} selectedAuthor={null} topicsView="news" filter="all" counts={{ all: 0, video: 0, post: 0 }}>
    <TopicsFeed initialDate={params.date} initialFrom={params.from} initialTopic={params.topic} initialQuery={params.query} />
  </ArchiveShell>;
}
