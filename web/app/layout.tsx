import type { Metadata } from "next";
import Script from "next/script";
import { cookies } from "next/headers";
import { LabPostsProvider } from "@/components/lab-posts";
import { AddToStudyProvider } from "@/components/add-to-study";
import { I18nProvider, type Locale } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Loupe · Motion Atlas", template: "%s · Loupe" },
  description: "A route-based archive of 2026 motion and design posts from Demo Studio and related creators.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale: Locale = (await cookies()).get("collections-locale")?.value === "zh-Hant" ? "zh-Hant" : "en";
  return <html lang={locale} suppressHydrationWarning>
    <body>
      <Script id="sidebar-preference" strategy="beforeInteractive">{"try{document.documentElement.classList.toggle('sidebar-collapsed',localStorage.getItem('collections-sidebar-collapsed')==='true');document.documentElement.dataset.theme=localStorage.getItem('collections-theme')==='dark'?'dark':'light';document.documentElement.dataset.workspaceMode=localStorage.getItem('collections-workspace-mode')==='lab'?'lab':'user'}catch{document.documentElement.dataset.workspaceMode='user'}"}</Script>
      <I18nProvider initialLocale={locale}><LabPostsProvider><AddToStudyProvider>{children}</AddToStudyProvider></LabPostsProvider></I18nProvider>
    </body>
  </html>;
}
