import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { limitByIpShared, refundAttempt, type ScopeDeIp } from "@/lib/rate-limit";

/*
 * ============================================================================
 *  O travão à porta do Better Auth
 * ============================================================================
 *
 * A Frente A já pôs limites dentro da config do Better Auth (`rateLimit`).
 * Este é o mesmo travão vindo de fora, pela via partilhada de `lib/rate-limit.ts`
 * — para haver UM sítio onde se vê e afina a postura da app inteira, em vez de
 * dois sistemas com números diferentes que ninguém sabe qual manda.
 *
 * Os dois somam-se sem conflito: quem passar por este ainda apanha o de dentro.
 *
 * POR IP, NÃO POR EMAIL: travar por conta deixava um atacante trancar a conta
 * de outra pessoa à vontade — o limite viraria a arma (lockout-as-DoS). O IP
 * é quem paga a fatura do que está a tentar. (OWASP Authentication Cheat Sheet.)
 *
 * NÃO TOCA NO GET: os callbacks do OAuth do Google e a leitura de sessão
 * passam por aqui e travá-los partia o login em vez de o proteger.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE O LOGIN SÓ PAGA QUANDO FALHA — e porque é que isso é OBRIGATÓRIO
 *  agora que o contador é a sério
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Até esta frente isto usava o contador EM MEMÓRIA, que em serverless não
 * limitava nada: cada instância tinha o seu, e morriam entre pedidos. Ligar o
 * contador PARTILHADO faz o limite passar a valer mesmo — e é aí que aparece um
 * problema que antes estava escondido por o limite não funcionar.
 *
 * As operadoras móveis portuguesas põem MUITOS clientes atrás do mesmo IPv4
 * público (CGNAT). Um balde de 10/min por IP que conte TODOS os pedidos, com o
 * contador a funcionar a sério, tranca dezenas de espectadores legítimos a
 * tentar entrar na noite de um evento — todos eles a partilhar um IP que não
 * escolheram. Seria uma avaria causada pela correção.
 *
 * A saída não é subir o número (que enfraquece o travão para toda a gente): é
 * cobrar só o que FALHA. Quem acerta na password não gasta nada, por isso a
 * multidão atrás do CGNAT nunca esbarra no limite; quem anda a adivinhar falha
 * por definição, e 10 falhas por minuto do mesmo IP é abuso em qualquer leitura.
 * O travão fica mais apertado contra o ataque e deixa de existir para quem passa.
 *
 * ⚠️ COBRA-SE À ENTRADA E DEVOLVE-SE NO FIM — e não o contrário.
 * A primeira versão disto espreitava o balde e só cobrava as falhas. Foi MEDIDO
 * e estava mal: 20 passwords erradas em paralelo passaram as 20, porque uma
 * leitura não tranca nada e as vinte leram "balde vazio" ao mesmo tempo. Dava
 * uma rajada de tamanho ilimitado por janela. Cobrar primeiro usa o `INSERT …
 * ON CONFLICT` atómico (que serializa), e a devolução no sucesso dá o mesmo
 * benefício sem o buraco.
 *
 * O que continua a contar SEMPRE (`cobra: "sempre"`) são os caminhos em que o
 * pedido bem sucedido É o abuso: criar contas e disparar emails para terceiros.
 *
 * ⚠️ Este travão só decide alguma coisa porque o limitador INTERNO do Better
 * Auth (`rateLimit.customRules`, em `lib/auth.ts`) foi afrouxado. Enquanto
 * esteve mais apertado do que este, era ele quem mandava — e como conta em
 * memória e não distingue sucesso de falha, anulava tudo isto. Medido: 40
 * logins CERTOS do mesmo IP davam 40 × 429.
 */

const handler = toNextJsHandler(auth);

/** O que é que gasta uma unidade do balde. */
type Cobranca =
  /** Todos os pedidos contam — o sucesso é que é o recurso (conta criada, email enviado). */
  | "sempre"
  /** Só os pedidos que correm mal — o sucesso é uso legítimo e sai de graça. */
  | "falhas";

/** Caminhos do Better Auth que se podem martelar, com que balde e a que preço. */
const GUARDED: ReadonlyArray<{ suffix: string; scope: ScopeDeIp; cobra: Cobranca }> = [
  // Adivinhar credenciais: só as tentativas falhadas custam (ver o cabeçalho).
  { suffix: "/sign-in/email", scope: "auth", cobra: "falhas" },
  { suffix: "/reset-password", scope: "auth", cobra: "falhas" },
  { suffix: "/change-password", scope: "auth", cobra: "falhas" },
  // Criar conta: o pedido BEM SUCEDIDO é que é o recurso gasto, por isso conta
  // sempre. Só contar as falhas aqui era deixar criar contas sem fim nenhum.
  { suffix: "/sign-up/email", scope: "auth", cobra: "sempre" },
  // Disparam email para terceiros → mais apertado, senão é um canhão de spam.
  { suffix: "/request-password-reset", scope: "authEmail", cobra: "sempre" },
  { suffix: "/forget-password", scope: "authEmail", cobra: "sempre" },
  { suffix: "/send-verification-email", scope: "authEmail", cobra: "sempre" },
];

export const GET = handler.GET;

export async function POST(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const guarded = GUARDED.find((entry) => pathname.endsWith(entry.suffix));

  if (!guarded) return handler.POST(req);

  /*
   * Cobra-se JÁ, atomicamente. O balde inclui o CAMINHO: gastar as tentativas
   * de login não deve impedir a pessoa de pedir um email de recuperação — que é
   * precisamente o que ela vai fazer a seguir se se enganou vezes de mais.
   */
  const limited = await limitByIpShared(req, guarded.scope, guarded.suffix);
  if (limited) return limited;

  const resposta = await handler.POST(req);

  /*
   * Correu bem, e é um caminho de credenciais? Devolve-se a unidade — só as
   * tentativas FALHADAS ficam a contar. Tudo o que não seja 2xx conta como
   * falha: password errada (401), corpo inválido (400) e até um 500 nosso. Ser
   * generoso na definição de "falhou" é o lado seguro — no pior caso fica
   * cobrada uma tentativa a mais a quem já estava com problemas, e nunca uma a
   * menos a quem anda a adivinhar.
   *
   * O `await` é deliberado: sem ele a instância serverless pode congelar mal a
   * resposta sai e a devolução perde-se. Custa um `update` por login bem
   * sucedido — o caminho que já está a escrever uma sessão na base de dados.
   */
  if (guarded.cobra === "falhas" && resposta.ok) {
    await refundAttempt(req, guarded.scope, guarded.suffix);
  }

  return resposta;
}
