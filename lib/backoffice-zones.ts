/*
 * ============================================================================
 *  AS ZONAS DO BACKOFFICE — que papel mínimo é que cada ecrã exige
 * ============================================================================
 *
 * PORQUE É QUE ISTO EXISTE, E PORQUE É QUE NÃO VIVE EM `server/`
 *
 * A mesma resposta — "quem pode abrir este caminho?" — é precisa em TRÊS
 * sítios: o `proxy.ts` (que corta o pedido antes de a página existir), o gate
 * de cada página (defesa em profundidade) e a navegação lateral (que não deve
 * oferecer o que não abre). Já aconteceu nesta plataforma haver dois sítios a
 * decidir o mesmo acesso com respostas diferentes; o resultado foi um recurso
 * que nunca abria para ninguém. Por isso a tabela é UMA e está aqui.
 *
 * Está em `lib/` e não em `server/` por uma razão concreta: a sidebar é um
 * componente de CLIENTE e precisa da mesma tabela para filtrar os itens. Um
 * módulo de `server/` arrastava o `db` e o `next/headers` para o browser. Este
 * ficheiro é aritmética sobre strings — não importa nada e serve os dois lados.
 *
 * Quem transforma um `BackofficeGate` num "sim/não" é `server/authz.ts`, que é
 * onde os papéis vivem. Aqui só se diz DE QUE gate cada caminho precisa.
 */

/**
 * O papel mínimo de uma zona, do mais fraco para o mais forte.
 *
 *  - `operate`  — opera algum canal (`owner` ou `staff`). É o scanner de porta
 *                 e os ecrãs de um evento concreto.
 *  - `manage`   — gere algum canal (`owner`). Dinheiro, compradores e a lista
 *                 de ligas.
 *  - `platform` — só a FirstRow (`platform_admin`).
 *
 * ⚠️ CONTRATO DAS ZONAS `platform`: a página TEM de se travar a si própria, com
 * `isPlatformAdmin` (ou `requireChannelCreator`) antes da primeira query, e
 * responder `notFound()`. O `proxy.ts` deixa-as passar de propósito — a recusa
 * tem de ser um 404, porque quem não é da FirstRow não deve sequer ficar a
 * saber que o ecrã existe, e um redirect para `/sem-acesso` contava-lho. Há um
 * teste que lê o código dessas páginas e falha se o gate próprio desaparecer.
 */
export type BackofficeGate = "operate" | "manage" | "platform";

/** Todos os gates que existem. A navegação percorre-os para saber o que mostrar. */
export const BACKOFFICE_GATES = ["operate", "manage", "platform"] as const;

/** A raiz do backoffice — o destino do atalho no header do site. */
export const BACKOFFICE_ROOT = "/admin";

/** O scanner de porta. */
export const SCANNER_PATH = "/admin/scanner";

/**
 * A lista de eventos — UMA rota para os dois papéis.
 *
 * É a casa de quem só opera (o `staff`) e a lista de gestão de quem gere (o
 * `owner`): a MESMA rota, servida por DUAS queries escolhidas pelo papel dentro
 * da página (ver a nota grande em `app/admin/eventos/page.tsx`). Não é o scanner
 * a casa do staff porque o scanner é servido **sem moldura** (ver
 * `BackofficeChrome`) — usa-se de pé, à porta, com uma mão, logo sem barra
 * lateral. Quem aterrava lá ficava num beco: o resto do backoffice que lhe é
 * permitido (a transmissão, os bilhetes de cada evento) só se alcançava por um
 * link que alguém lhe mandasse. Esta lista tem moldura e aponta para os três.
 *
 * (Foi `/admin/agenda`, uma rota à parte com uma query sem dinheiro, até esta
 * frente a fundir com `/admin/eventos`: o dono pediu um só item de menu e um só
 * URL. Fundiu-se a NAVEGAÇÃO, não a segurança — ver a nota das ZONAS abaixo.)
 */
export const EVENTS_PATH = "/admin/eventos";

type Zona = {
  readonly path: string;
  readonly gate: BackofficeGate;
};

/*
 * ⚠️ A ORDEM DESTA LISTA DECIDE — ganha a PRIMEIRA entrada que casa.
 *
 * O caso que obriga a pensar na ordem é `/admin/eventos`: a LISTA e os ecrãs de
 * um evento partilham o gate `operate`, mas `/admin/eventos/novo` exige gerir um
 * canal (criar um evento provisiona vídeo e custa dinheiro). Como `novo` é um
 * prefixo mais específico, tem de vir ANTES da entrada geral de `/admin/eventos`
 * — senão a regra geral apanhava-o primeiro e baixava-lhe o gate.
 *
 * Há um teste que percorre todas as rotas reais de `/admin` e confirma o gate
 * de cada uma — é o que impede esta ordem de se estragar em silêncio.
 */
const ZONAS: readonly Zona[] = [
  // Só a FirstRow: totais sem âmbito de canal, e abrir ligas novas.
  { path: "/admin/plataforma", gate: "platform" },
  { path: "/admin/canais/novo", gate: "platform" },

  // A porta do recinto. É por isto que o `staff` entra no backoffice.
  { path: SCANNER_PATH, gate: "operate" },

  // Criar um evento provisiona vídeo na Cloudflare e custa dinheiro → `manage`.
  // ANTES da entrada geral de `/admin/eventos`, que é um prefixo seu.
  { path: "/admin/eventos/novo", gate: "manage" },

  /*
   * A LISTA de eventos e os ecrãs de UM evento — uma rota, gate `operate`.
   *
   * ⚠️ A LISTA ERA `manage` E BAIXOU PARA `operate`, MAS O DINHEIRO NÃO BAIXOU
   * COM ELA. `/admin/eventos` passou a servir DUAS listas na mesma rota,
   * escolhidas pelo papel DENTRO da página: quem gere um canal recebe a lista
   * com receita; quem só opera recebe `listEventsForOperations`, que nem vai
   * buscar dinheiro à base de dados. O gate abre a ROTA aos dois papéis; a
   * página é que decide QUE dados busca — e o que a página não busca não pode
   * escorrer no payload do RSC (a fuga que este projeto já mediu duas vezes; ver
   * a nota grande em `app/admin/eventos/page.tsx`). Fundiu-se a NAVEGAÇÃO — um
   * item de menu, um URL — não a segurança.
   *
   * O gate FINO de cada evento (editar é só do dono) fica em
   * `server/event-access.ts`, que sabe de que canal é o evento; aqui só se abre
   * a zona.
   */
  { path: EVENTS_PATH, gate: "operate" },

  /*
   * Rede de segurança: tudo o resto de `/admin` exige `manage`.
   *
   * O que se ganha em ser esta a omissão, e não `operate`: uma página nova
   * criada amanhã nasce FECHADA ao staff. Quem a quiser abrir tem de vir aqui
   * dizê-lo — que é uma linha a mais, e não uma fuga a menos.
   */
  { path: BACKOFFICE_ROOT, gate: "manage" },
];

function casa(pathname: string, zona: Zona): boolean {
  return pathname === zona.path || pathname.startsWith(`${zona.path}/`);
}

/**
 * O gate de um caminho de `/admin`.
 *
 * Um caminho fora de `/admin` devolve `manage` — o mais restritivo dos que
 * fazem sentido aqui. Nunca devolve "aberto": esta função não é a autoridade
 * sobre o resto do site e não deve ser lida como se fosse.
 */
export function gateForPath(pathname: string): BackofficeGate {
  return ZONAS.find((zona) => casa(pathname, zona))?.gate ?? "manage";
}
