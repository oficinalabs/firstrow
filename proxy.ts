import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { BACKOFFICE_ROOT, gateForPath } from "@/lib/backoffice-zones";
import {
  backofficeHomeFor,
  canOpenBackofficePath,
  DEFAULT_ROLE,
  loadMemberships,
  ROLES,
  type Role,
} from "@/server/authz";

/*
 * ============================================================================
 *  PROXY — a barreira que tem mesmo de decidir
 * ============================================================================
 *
 * PORQUE SE CHAMA `proxy.ts` E NÃO `middleware.ts`
 * O Next 16 deu o convénio `middleware` por descontinuado e renomeou-o para
 * `proxy` — o build avisa ("The middleware file convention is deprecated.
 * Please use proxy instead"). Mesmo sítio na cadeia de pedidos, mesma API, e
 * agora com runtime Node fixo (o `runtime` deixou de ser configurável aqui).
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE ISTO CONSULTA A BASE DE DADOS EM `/admin` (e não devia, à
 *  primeira vista)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * O plano era o clássico: proxy só espreita o cookie, e o gate do servidor
 * decide o papel. Testou-se contra o build de produção e NÃO CHEGA — o
 * backoffice fugia por baixo.
 *
 * O motivo é como o App Router renderiza: o layout e a página do mesmo
 * segmento correm EM PARALELO, não em sequência. Quando o gate vive no
 * `app/admin/layout.tsx`, a página já está a correr as suas queries e a
 * escrever o resultado no payload em streaming antes de o layout ter maneira
 * de a travar. Medido, com uma conta `viewer` autenticada a pedir `/admin`:
 *
 *     forbidden() no layout            → HTTP 200 · "Receita · julho", "7,50 €"
 *                                        e "1 compras este mês" no corpo
 *     layout devolve <Forbidden/>      → HTTP 200 · a mesma fuga
 *     redirect() no layout             → HTTP 200 · a mesma fuga
 *
 * Ou seja: o `redirect("/")` que aqui estava antes desta frente TAMBÉM fugia.
 * O ecrã ficava correto e os números da liga iam à mesma para o browser de
 * quem não devia vê-los — bastava ver o código-fonte da página.
 *
 * Não há forma de um layout impedir os filhos de renderizar. A única barreira
 * que corta ANTES de a página existir é esta. Por isso, e só para `/admin/**`,
 * este ficheiro lê a sessão a sério e decide o papel.
 *
 * O CUSTO, medido e aceite: uma ida à BD por pedido ao backoffice. O
 * backoffice tem meia dúzia de utilizadores e já fala com a BD em todas as
 * páginas — é barato. O que NÃO se faz é pagar isso no site inteiro: ver a
 * divisão em `REQUER_PAPEL` vs `REQUER_SESSAO` mais abaixo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  ISTO CONTINUA A NÃO SER A ÚLTIMA BARREIRA
 * ────────────────────────────────────────────────────────────────────────────
 *
 * As rotas `/api/**` não estão no `matcher` e defendem-se sozinhas com
 * `server/api-guard.ts`. É deliberado: uma API cuja única proteção fosse o
 * matcher de um proxy ficava aberta ao primeiro erro de padrão — e isso não é
 * teórico, foi a classe de bugs das CVE-2026-44573/44574/44575, em que
 * variantes `.rsc` e query params chegavam à página sem passar pelo matcher.
 * O gate do `app/admin/layout.tsx` também fica, pela mesma razão.
 */

/** Precisam de sessão E de papel. Aqui lê-se a sessão a sério (BD). */
const REQUER_PAPEL = ["/admin"] as const;

/**
 * Precisam só de sessão iniciada.
 *
 * Aqui o corte é o cookie, sem BD, e chega: estas páginas só mostram dados da
 * PRÓPRIA conta, e já os vão buscar filtrados pelo id da sessão lida no
 * servidor. Mesmo que alguém forje um cookie e passe por aqui, o servidor não
 * lhe encontra sessão nenhuma e não há dados de outra pessoa para escorrer.
 */
const REQUER_SESSAO = ["/conta", "/bilhetes"] as const;

function comecaPor(pathname: string, bases: readonly string[]): boolean {
  return bases.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

/**
 * Constrói o `?next=` sem abrir um open redirect.
 *
 * O destino só pode ser um caminho interno. Quem conseguisse meter
 * `?next=https://sitio-falso.pt` num link transformava a nossa página de login
 * num trampolim de phishing com credibilidade emprestada: o domínio na barra é
 * o nosso, o salto depois do login é dele.
 *
 * Recusamos tudo o que não seja "/" seguido de algo que não seja outra "/" ou
 * "\" — é isso que apanha `//evil.pt` e `/\evil.pt`, que os browsers resolvem
 * como URLs absolutos apesar de começarem por barra.
 */
function destinoSeguro(pathname: string, search: string): string {
  const candidato = `${pathname}${search}`;
  if (!/^\/($|[^/\\])/.test(candidato)) return "/";
  return candidato;
}

function paraLogin(req: NextRequest, pathname: string, search: string) {
  const destino = req.nextUrl.clone();
  destino.pathname = "/entrar";
  destino.search = "";
  destino.searchParams.set("next", destinoSeguro(pathname, search));
  return NextResponse.redirect(destino);
}

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // ── Backoffice: sessão + papel, decidido aqui ─────────────────────────────
  if (comecaPor(pathname, REQUER_PAPEL)) {
    // Corte barato primeiro: sem cookie nem vale a pena falar com a BD.
    if (!getSessionCookie(req)) return paraLogin(req, pathname, search);

    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return paraLogin(req, pathname, search);

    // Papel desconhecido conta como o menos poderoso, nunca como acesso —
    // mesma defesa que `getCurrentUser()` faz em server/authz.ts.
    const bruto = (session.user as { role?: unknown }).role;
    const role: Role = isRole(bruto) ? bruto : DEFAULT_ROLE;

    /*
     * O corte é POR CAMINHO, e não uma porta única.
     *
     * Aqui não há canal nenhum de onde partir — `/admin` não o tem no URL — mas
     * há o CAMINHO, e o caminho já diz que papel a zona exige:
     * `/admin/scanner` chega-lhe operar um canal; `/admin/ganhos` exige geri-lo.
     * A tabela está em `lib/backoffice-zones.ts` e é a MESMA que as páginas
     * usam (`requireBackofficePage`) e que a sidebar usa para se filtrar. Um
     * segundo sítio a decidir isto era um segundo sítio para divergir — já
     * aconteceu nesta plataforma, e o resultado foi um recurso que não abria
     * para ninguém.
     *
     * De que CANAL é que se fala continua a decidir-se lá dentro, ecrã a ecrã,
     * a partir do evento ou do âmbito: isto abre a zona, não o conteúdo.
     *
     * Custa a leitura das filiações além da sessão. Continua a ser só em
     * `/admin/**`, que é meia dúzia de pessoas — a mesma troca já explicada
     * para a leitura da sessão.
     */
    const memberships = await loadMemberships(session.user.id);
    const subject = { role, memberships };

    if (!canOpenBackofficePath(subject, pathname)) {
      /*
       * ZONAS `platform`: a recusa é da PÁGINA, e é um 404 de propósito.
       *
       * `/admin/plataforma` responde `notFound()` a quem não é da FirstRow —
       * "quem não é da FirstRow não precisa sequer de saber que este ecrã
       * existe" (docs/SEGURANCA-APP.md). Um `redirect("/sem-acesso")` aqui
       * dizia-lhe o contrário: que o caminho existe e que lhe está vedado, que
       * é exatamente o que o 404 esconde.
       *
       * Deixar passar é seguro porque estas páginas travam-se a si próprias
       * SEQUENCIALMENTE — `isPlatformAdmin` antes da primeira query, no corpo
       * da página. O problema do App Router é um LAYOUT não conseguir travar a
       * página que corre em paralelo com ele; uma página a travar-se a si
       * mesma, antes de ler seja o que for, não tem esse problema.
       *
       * Quem não entra sequer no backoffice continua a ser apanhado a seguir,
       * pelo gate do layout. Há um teste que lê o código de `/admin/plataforma`
       * e falha se o gate próprio desaparecer — sem ele, esta linha passava a
       * ser um buraco.
       */
      if (gateForPath(pathname) === "platform") return NextResponse.next();

      /*
       * Quem tem backoffice, mas não ESTE, vai para o que tem em vez de levar
       * com uma recusa. O caso real: o staff da porta carrega no atalho
       * "Backoffice" (ou escreve `/admin`) e o que quer é o scanner — mandá-lo
       * para `/sem-acesso` seria dizer-lhe "não podes" a caminho da única coisa
       * que pode. Só na RAIZ: quem pediu `/admin/ganhos` pediu aquilo, e
       * atirá-lo para outro ecrã sem explicação era pior do que a recusa.
       */
      const casa = backofficeHomeFor(subject);
      if (casa && pathname === BACKOFFICE_ROOT) {
        return NextResponse.redirect(new URL(casa, req.nextUrl));
      }
      return NextResponse.redirect(new URL("/sem-acesso", req.nextUrl));
    }

    return NextResponse.next();
  }

  // ── Superfícies pessoais: basta haver cookie ──────────────────────────────
  if (comecaPor(pathname, REQUER_SESSAO)) {
    if (!getSessionCookie(req)) return paraLogin(req, pathname, search);
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  /*
   * LISTA DE ADMISSÃO, não lista de exclusão. O padrão comum
   * ("tudo menos `_next/static`, imagens, favicon…") obriga a adivinhar o que
   * falta excluir e falha em silêncio quando aparece um caminho novo. Aqui só
   * entra o que precisa de ser filtrado: nenhum pedido a estáticos ou a
   * `/api/*` paga o custo deste ficheiro, e não há nada para esquecer.
   *
   * O caminho nu vai a par do `:path*` de propósito: `/admin` e `/admin/`
   * passam por normalizações diferentes, e listar ambos evita depender desse
   * detalhe. Custa uma linha; um furo aqui custava o backoffice.
   */
  matcher: ["/admin", "/admin/:path*", "/conta", "/conta/:path*", "/bilhetes", "/bilhetes/:path*"],
};
