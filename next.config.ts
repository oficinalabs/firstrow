import type { NextConfig } from "next";

/*
 * ============================================================================
 *  CABEÇALHOS DE SEGURANÇA
 * ============================================================================
 *
 * Regra que decidiu tudo o que está aqui: um cabeçalho que parte o player a
 * meio de um evento pago faz mais estragos do que o ataque de que defende.
 * Cada linha foi escolhida contra as duas integrações que esta app não pode
 * perder — o iframe do Cloudflare Stream e o login com Google — e o que não
 * passou nesse teste ficou de fora, com o porquê escrito em docs/SEGURANCA-APP.md.
 */

const isDev = process.env.NODE_ENV === "development";

/** O player vive aqui. É o único terceiro que embebemos. */
const CF_STREAM_FRAME = "https://iframe.cloudflarestream.com";

/*
 * Wildcards e não o host exato: a Cloudflare serve o Stream por várias formas
 * do mesmo domínio (`iframe.cloudflarestream.com`, `customer-<código>.cloudflarestream.com`,
 * `videodelivery.net`) e já mudou de domínio no passado. Fixar um host é
 * assinar para o player deixar de carregar no dia em que eles mexem nisso.
 */
const CF_STREAM_DOMAINS = [
  "https://*.cloudflarestream.com",
  "https://videodelivery.net",
  "https://*.videodelivery.net",
];

/*
 * Permissions-Policy — o cabeçalho mais fácil de estragar desta lista.
 *
 * O que NÃO está aqui fica proibido para a página E para os iframes dela. O
 * atributo `allow` de um iframe só aperta o que este cabeçalho já deu; nunca
 * alarga. Esquecer uma funcionalidade aqui parte o player — e o erro só
 * aparece em runtime, com o evento a decorrer.
 *
 * Por isso cada permissão aberta abaixo aponta a uma linha de código real:
 *   camera            → components/tickets/scanner.tsx (getUserMedia p/ ler o QR à porta)
 *   autoplay,         → components/player/watch-player.tsx, atributo `allow` do
 *   encrypted-media,     iframe: "accelerometer; gyroscope; autoplay;
 *   picture-in-picture,  encrypted-media; picture-in-picture;" + allowFullScreen
 *   accelerometer,
 *   gyroscope,
 *   fullscreen
 *
 * A `camera` é a que se perde com mais facilidade: as listas de "hardening"
 * que se copiam da internet negam-na sempre, e negá-la aqui deixava a equipa
 * sem scanner à porta de um evento esgotado. Tudo o resto leva `()`.
 */
const PERMISSIONS_POLICY = [
  "camera=(self)",
  `autoplay=(self "${CF_STREAM_FRAME}")`,
  `encrypted-media=(self "${CF_STREAM_FRAME}")`,
  `picture-in-picture=(self "${CF_STREAM_FRAME}")`,
  `accelerometer=(self "${CF_STREAM_FRAME}")`,
  `gyroscope=(self "${CF_STREAM_FRAME}")`,
  `fullscreen=(self "${CF_STREAM_FRAME}")`,
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "serial=()",
  "bluetooth=()",
  "magnetometer=()",
  "midi=()",
  "display-capture=()",
  "xr-spatial-tracking=()",
  "browsing-topics=()",
  "idle-detection=()",
  "local-fonts=()",
].join(", ");

/*
 * CSP COMPLETO — EM MODO DE RELATÓRIO, DE PROPÓSITO.
 *
 * Um CSP a sério é a melhor defesa que há contra XSS. Também é a melhor forma
 * de deixar uma app viva com o player em branco: basta um domínio esquecido e
 * o vídeo não carrega, calado, só para alguns browsers. Não se liga isso à
 * força num site que já tem clientes a pagar.
 *
 * Em `Report-Only` o browser aplica a política, não bloqueia nada, e grita na
 * consola o que TERIA bloqueado. Passa a haver evidência em vez de opinião.
 *
 * COMO PROMOVER A ENFORCING (o passo seguinte, para o dono do projeto):
 *  1. correr um evento real de ponta a ponta — OBS → live → player → fim;
 *  2. fazer login com email e com Google, comprar um bilhete, validar um QR;
 *  3. tudo isto em Chrome, Safari e Firefox, de olho na consola;
 *  4. zero violações inesperadas → mudar a chave do cabeçalho abaixo de
 *     "Content-Security-Policy-Report-Only" para "Content-Security-Policy".
 */
/*
 * O domínio público do bucket R2, onde vivem os logos e os banners que as ligas
 * carregam pelo backoffice (ver `lib/r2.ts`).
 *
 * Vem do ambiente e não fixo no código porque muda com a conta e porque um dia
 * passará a ser um domínio próprio. Sem a variável fica `null` e o resto do
 * ficheiro nem repara — é a mesma degradação que `lib/startup-check.ts` anuncia.
 *
 * O `try` não é excesso de zelo: uma variável mal escrita rebentava o BUILD com
 * um erro de `new URL` que não aponta a lado nenhum.
 */
const R2_PUBLIC = (() => {
  const raw = (process.env.R2_PUBLIC_URL ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return { origin: url.origin, hostname: url.hostname, protocol: url.protocol };
  } catch {
    console.warn(`[next.config] R2_PUBLIC_URL não é um URL válido: ${raw}`);
    return null;
  }
})();

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  /*
   * `unsafe-inline` nos dois é o preço de não usar nonces. Tirar isto obriga a
   * gerar um nonce por pedido no proxy, o que desliga a renderização estática
   * e o ISR em TODAS as páginas — caro precisamente nas noites de evento, que
   * é quando o tráfego chega. Não compensa numa app que não embebe scripts de
   * terceiros nem conteúdo escrito por utilizadores.
   */
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  /*
   * O bucket R2 entra aqui por causa da PRÉ-VISUALIZAÇÃO do backoffice, que é
   * um `<img>` direto (a pré-visualização local é um `blob:`, que o
   * optimizador não sabe servir). Nas páginas públicas as imagens passam pelo
   * `/_next/image`, que é da nossa origem e já cabia no `'self'`.
   */
  `img-src 'self' data: blob:${R2_PUBLIC ? ` ${R2_PUBLIC.origin}` : ""} ${CF_STREAM_DOMAINS.join(" ")}`,
  "font-src 'self' data:",
  /*
   * Só 'self': o Better Auth e as nossas rotas são todos da mesma origem, e o
   * Google entra por redirecionamento de página inteira — uma navegação não é
   * um fetch, por isso não passa por aqui e não precisa de constar.
   */
  "connect-src 'self'",
  `frame-src 'self' ${CF_STREAM_DOMAINS.join(" ")}`,
  /*
   * Sem domínios da Cloudflare: como embebemos por iframe, os manifestos e os
   * segmentos de vídeo são pedidos DENTRO do documento deles, sob o CSP deles.
   * Só passaria a ser preciso aqui se trocássemos por um player próprio.
   */
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  /*
   * HSTS — o browser recusa falar http com este domínio durante 2 anos. Fecha
   * o downgrade ("sslstrip") em wifis de café, que é onde se vê uma live paga.
   *
   * SEM `preload` DE PROPÓSITO: entrar na lista de preload dos browsers é fácil
   * e sair demora meses. O domínio definitivo do projeto ainda nem está
   * comprado — preload aqui seria fixar o domínio provisório.
   */
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  /*
   * Impede o browser de adivinhar o tipo de um ficheiro. Sem isto, algo que o
   * servidor diz ser texto pode acabar executado como JavaScript.
   */
  { key: "X-Content-Type-Options", value: "nosniff" },
  /*
   * Não deixa o URL completo sair para terceiros — só a origem, e só em https.
   * Importa aqui porque os nossos URLs têm ids de evento e de bilhete.
   */
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  /*
   * Anti-clickjacking, e não é teórico: esta plataforma vende acesso a vídeo.
   * Sem isto, qualquer pessoa podia meter a página do player dentro de um site
   * próprio e revender o que nós cobramos.
   *
   * `DENY` / `'none'` e não `SAMEORIGIN`: não há um único iframe da app dentro
   * da própria app (o único iframe que existe é o do Cloudflare, e esse somos
   * NÓS a embeber TERCEIROS — direção contrária, não é afetado).
   *
   * O `frame-ancestors` do CSP é o mecanismo moderno e ganha onde ambos
   * existem; o `X-Frame-Options` fica para browsers velhos. Este CSP
   * ENFORCING tem só `frame-ancestors`, que é a única diretiva que não corre
   * risco nenhum de partir a app — a política completa vai a seguir, em modo
   * de relatório.
   */
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  {
    /*
     * Corta a referência `window.opener` entre nós e o que abrimos.
     *
     * `same-origin-allow-popups` e NÃO `same-origin`: a variante estrita parte
     * qualquer OAuth em popup — o `window.opener` fica a `null` e o login fica
     * pendurado para sempre. Hoje o Google entra por redirecionamento e não
     * seria afetado, mas basta alguém ligar o Google One Tap para partir tudo
     * sem perceber porquê. Esta variante protege e deixa a porta aberta.
     */
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  /*
   * O filtro anti-XSS dos browsers antigos foi removido de todos os motores
   * atuais e chegou a ser explorável como canal de fuga. `0` desliga-o de vez;
   * `1; mode=block` seria pior do que não ter nada.
   */
  { key: "X-XSS-Protection", value: "0" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  /*
   * Deixa de anunciar "x-powered-by: Next.js" em cada resposta. Não impede
   * ataque nenhum sozinho, mas poupa ao atacante o trabalho de descobrir a que
   * CVEs vale a pena tentar — e não custa nada.
   */
  poweredByHeader: false,

  /*
   * As imagens de canal vêm do bucket R2, e o `next/image` recusa por omissão
   * tudo o que não esteja aqui. Não é chatice: é o que impede que gravar um
   * `logo_url` apontado a um servidor de fora ponha o nosso optimizador a
   * buscar-lhe conteúdo — e a servi-lo com o nosso domínio por cima.
   *
   * Sem `R2_PUBLIC_URL` não se declara padrão nenhum: um `remotePatterns` vazio
   * é exactamente o comportamento de antes deste upload existir.
   *
   * A dupla com o `foreignImages()` de `app/admin/canais/actions.ts` é
   * deliberada: um recusa gravar o que não é nosso, o outro recusa servi-lo.
   */
  images: R2_PUBLIC
    ? {
        remotePatterns: [
          {
            protocol: R2_PUBLIC.protocol.replace(":", "") as "https" | "http",
            hostname: R2_PUBLIC.hostname,
            pathname: "/**",
          },
        ],
      }
    : undefined,

  /*
   * NOTA: não se liga `experimental.authInterrupts`.
   *
   * Chegou a estar ligado, para usar `forbidden()` + `app/forbidden.tsx` e ter
   * um 403 com status certo. Foi retirado depois de medir: o `forbidden()` num
   * layout não impede a página do mesmo segmento de renderizar e de ir no
   * payload — ou seja, dava o status certo E a fuga de dados ao mesmo tempo.
   * Ver o comentário no topo de `proxy.ts`, que é onde o corte passou a ser
   * feito, e `app/sem-acesso/page.tsx` para o que se perdeu na troca.
   *
   * Fica assim menos uma flag experimental numa app com clientes a pagar.
   */

  async headers() {
    return [
      {
        // Tudo: páginas, estáticos e rotas de API.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      {
        // Só páginas. Num JSON de API um CSP é inerte, e mantê-lo fora daqui
        // deixa claro qual é o alcance real da política.
        source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
        headers: [{ key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY }],
      },
      {
        // Nada do que a API devolve é público: as respostas são todas
        // personalizadas (bilhetes, direitos, sessões). Um intermediário a
        // guardar isto em cache servia os dados de uma pessoa a outra.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
