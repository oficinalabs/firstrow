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
 */
export type BackofficeGate = "operate" | "manage" | "platform";

/** A raiz do backoffice — o destino do atalho no header do site. */
export const BACKOFFICE_ROOT = "/admin";

/** O scanner de porta: a casa de quem só opera. */
export const SCANNER_PATH = "/admin/scanner";

type Zona = {
  readonly path: string;
  readonly gate: BackofficeGate;
  /** `true` = só o caminho exato; por omissão apanha também o que vem abaixo. */
  readonly exact?: boolean;
};

/*
 * ⚠️ A ORDEM DESTA LISTA DECIDE — ganha a PRIMEIRA entrada que casa.
 *
 * Não é uma lista de prefixos ordenada por comprimento porque `/admin/eventos`
 * precisa de duas respostas diferentes: a LISTA (caminho exato) traz o preço,
 * os compradores e a receita de cada evento, logo é `manage`; um EVENTO
 * concreto lá dentro é `operate`, porque é onde o staff opera a transmissão e
 * vê os bilhetes da porta. Ordenar por comprimento não sabe exprimir isso.
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

  // A lista de eventos mostra receita por evento → dinheiro.
  { path: "/admin/eventos", gate: "manage", exact: true },
  // Criar um evento provisiona vídeo na Cloudflare e custa dinheiro.
  { path: "/admin/eventos/novo", gate: "manage" },
  // `/admin/eventos/<id>/**` — transmissão e bilhetes da porta. O gate FINO
  // (editar é só do dono) fica em `server/event-access.ts`, que sabe de que
  // canal é o evento; aqui só se abre a zona.
  { path: "/admin/eventos", gate: "operate" },

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
  if (pathname === zona.path) return true;
  return zona.exact !== true && pathname.startsWith(`${zona.path}/`);
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
