import Link from "next/link";
import { serverTr } from "@/lib/i18n-server";

export default async function NotFound() {
  const tr = await serverTr();
  return <main className="not-found"><p className="eyebrow">{tr("Collection", "收藏")} / 404</p><h1>{tr("Asset not found", "找不到素材")}</h1><p>{tr("This creator or asset is not in the saved 2026 collection.", "這位創作者或素材不在 2026 年收藏中。")}</p><Link href="/">{tr("Return to all creators", "返回所有創作者")} ↗</Link></main>;
}
