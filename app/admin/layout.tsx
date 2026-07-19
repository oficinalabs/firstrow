import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackofficeChrome } from "@/components/admin/backoffice-chrome";
import {
  canEnterBackoffice,
  isPlatformAdmin,
  managedChannelIds,
  requireUser,
} from "@/server/authz";
import { getChannelById } from "@/server/channels";

export const metadata: Metadata = {
  title: { template: "%s · Backoffice FirstRow", default: "Backoffice FirstRow" },
  robots: { index: false },
};

/*
 * Gate das PÁGINAS do backoffice (a UI é da Frente D; isto é só a fechadura).
 *
 * MUDOU O QUE DECIDE: passou a mandar o PAPEL na base de dados em vez do
 * `ADMIN_EMAILS` do `lib/admin.ts`. Enquanto o gate era o email, a coluna
 * `role` da Frente A não decidia nada — um `league_owner` a sério ficava de
 * fora e um email na lista entrava fosse qual fosse o papel na BD.
 *
 * ⚠️  ESTE GATE, SOZINHO, NÃO CHEGA — E NÃO É POR DESLEIXO
 *
 * No App Router o layout e a página do mesmo segmento renderizam EM PARALELO.
 * Quando este gate corre, `app/admin/page.tsx` já foi buscar as estatísticas e
 * já as está a escrever no payload em streaming. Medido com uma conta `viewer`
 * autenticada contra o build de produção: com `forbidden()`, devolvendo
 * `<Forbidden/>`, ou com `redirect()`, o corpo da resposta trazia à mesma
 * "Receita · julho", "7,50 €" e "1 compras este mês". O ecrã ficava certo e os
 * números iam na mesma para quem não os devia ver.
 *
 * Quem trava isso a sério é o `proxy.ts`, que corta o pedido ANTES de a página
 * chegar a existir. Este gate fica como segunda linha: se um dia o matcher do
 * proxy falhar ou alguém lhe mexer, o backoffice não abre à mesma.
 *
 * ESTE GATE ABRE A PORTA, NÃO DIZ DE QUE CANAL SE FALA
 *
 * `canEnterBackoffice` responde só "esta pessoa gere ALGUM canal?" — é a única
 * pergunta que se pode fazer num sítio sem canal no URL. Quem entra ainda tem
 * de passar pelo gate POR CANAL de cada ecrã: os que abrem um evento usam
 * `server/event-access.ts` (o canal vem do evento); os de lista e de somas
 * levam um `ChannelScope` às queries de `server/stats.ts`. Sem isso, entrar no
 * backoffice era ver o backoffice de toda a gente.
 *
 * Exige `owner` do canal e não `staff`: quase nenhuma página daqui para dentro
 * tem gate próprio, por isso este é o gate efetivo de `/admin/ganhos` e
 * `/admin/subscritores` — dinheiro e dados de compradores. Abrir isto ao staff
 * para lhes dar o scanner seria dar-lhes a contabilidade ao mesmo tempo.
 * Quando a Frente D puser gates página a página, pode aliviar: a API do
 * scanner (`/api/tickets/validate`) já aceita staff e está à espera disso.
 *
 * Route handlers e server actions NÃO herdam isto — cada um repete o seu gate.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser({ next: "/admin" });
  if (!canEnterBackoffice(user)) redirect("/sem-acesso");

  /*
   * O canal da sidebar só aparece quando a resposta é única — quem gere um
   * canal vê o dele. A FirstRow gere todos, por isso para ela a pergunta "qual
   * é o canal ativo?" não tem resposta e o bloco não aparece, em vez de
   * mostrar um canal à sorte (era o que a constante `defaultChannel` fazia).
   *
   * Quando alguém gerir mais do que um, o que falta aqui é um SELETOR de canal
   * — UI da Frente F. Este layout já lhe passa o canal por prop.
   */
  const managed = managedChannelIds(user);
  const channel = managed.length === 1 ? await getChannelById(managed[0]) : null;

  return (
    <BackofficeChrome isPlatformAdmin={isPlatformAdmin(user)} channel={channel ?? undefined}>
      {children}
    </BackofficeChrome>
  );
}
