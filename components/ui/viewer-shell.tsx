import Image from "next/image";
import Link from "next/link";
import { tenantStyle } from "@/components/ui/tenant-scope";
import type { Channel } from "@/lib/channels";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { key: "inicio", label: "Início", href: "/" },
  { key: "bilhetes", label: "Bilhetes", href: "/bilhetes" },
] as const;

export type ViewerNavKey = (typeof NAV_ITEMS)[number]["key"] | "conta";

/*
 * O item de conta é a ÚNICA entrada da navegação cujo destino depende de quem
 * está a olhar: sem sessão, "Conta" era um convite a clicar para descobrir que
 * afinal pede para entrar — o dono achou-o ambíguo ("aparece 'Conta' estando ou
 * não com log in"). Uma função pura (e não mais um `NAV_ITEMS` estático) para
 * se poder testar as duas respostas sem montar o componente.
 */
export function accountNavItem(signedIn: boolean): { label: string; href: string } {
  return signedIn
    ? { label: "Conta", href: "/conta" }
    : { label: "Iniciar Sessão", href: "/entrar" };
}

/*
 * Moldura do espectador: barra FirstRow (sempre tinta) + conteúdo dark.
 *
 * `channel` é o co-branding: quem passa um canal ganha a linha de 3px na cor
 * dele e as vars da paleta para os descendentes (ex.: text-(--tenant),
 * bg-(--tenant-solid)). A cor vem derivada para o fundo escuro do espectador —
 * a liga escolhe o tom, o sistema garante que se lê (ver lib/colors.ts).
 * As páginas da plataforma — visão geral, bilhetes, conta — não passam canal
 * nenhum: a moldura fica só FirstRow, como no design da homepage.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE O ATALHO DO BACKOFFICE ENTRA POR PROP
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Este ficheiro NÃO PODE ler a sessão. Dois `error.tsx` são `"use client"` —
 * o Next exige-o das error boundaries — e importam o `ViewerShell`, o que o
 * arrasta para o bundle do browser. Um `getCurrentUser()` aqui dentro levava o
 * `server/authz` (e o driver do Postgres) atrás.
 *
 * Por isso quem decide é o `<BackofficeLink />`, um componente de SERVIDOR que
 * as páginas passam por aqui já montado. Para quem não tem poderes ele devolve
 * `null` — o atalho não é escondido, não existe. As `loading.tsx` e as
 * `error.tsx` simplesmente não o passam: um esqueleto não tem sessão para ler.
 *
 * O item de conta segue a MESMA regra, mas não pode ser um `ReactNode` pronto
 * como o `backoffice`: é um dos itens fixos da navegação (sempre lá, ao
 * contrário do atalho que só aparece a quem gere um canal), por isso entra como
 * `signedIn?: boolean` — a página é que sabe se há sessão, o shell só escolhe o
 * rótulo. Sem a prop (as `loading.tsx`/`error.tsx` que não podem lê-la) o
 * default é `false`: mostra "Iniciar Sessão", nunca "Conta" a quem talvez não
 * tenha uma — assumir a sessão era o lado errado para se enganar.
 */
export function ViewerShell({
  active,
  backoffice,
  channel,
  signedIn = false,
  children,
}: {
  active?: ViewerNavKey;
  /** `<BackofficeLink />`. Só as páginas de servidor o passam — ver acima. */
  backoffice?: React.ReactNode;
  channel?: Channel;
  /** Há sessão? Por omissão `false` — ver a nota acima. */
  signedIn?: boolean;
  children: React.ReactNode;
}) {
  const conta = accountNavItem(signedIn);
  return (
    <div
      data-theme="dark"
      className="flex min-h-dvh flex-col bg-background text-foreground"
      style={tenantStyle(channel, "dark")}
    >
      <header className="border-b border-bar-border bg-bar text-bar-foreground">
        <div className="mx-auto flex h-13 w-full max-w-6xl items-center justify-between px-4 md:h-14 md:px-8">
          <Link
            href="/"
            className="alvo-toque flex shrink-0 items-center"
            aria-label="FirstRow — início"
          >
            <Image
              src="/brand/firstrow-lockup-h-branco.svg"
              alt="FirstRow"
              width={99}
              height={24}
              priority
            />
          </Link>
          <nav aria-label="Navegação principal" className="flex items-center gap-5 md:gap-6">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active === item.key ? "page" : undefined}
                className={cn(
                  // A navegação principal do espectador tinha 20px de altura:
                  // 35x20 no "Início". `alvo-toque` estica a área de acerto aos
                  // 44px sem mexer no desenho da barra — e o intervalo de 20px
                  // entre itens é maior do que os ~4px que cada um cresce para
                  // cada lado, por isso não se roubam toques uns aos outros.
                  "alvo-toque text-sm font-medium transition-colors hover:text-bar-foreground",
                  active === item.key ? "text-bar-foreground" : "text-bar-muted",
                )}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={conta.href}
              aria-current={active === "conta" ? "page" : undefined}
              className={cn(
                "alvo-toque text-sm font-medium transition-colors hover:text-bar-foreground",
                active === "conta" ? "text-bar-foreground" : "text-bar-muted",
              )}
            >
              {conta.label}
            </Link>
            {backoffice}
          </nav>
        </div>
      </header>
      {/* Sempre 3px: com canal é o filete de co-branding, sem canal é fundo —
          assim o esqueleto e a página carregada têm exactamente a mesma altura.
          `--tenant-rule` já traz uma cor ou o corte seco entre as duas do canal. */}
      <div
        aria-hidden
        className="h-0.75 shrink-0"
        style={channel ? { background: "var(--tenant-rule)" } : undefined}
      />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
