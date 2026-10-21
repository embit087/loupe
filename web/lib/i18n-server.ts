import { cookies } from "next/headers";

export async function serverTr() {
  const locale = (await cookies()).get("collections-locale")?.value === "zh-Hant" ? "zh-Hant" : "en";
  return (english: string, taiwanese: string) => locale === "zh-Hant" ? taiwanese : english;
}
