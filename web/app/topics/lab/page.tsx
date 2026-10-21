import type { Metadata } from "next";
import { ArchiveShell } from "@/components/archive-shell";
import { TopicsLab } from "@/components/topics-lab";
import { authors } from "@/lib/atlas";

export const metadata: Metadata = { title: "Topics Lab · News desk", description: "Saved news and working notes from Topics." };

export default function TopicsLabPage() {
  return <ArchiveShell authors={authors} selectedAuthor={null} topicsView="lab" filter="all" counts={{ all: 0, video: 0, post: 0 }}>
    <TopicsLab />
  </ArchiveShell>;
}
