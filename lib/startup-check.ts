/*
 * ============================================================================
 *  O QUE ESTÁ LIGADO NESTE ARRANQUE
 * ============================================================================
 *
 * Isto nasceu de um erro concreto: o login com Google esteve semanas desligado
 * em produção porque as credenciais nunca foram para a Vercel — e nada o disse.
 * Não havia erro, não havia aviso, só um botão que nunca aparecia. Descobriu-se
 * por acaso, num log de outra coisa.
 *
 * O problema não era faltar uma variável. Era **falhar em silêncio**: cada peça
 * degradava-se sozinha, educadamente, sem ninguém somar as partes. Por isso o
 * relatório é por CAPACIDADE e não por variável — quem lê o log não quer saber
 * que falta `RESEND_API_KEY`, quer saber que ninguém recebe emails e que o
 * login deixou de exigir email confirmado.
 *
 * Só imprime o que está em falta: com tudo configurado, o arranque é silencioso.
 */

type Capability = {
  nome: string;
  vars: string[];
  /** O que deixa de funcionar sem isto. Escrito para ser lido à pressa. */
  semIsto: string;
  /** `true` quando a falha custa dinheiro ou acesso — sai como erro, não aviso. */
  grave: boolean;
};

const CAPABILITIES: Capability[] = [
  {
    nome: "Emails e verificação de conta",
    vars: ["RESEND_API_KEY", "EMAIL_FROM"],
    semIsto:
      "não sai email nenhum (ativação, recibos) E o login NÃO exige email confirmado — qualquer pessoa se regista com um email que não é dela",
    grave: true,
  },
  {
    nome: "Login com Google",
    vars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    semIsto: "o botão de entrar com Google não aparece",
    grave: false,
  },
  {
    nome: "Transmissão em direto",
    vars: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_STREAM_API_TOKEN"],
    semIsto: "criar eventos falha — não se consegue provisionar o destino do OBS",
    grave: true,
  },
  {
    nome: "Reprodução protegida",
    vars: ["CLOUDFLARE_STREAM_SIGNING_KEY_ID", "CLOUDFLARE_STREAM_SIGNING_KEY_JWK"],
    semIsto: "o player não abre: não há como assinar os tokens de visualização",
    grave: true,
  },
  {
    nome: "Pagamentos",
    vars: ["EUPAGO_API_KEY"],
    semIsto: "ninguém consegue comprar",
    grave: true,
  },
  {
    nome: "Confirmação de pagamento",
    vars: ["EUPAGO_WEBHOOK_SECRET"],
    semIsto: "paga-se e não se ativa nada — o webhook recusa tudo por falta de assinatura",
    grave: true,
  },
  {
    nome: "Divisão do dinheiro com a liga (split)",
    vars: ["EUPAGO_LEAGUE_EXTERNKEY", "EUPAGO_PLATFORM_EXTERNKEY"],
    semIsto:
      "em produção as compras são RECUSADAS de propósito (cobrar sem split retinha a parte da liga); em sandbox cobra sem dividir",
    grave: false,
  },
];

const isSet = (nome: string) => (process.env[nome] ?? "").trim() !== "";

/**
 * Escreve o relatório de arranque. Chamada uma vez pelo `instrumentation.ts`.
 *
 * Devolve as capacidades em falta para poder ser testada sem ler logs.
 */
export function reportStartupConfig(): string[] {
  const emFalta = CAPABILITIES.filter((c) => c.vars.some((v) => !isSet(v)));
  if (emFalta.length === 0) return [];

  const ambiente = process.env.EUPAGO_ENV === "production" ? "produção" : "sandbox";
  const linhas = [
    "",
    "┌─ FirstRow — capacidades DESLIGADAS neste arranque ─────────────",
    `│  pagamentos em: ${ambiente}`,
    "│",
  ];

  for (const c of emFalta) {
    const faltam = c.vars.filter((v) => !isSet(v));
    linhas.push(`│  ${c.grave ? "✗" : "·"} ${c.nome}`);
    linhas.push(`│      sem isto: ${c.semIsto}`);
    linhas.push(`│      falta: ${faltam.join(", ")}`);
    linhas.push("│");
  }

  linhas.push("│  Em produção, define-as na Vercel e faz REDEPLOY —");
  linhas.push("│  variáveis novas só entram em builds novos.");
  linhas.push("└───────────────────────────────────────────────────────────────");

  const texto = linhas.join("\n");
  if (emFalta.some((c) => c.grave)) console.error(texto);
  else console.warn(texto);

  return emFalta.map((c) => c.nome);
}
