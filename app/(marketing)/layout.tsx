import type { Metadata } from "next";
import { SITE_URL } from "@/components/marketing/dados";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";

// metadataBase resolve as imagens OG relativas das páginas de marketing.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

// Moldura light do marketing (a raiz "/" é a visão geral do espectador, dark).
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
