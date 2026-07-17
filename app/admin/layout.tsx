import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackofficeChrome } from "@/components/admin/backoffice-chrome";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/server/auth-helper";

export const metadata: Metadata = {
  title: { template: "%s · Backoffice FirstRow", default: "Backoffice FirstRow" },
  robots: { index: false },
};

// Gate único do backoffice: sessão + email em ADMIN_EMAILS. As rotas de
// dados (route handler de polling, server actions) repetem o gate — isto
// protege as páginas, não os endpoints.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user || !isAdmin(user.email)) redirect("/");

  return <BackofficeChrome>{children}</BackofficeChrome>;
}
