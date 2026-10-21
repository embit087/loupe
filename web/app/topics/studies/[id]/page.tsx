import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveShell } from "@/components/archive-shell";
import { CustomStudyWorkspace } from "@/components/custom-study-workspace";
import { authors } from "@/lib/atlas";
import { getCustomStudy } from "@/lib/custom-lab";
import { serverTr } from "@/lib/i18n-server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tr = await serverTr();
  const { id } = await params;
  const detail = await getCustomStudy(id);
  return { title: detail?.study.category === "topics" ? `${detail.study.title} · ${tr("Topics Lab", "新聞實驗室")}` : tr("Study not found", "找不到研究") };
}

export default async function TopicsStudyPage({ params }: Props) {
  const tr = await serverTr();
  const { id } = await params;
  const detail = await getCustomStudy(id);
  if (!detail || detail.study.category !== "topics") notFound();
  return <ArchiveShell authors={authors} selectedAuthor={null} topicsView="lab" filter="all" counts={{ all: 0, video: 0, post: 0 }}>
    <div className="asset-page lab-page custom-study-page">
      <nav className="breadcrumbs" aria-label={tr("Breadcrumbs", "導覽路徑")}><Link href="/topics/lab">{tr("Topics Lab", "新聞實驗室")}</Link><span>/</span><span>{detail.study.title}</span></nav>
      <CustomStudyWorkspace initial={detail} />
    </div>
  </ArchiveShell>;
}
