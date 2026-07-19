import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { buttonVariants } from "@/components/ui/button";

/*
 * 403 — a fronteira do backoffice, desenhada.
 *
 * QUEM CAI AQUI já tem sessão iniciada: quem não tem é apanhado antes, no
 * `proxy.ts`, e mandado para /entrar. Por isso a copy não diz "inicia sessão"
 * (já iniciou) nem "não existe" (existe, não é para esta conta): diz o que se
 * passa e dá duas saídas, em vez de um beco.
 *
 * PORQUÊ UMA PÁGINA NORMAL E NÃO O `forbidden()` DO NEXT
 * Foram testados os três caminhos, contra o servidor de produção:
 *   · `forbidden()` no layout  → a página do backoffice RENDERIZAVA à mesma e
 *     ia no payload; ver o comentário no topo de `app/admin/layout.tsx`;
 *   · `NextResponse.rewrite(url, { status: 403 })` → o `status` é ignorado
 *     (vercel/next.js#50155, aberto desde 2023);
 *   · `forbidden()` numa página → devolvia 404 e renderizava o not-found.
 * Sobrou o que funciona: o proxy corta o pedido antes de a página existir e
 * manda para aqui.
 *
 * O PREÇO, ASSUMIDO: uma página do Next responde 200, por isso este ecrã não
 * devolve um 403 de verdade — o pedido a `/admin` responde 307 para aqui. Foi
 * uma troca deliberada: um status certo com fuga de dados vale menos do que um
 * status morno sem fuga nenhuma. Está registado em docs/SEGURANCA-APP.md.
 *
 * Mesma família visual do 404 (Transversal.dc.html): número gigante com
 * sublinhado limão, tema light, barra tinta mínima no topo.
 */

export const metadata: Metadata = {
  title: "Sem acesso",
  robots: { index: false, follow: false },
};

export default function SemAcessoPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <MarketingHeader minimal />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-20 md:px-8">
        <div className="flex flex-col items-start gap-8 md:flex-row md:items-center md:gap-16">
          <div className="border-b-4 border-accent font-display text-8xl font-black leading-none tracking-tighter md:text-9xl">
            403
          </div>
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-display md:text-3xl">
              Esta zona não é da tua conta.
            </h1>
            <p className="mt-2.5 max-w-[48ch] text-sm leading-relaxed text-muted-foreground md:text-base">
              A página existe, mas é reservada a quem gere a liga. Não é engano teu nem avaria nossa
              — a tua conta simplesmente não tem esta chave. Se devia ter, fala com quem organiza os
              eventos.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/" className={buttonVariants()}>
                Ir para o início
              </Link>
              <Link href="/conta" className={buttonVariants({ variant: "secondary" })}>
                A minha conta
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
