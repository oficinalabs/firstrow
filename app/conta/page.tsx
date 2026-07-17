import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountSection, DataRow } from "@/components/auth/account-section";
import { LemonLink } from "@/components/auth/lemon-link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { EmptyState } from "@/components/ui/empty-state";
import { ViewerShell } from "@/components/ui/viewer-shell";
import { formatDate, formatEuro } from "@/lib/format";
import { getSession } from "@/server/auth-helper";
import { listUserPurchases } from "@/server/purchases";

export const metadata: Metadata = { title: "A minha conta" };
export const dynamic = "force-dynamic";

export default async function ContaPage() {
  const session = await getSession();
  if (!session?.user) redirect("/entrar?next=/conta");
  const user = session.user;

  const purchases = await listUserPurchases(user.id);

  return (
    <ViewerShell active="conta">
      {/* Conta é uma superfície de espectador → tema dark do ViewerShell
          (fundação: "espectador = dark por defeito"). O mock desenha-a em
          papel; ver nota no PR sobre uma variante light do shell. */}
      <div className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-md flex-col gap-7 px-4 py-6">
          <header className="flex flex-col gap-0.5">
            <h1 className="font-display text-xl font-extrabold tracking-display">A minha conta</h1>
            <p className="text-2sm text-foreground-secondary">{user.email}</p>
          </header>

          <AccountSection label="Compras">
            {purchases.length > 0 ? (
              purchases.map((purchase) => (
                <Link
                  key={purchase.entitlementId}
                  href={`/eventos/${purchase.eventId}`}
                  className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0 transition-colors hover:bg-muted/50"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-2sm font-semibold text-foreground">
                      Acesso à live — {purchase.eventTitle}
                    </span>
                    <span className="text-xs text-foreground-secondary">
                      comprado a {formatDate(purchase.boughtAt)}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-2sm text-foreground">
                    {formatEuro(purchase.priceCents)}
                  </span>
                </Link>
              ))
            ) : (
              <EmptyState
                title="Ainda não compraste nada."
                description="Quando comprares acesso a uma live, fica aqui — com o link para veres."
                action={<LemonLink href="/">Ver o que está a dar</LemonLink>}
              />
            )}
          </AccountSection>

          <AccountSection label="Dados">
            <DataRow label="Nome">{user.name}</DataRow>
            <DataRow label="Email">{user.email}</DataRow>
            <DataRow label="Password">
              <LemonLink href="/recuperar">Mudar</LemonLink>
            </DataRow>
          </AccountSection>

          <Link
            href="/bilhetes"
            className="flex items-center justify-between gap-3 rounded-sm border border-border bg-card px-4 py-3.5 transition-colors hover:bg-muted/50"
          >
            <span className="text-2sm font-semibold text-foreground">Os meus bilhetes</span>
            <span aria-hidden className="font-mono text-2sm text-foreground-secondary">
              ›
            </span>
          </Link>

          <SignOutButton />
        </div>
      </div>
    </ViewerShell>
  );
}
