import "server-only";

import { PanelsTopLeft } from "lucide-react";
import Link from "next/link";
import { canEnterBackoffice, getCurrentUser } from "@/server/authz";

/*
 * ============================================================================
 *  O ATALHO PARA O BACKOFFICE, NO HEADER DO SITE
 * ============================================================================
 *
 * O simétrico do link que o backoffice já tem para o site. Quem gere uma liga
 * anda nos dois lados o dia todo e não tem porque decorar `/admin`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE ISTO É UM COMPONENTE DE SERVIDOR À PARTE, E NÃO UM `if` NO
 *  `ViewerShell`
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Duas razões, e as duas são obrigatórias:
 *
 * 1. ESCONDER COM CSS NÃO ESCONDE NADA. Um `<Link>` renderizado e tapado com
 *    `hidden` vai no HTML e no payload RSC na mesma: quem abre o código-fonte
 *    da página fica a saber quem tem poderes de backoffice — e onde é a porta.
 *    Um componente de servidor que devolve `null` não escreve nada. Não é uma
 *    afirmação de fé: está contado no relatório desta frente, com uma sessão de
 *    espectador, no corpo em bruto da resposta.
 *
 * 2. O `ViewerShell` VIVE NO BUNDLE DO CLIENTE. Dois `error.tsx` são
 *    `"use client"` (o Next exige-o das error boundaries) e importam-no, o que
 *    arrasta o ficheiro inteiro para o browser. Um `getCurrentUser()` lá dentro
 *    não compilava — e se compilasse, era o `server/authz` e o driver do
 *    Postgres a irem para o browser. Por isso o shell recebe isto por prop, já
 *    resolvido, e as páginas de servidor é que o passam.
 *
 * A PERGUNTA É `canEnterBackoffice`, e não "tem alguma filiação": é a mesma
 * função que o `proxy.ts` usa para deixar entrar em `/admin/**`. O staff de um
 * canal NÃO passa nesse portão (ver a nota em `app/admin/layout.tsx`), por isso
 * mostrar-lhe o link era pô-lo a carregar num atalho que dá em `/sem-acesso`.
 * Quando o backoffice tiver gates página a página e o staff puder entrar, muda
 * `canEnterBackoffice` — e este link acompanha sem se lhe tocar.
 */
export async function BackofficeLink() {
  const user = await getCurrentUser();
  // `null` e não `hidden`: para quem não tem poderes, isto não chega a existir.
  if (!canEnterBackoffice(user)) return null;

  return (
    <Link
      href="/admin"
      /*
       * Discreto: mono, minúsculo e da cor do resto da barra. É uma ferramenta
       * de trabalho para meia dúzia de pessoas, não uma chamada à ação — chamar
       * a atenção dela era estragar o header do produto para todos os outros.
       *
       * A borda à esquerda separa-o da navegação do SITE, que é outra coisa:
       * estes três links andam dentro da mesma casa, este salta para outra.
       *
       * `min-h-11`/`min-w-11` = 44px de alvo de toque nas DUAS dimensões. A
       * altura sozinha não chega: em telemóvel sobra só o ícone, e sem a
       * largura mínima o alvo ficava em 31px — medido no browser a 375px.
       */
      className="-my-1 inline-flex min-h-11 min-w-11 shrink-0 items-center gap-2 border-l border-bar-border pl-4 font-mono text-2xs uppercase tracking-label text-bar-muted transition-colors hover:text-bar-foreground md:pl-6"
      /*
       * A 375px a palavra não cabe — foi medido no browser, com a barra a
       * transbordar para fora do ecrã. Aí fica só o ícone, e o nome acessível
       * vem daqui: quem usa leitor de ecrã ouve "Backoffice" nas duas larguras.
       */
      aria-label="Backoffice"
    >
      <PanelsTopLeft aria-hidden className="size-3.5 shrink-0" />
      <span className="hidden md:inline">Backoffice</span>
    </Link>
  );
}
