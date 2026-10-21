import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArchiveShell } from "@/components/archive-shell";
import { CustomStudyWorkspace } from "@/components/custom-study-workspace";
import { authors } from "@/lib/atlas";
import { getCustomStudy } from "@/lib/custom-lab";
import { labStudyCounts } from "@/lib/experiment-lab";
import { serverTr } from "@/lib/i18n-server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tr = await serverTr();
  const { id } = await params;
  const detail = await getCustomStudy(id);
  return { title: detail ? `${detail.study.title} · ${tr("Exp Lab", "實驗室")}` : tr("Study not found", "找不到研究") };
}

export default async function CustomStudyPage({ params }: Props) {
  const tr = await serverTr();
  const { id } = await params;
  const detail = await getCustomStudy(id);
  if (!detail) notFound();
  const category = detail.study.category;
  if (category === "topics") redirect(`/topics/studies/${id}`);
  const labHome = category === "kol" ? "/exp-lab/kol" : "/exp-lab";
  return <ArchiveShell authors={authors} selectedAuthor={null} category={category} labView filter="all" counts={labStudyCounts(category)}>
    <div className="asset-page lab-page custom-study-page">
      <nav className="breadcrumbs" aria-label={tr("Breadcrumbs", "導覽路徑")}><Link href={labHome}>{category === "kol" ? tr("KOL Exp Lab", "KOL 實驗室") : tr("Design Exp Lab", "設計實驗室")}</Link><span>/</span><span>{detail.study.title}</span></nav>
      <CustomStudyWorkspace initial={detail} />
    </div>
  </ArchiveShell>;
}
