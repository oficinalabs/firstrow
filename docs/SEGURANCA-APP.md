# Segurança da aplicação — quem acede a quê, e como se garante

> Estado: verificado a **19 de julho de 2026** contra o build de **produção**
> (`pnpm build && pnpm start`) e a base de dados **Neon real**.
> Frente B (autorização, blindagem de rotas e segredos).

Este documento é o mapa de quem pode o quê e, mais importante, **como é que
isso é garantido** — porque em Next 16 o sítio onde se põe o gate muda o
resultado, e há sítios que parecem seguros e não são. A secção
[As três barreiras](#as-três-barreiras) explica porquê; começa por aí se só
leres uma coisa.

---

## Princípios

1. **A base de dados manda.** O papel vive na coluna `user.role`. O que chega
   ao browser serve para pintar ecrãs; autorizar é sempre no servidor, a cada
   pedido (`server/authz.ts`).
2. **Cada camada defende-se sozinha.** Nenhuma rota confia em ter sido
   protegida mais acima. Um route handler não herda o gate do layout, e um
   layout não protege a página do mesmo segmento (ver
   [a fuga que isto fechou](#a-fuga-que-isto-fechou)).
3. **401 é "não sei quem és". 403 é "sei e não podes".** Recurso que não é teu
   responde **404** — um 403 confirmaria que existe.
4. **O erro cai para o lado seguro.** Papel desconhecido é tratado como o menos
   poderoso, nunca como acesso.
5. **Nada de segredos no cliente.** Verificado com o bundle na mão, não por fé
   — ver [Auditoria de segredos](#auditoria-de-segredos).

---

## Papéis

| Papel            | O que abre                                                       |
| ---------------- | ---------------------------------------------------------------- |
| `platform_admin` | Tudo. Somos nós.                                                  |
| `league_owner`   | Gere a liga: eventos, dinheiro, compradores.                      |
| `league_staff`   | **Opera** um evento a decorrer: transmissão e validação à porta.  |
| `viewer`         | Compra e vê. É o valor por omissão de qualquer conta nova.        |

Predicados (`server/authz.ts`, puros, sem I/O):

- `isPlatformAdmin` → `platform_admin`
- `canManageEvents` → `platform_admin` + `league_owner`
- `canOperateEvents` → `platform_admin` + `league_owner` + `league_staff`

---

## Matriz de autorização

### Páginas

| Rota            | Anónimo                | `viewer`               | `league_staff`         | `league_owner` / `platform_admin` | Onde é decidido                     |
| --------------- | ---------------------- | ---------------------- | ---------------------- | --------------------------------- | ----------------------------------- |
| `/`, `/sobre`, `/criadores`, `/canal/**` | ✅ | ✅ | ✅ | ✅ | público |
| `/eventos/[id]` | ✅                     | ✅                     | ✅                     | ✅                                | público (a compra é que fecha)      |
| `/eventos/[id]/ver` | → `/eventos/[id]`  | só com direito ativo   | idem                   | idem                              | página + `hasActiveEntitlement`     |
| `/conta`        | → `/entrar?next=`      | ✅ (só os seus dados)  | ✅                     | ✅                                | `proxy.ts` + página                 |
| `/bilhetes`     | → `/entrar?next=`      | ✅ (só os seus)        | ✅                     | ✅                                | `proxy.ts` + página                 |
| `/admin/**`     | → `/entrar?next=`      | → `/sem-acesso` (403)  | → `/sem-acesso` (403)  | ✅                                | **`proxy.ts`** + `app/admin/layout.tsx` |
| `/sem-acesso`   | ✅                     | ✅                     | ✅                     | ✅                                | público (é a página de recusa)      |

> **Porque é que `league_staff` não entra no `/admin`:** quase nenhuma página do
> backoffice tem gate próprio, por isso o gate do layout é o gate efetivo de
> `/admin/ganhos` e `/admin/subscritores` — dinheiro e dados pessoais de
> compradores. Abrir o backoffice ao staff para lhes dar o scanner dava-lhes a
> contabilidade ao mesmo tempo. A **API** do scanner já aceita staff
> (`canOperateEvents`) e fica à espera de que a Frente D ponha gates página a
> página; nessa altura este gate pode aliviar para `canOperateEvents`.

### Rotas de API e route handlers

| Rota                                        | Regra                          | Anónimo | `viewer` | `league_owner` |
| ------------------------------------------- | ------------------------------ | ------- | -------- | -------------- |
| `POST /api/admin/events`                    | `canManageEvents`              | 401     | 403      | ✅             |
| `POST /api/tickets/validate`                | `canOperateEvents` + limite    | 401     | 403      | ✅             |
| `GET /admin/eventos/[id]/bilhetes/export`   | `canManageEvents`              | 307¹    | 307¹     | ✅             |
| `GET /admin/eventos/[id]/transmissao/live`  | `canOperateEvents`             | 307¹    | 307¹     | ✅             |
| `POST /api/playback/[id]/session`           | sessão + **direito** + limite  | 401     | 403²     | 403²           |
| `POST /api/playback/[id]/heartbeat`         | sessão + posse da sessão       | 401     | `{active:false}` | —      |
| `GET /api/entitlements/[id]`                | sessão (só a própria conta)    | 401     | ✅       | —              |
| `POST /api/checkout/[id]`                   | sessão + limite                | 401     | ✅       | —              |
| `POST /api/tickets/checkout/[id]`           | sessão + limite                | 401     | ✅       | —              |
| `GET /api/tickets/status/[id]`              | sessão + **dono** do bilhete   | 401     | **404**³ | —              |
| `POST /api/auth/**`                         | público, com limite            | ✅      | ✅       | ✅             |
| `POST /api/webhooks/eupago`                 | assinatura HMAC                | 401⁴    | —        | —              |

¹ Vivem debaixo de `/admin/**`, por isso é o `proxy.ts` que os apanha primeiro
e redireciona. O gate próprio (`canManageEvents` / `canOperateEvents`) continua
lá por baixo, para o caso de o matcher do proxy falhar.
² Correto: o acesso à reprodução é o **direito comprado**, não o papel. Um
admin sem bilhete também não vê — e é isso que se quer.
³ **404 e não 403**, de propósito: a query filtra por dono, por isso um bilhete
de outra pessoa é indistinguível de um bilhete inventado. Enumerar ids não
devolve informação nenhuma.
⁴ Sem assinatura válida não passa. A verificação é HMAC-SHA256 do corpo cru com
comparação em tempo constante (`timingSafeEqual`), feita **antes** do `JSON.parse`.

---

## As três barreiras

### 1. `proxy.ts` — corta à entrada

Chama-se `proxy.ts` e não `middleware.ts` porque o Next 16 deu o convénio
`middleware` por descontinuado (o build avisa) e renomeou-o. Mesmo sítio na
cadeia, mesma API, runtime Node fixo.

- `/conta`, `/bilhetes` → confirma que **existe** cookie de sessão. Sem BD.
- `/admin/**` → lê a sessão **a sério** e decide o papel.

**Sim, isto consulta a base de dados em `/admin` — e é deliberado.** O plano
original era o clássico "proxy só espreita o cookie, o servidor decide o
papel". Testou-se e **não chega**. Ver a secção seguinte.

O custo está contido: a ida à BD é só em `/admin/**` (meia dúzia de pessoas,
páginas que já falam com a BD de qualquer forma). As superfícies pessoais
continuam com o corte barato do cookie, porque aí o pior caso é inofensivo —
essas páginas só mostram dados da própria conta e vão buscá-los já filtrados
pelo id da sessão lida no servidor.

### 2. Gates de servidor — `server/authz.ts`

Cada página e cada route handler repete o seu gate. `app/admin/layout.tsx` usa
`requireUser` + `canManageEvents`. Se o matcher do proxy falhar ou alguém lhe
mexer, o backoffice não abre à mesma.

### 3. `server/api-guard.ts` — o adaptador HTTP

Um sítio só onde vivem os 401/403 das rotas de API, para não haver dez cópias
do mesmo `if`. As rotas de API **não estão no matcher do proxy**, de propósito:
uma API cuja única proteção fosse um padrão de matcher ficava aberta ao primeiro
erro de padrão — e isso não é teórico, foi a classe de bugs das
CVE-2026-44573/44574/44575, em que variantes `.rsc` e query params chegavam à
página sem passar pelo matcher.

---

## A fuga que isto fechou

**O achado mais importante desta frente, e não estava na lista de tarefas.**

No App Router, o layout e a página do mesmo segmento renderizam **em
paralelo**, não em sequência. Quando o gate vive no layout, a página já correu
as queries e já está a escrever o resultado no payload em streaming antes de o
layout ter maneira de a travar.

Medido com uma conta `viewer` autenticada a pedir `/admin`, contra o build de
produção:

| Gate no `app/admin/layout.tsx`      | Status | Corpo da resposta                                        |
| ----------------------------------- | ------ | -------------------------------------------------------- |
| `forbidden()` (Next 16)             | 200    | ❌ `"Receita · julho"`, `"7,50 €"`, `"1 compras este mês"` |
| devolver `<Forbidden/>` sem children| 200    | ❌ a mesma fuga                                            |
| `redirect("/sem-acesso")`           | 200    | ❌ a mesma fuga                                            |
| **corte no `proxy.ts`**             | **307**| ✅ 11 bytes, zero dados                                    |

Ou seja: **o `redirect("/")` que aqui estava antes desta frente também fugia.**
O ecrã ficava correto — a pessoa era mandada para fora — e os números da liga
iam à mesma para o browser de quem não os devia ver. Bastava abrir o
código-fonte da página.

Não há forma de um layout impedir os filhos de renderizar. A única barreira que
corta **antes de a página existir** é o proxy. É por isso que ele consulta a BD
em `/admin`, contra a regra geral de não o fazer.

---

## O preço: o status do 403

`/admin` para quem não tem papel responde **307** para `/sem-acesso`, e essa
página responde 200. Não é um 403 de verdade, e isso é uma perda real: quem
quiser contar 4xx no CDN para detetar alguém a bater a portas fechadas não os
vê aqui.

Foi uma troca deliberada, depois de esgotar as alternativas:

- `NextResponse.rewrite(url, { status: 403 })` → o `status` **é ignorado**
  ([vercel/next.js#50155](https://github.com/vercel/next.js/issues/50155),
  aberto desde 2023).
- `forbidden()` + `app/forbidden.tsx` (com `experimental.authInterrupts`) →
  num layout dá 200 **e** a fuga acima; numa página devolveu 404 e renderizou o
  not-found. A flag foi retirada — menos uma experimental numa app com clientes.
- Um route handler a devolver HTML com status 403 → dava o status certo, mas
  obrigava a manter o 403 em HTML à mão, fora do design system.

**Um status certo com fuga de dados vale menos do que um status morno sem fuga
nenhuma.** Se o `#50155` fechar, passa a dar para ter as duas coisas: o proxy
faz `rewrite` para `/sem-acesso` com 403 e mantém-se o URL original.

---

## Auditoria de segredos

Método: `pnpm build`, e depois procurar no bundle público (`.next/static/`,
38 ficheiros) o **valor** real de cada variável de ambiente — não o nome.

| Segredo                             | No bundle? |
| ----------------------------------- | ---------- |
| `BETTER_AUTH_SECRET`                | ✅ ausente |
| `DATABASE_URL`                      | ✅ ausente |
| `CLOUDFLARE_ACCOUNT_ID`             | ✅ ausente |
| `CLOUDFLARE_STREAM_API_TOKEN`       | ✅ ausente |
| `CLOUDFLARE_STREAM_SIGNING_KEY_ID`  | ✅ ausente |
| `CLOUDFLARE_STREAM_SIGNING_KEY_JWK` | ✅ ausente |
| `EUPAGO_API_KEY`                    | ✅ ausente |
| `GOOGLE_CLIENT_SECRET`              | ✅ ausente |
| `RESEND_API_KEY`                    | ✅ ausente |
| `NEXT_PUBLIC_APP_URL`               | presente — é para ser |

Padrões genéricos (`postgres://`, `-----BEGIN … PRIVATE KEY-----`, JWT,
`Bearer …`, `re_…`): **nenhum** no bundle público.

Um falso positivo digno de nota: `BETTER_AUTH_URL` aparece — porque tem o
**mesmo valor** que `NEXT_PUBLIC_APP_URL` (a origem pública da app). Não é
segredo.

**Respostas de API:** o checkout e o checkout de bilhetes deixaram de devolver
a resposta crua da Eupago ao browser. Traz referências e identificadores do
nosso contrato que o cliente não precisa de ver; agora vai `{ ok: true }` e,
nos bilhetes, o `ticketId` (que é o que o polling usa). Nenhum cliente lia o
campo `payment` — confirmado antes de o remover.

**Guardas de build.** Ficheiros que tocam em segredos passaram a começar com
`import "server-only"`. Se algum dia um componente `"use client"` os importar,
direta ou indiretamente, **o build parte** com um erro que aponta ao import
culpado. Não é preciso instalar nada: o Next resolve `server-only` internamente.

- `lib/server-env.ts` — o leitor genérico de segredos
- `lib/cloudflare.ts` — token da API + chave que assina os tokens de reprodução
- `lib/eupago.ts` — chave da API + segredo do webhook
- `app/admin/eventos/[id]/transmissao/stream-credentials.ts` — **a chave RTMPS**

> **Sobre a chave de stream (RTMPS).** É o segredo mais perigoso do repositório
> e não é pela razão óbvia. Um token de reprodução que fuja deixa uma pessoa
> **ver** de graça; a chave de stream deixa **emitir** — quem a tiver transmite
> para dentro do evento e o que aparece no ecrã de toda a gente que pagou passa
> a ser dele. Não é acesso indevido, é sequestro da emissão.
> O `masked` no `<CopyField>` é conforto visual, não proteção: o valor vai à
> mesma no payload RSC para o browser de quem abrir a página. O que protege
> isto a sério é o gate do servidor no backoffice.

**Nada de segredos em URLs.** Uma exceção assumida: o token de reprodução vai
no caminho do URL do iframe (`iframe.cloudflarestream.com/<token>`) — é o
mecanismo da Cloudflare, não uma escolha nossa. Está mitigado por TTL de 120 s
e pelo `Referrer-Policy`.

---

## Rate limiting — e a limitação, dita como é

`lib/rate-limit.ts`, partilhado. Políticas num sítio só:

| Balde            | Limite   | Chave           | Onde                                             |
| ---------------- | -------- | --------------- | ------------------------------------------------ |
| `auth`           | 10/min   | IP + caminho    | `/sign-in/email`, `/sign-up/email`, reset        |
| `authEmail`      | 4/min    | IP + caminho    | pedidos que disparam email                       |
| `playback`       | 12/min   | conta           | mint do token de reprodução                      |
| `ticketValidate` | 30/min   | **operador**    | validação de QR à porta                          |
| `checkout`       | 8/min    | conta           | iniciar pagamentos MB WAY                        |

**Porquê por IP no login e não por conta:** travar por conta deixava um atacante
trancar a conta de outra pessoa à vontade — bastava saber o email, que é público.
O limite viraria a arma (*lockout-as-DoS*). O IP é quem paga a fatura do que
está a tentar. (OWASP Authentication Cheat Sheet.)

**Porquê por operador na porta:** numa porta com fila, o staff sai todo pelo
mesmo router. Um balde por IP bloqueava a equipa inteira quando um telemóvel
encravasse a repetir pedidos.

### ⚠️ Isto vive em memória, por instância

Os contadores estão num `Map` no processo. Na Vercel a app corre em várias
instâncias em paralelo, cada uma com o seu `Map`, e uma instância fria começa a
contar do zero. **O limite efetivo é, no pior caso, `limite × nº de instâncias
ativas`.** Não há forma honesta de contornar isso sem um contador partilhado.

O que **defende mesmo**: o ataque de origem única (o caso comum), o scanner
encravado em loop, e o pico que fazia disparar a fatura. O que **não** defende:
um atacante distribuído por muitos IPs, ou com paciência para esperar pelo
reciclar das instâncias.

Não escrever "temos rate limiting" em material comercial sem esta nota ao lado.

**Upgrade quando houver orçamento** (~10 min, o mais barato primeiro):
1. Upstash Redis pelo Marketplace da Vercel (o Vercel KV foi descontinuado e
   migrado para lá em dez/2024) + `@upstash/ratelimit`. Trocar o `hit()` de
   `lib/rate-limit.ts` por um `INCR`+`EXPIRE` atómico — a superfície pública
   (`checkRateLimit`, `limitByIp`) foi desenhada para essa troca não tocar em
   nenhuma rota. Bónus: o Better Auth aceita `rateLimit.storage:
   "secondary-storage"` e os limites dele passam a ser distribuídos de borla.
2. Uma regra de rate limit no WAF da Vercel (grátis até 1 M pedidos), à frente
   de tudo.

Proteção de memória: teto de 10 000 chaves e limpeza preguiçosa disparada por
volume de chamadas (não por `setInterval` — numa função serverless a instância
congela entre invocações e um temporizador não tem garantia de disparar).

---

## Cabeçalhos de segurança

Em `next.config.ts`. A regra que decidiu tudo: **um cabeçalho que parte o
player a meio de um evento pago faz mais estragos do que o ataque de que
defende.** Cada um foi escolhido contra as duas integrações que a app não pode
perder — o iframe do Cloudflare Stream e o login com Google.

| Cabeçalho                     | Valor                                   |
| ----------------------------- | --------------------------------------- |
| `Strict-Transport-Security`   | `max-age=63072000; includeSubDomains`   |
| `X-Content-Type-Options`      | `nosniff`                               |
| `Referrer-Policy`             | `strict-origin-when-cross-origin`       |
| `X-Frame-Options`             | `DENY`                                  |
| `Content-Security-Policy`     | `frame-ancestors 'none'`                |
| `Cross-Origin-Opener-Policy`  | `same-origin-allow-popups`              |
| `Permissions-Policy`          | ver abaixo                              |
| `X-XSS-Protection`            | `0`                                     |
| `Cache-Control` (só `/api/*`) | `no-store, max-age=0`                   |
| `x-powered-by`                | **removido** (`poweredByHeader: false`) |

**`frame-ancestors 'none'` importa mais aqui do que na maioria dos sites:** esta
plataforma vende acesso a vídeo. Sem isto, qualquer pessoa metia a página do
player dentro de um site próprio e revendia o que nós cobramos. (Atenção à
direção: isto diz quem pode embeber **nós**. O iframe do Cloudflare é o
contrário — nós a embeber terceiros — e não é afetado.)

### Permissions-Policy: o mais fácil de estragar

O que **não** está na lista fica proibido para a página **e para os iframes
dela**. O atributo `allow` de um iframe só aperta o que o cabeçalho já deu;
nunca alarga. Cada permissão aberta aponta a uma linha de código real:

- `camera=(self)` → `components/tickets/scanner.tsx` (`getUserMedia`, ler o QR à porta)
- `autoplay`, `encrypted-media`, `picture-in-picture`, `accelerometer`,
  `gyroscope`, `fullscreen` = `(self "https://iframe.cloudflarestream.com")` →
  o `allow` do iframe em `components/player/watch-player.tsx`

Tudo o resto leva `()`. **A `camera` é a armadilha:** as listas de "hardening"
que se copiam da internet negam-na sempre — e negá-la aqui deixava a equipa sem
scanner à porta de um evento esgotado.

### CSP completo: em modo de relatório, de propósito

Além do `frame-ancestors` (que é *enforcing* e não parte nada), vai um
`Content-Security-Policy-Report-Only` com a política toda. O browser avalia e
**grita na consola o que teria bloqueado**, sem bloquear. Passa a haver
evidência em vez de opinião.

**Para promover a *enforcing*** (a decisão é do dono do projeto):
1. correr um evento real de ponta a ponta — OBS → live → player → fim;
2. login por email e por Google, comprar um bilhete, validar um QR;
3. tudo em Chrome, Safari e Firefox, de olho na consola;
4. zero violações inesperadas → mudar a chave do cabeçalho em `next.config.ts`
   de `Content-Security-Policy-Report-Only` para `Content-Security-Policy`.

### O que ficou de fora, e porquê

| Não ligado                          | Razão                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `Cross-Origin-Embedder-Policy`      | `require-corp` **parte o iframe do Cloudflare** (COEP herda para iframes e a Cloudflare não envia CORP). O `credentialless` não tem Safari. E não ganhávamos nada: só serve para `SharedArrayBuffer`. |
| `Cross-Origin-Resource-Policy`      | `same-origin` bloquearia clientes de email a carregar o cartaz nos nossos emails (`emails/vai-comecar.tsx`). |
| `COOP: same-origin` (estrito)       | Parte OAuth em popup (`window.opener` a `null`). Hoje o Google entra por redirecionamento, mas bastava ligar o One Tap. Usada a variante `-allow-popups`. |
| `HSTS ... ; preload`                | Semi-irreversível (sair da lista demora meses) e o domínio definitivo do projeto ainda nem está comprado.   |
| CSP com nonce + `strict-dynamic`    | Obriga **todas** as páginas a renderização dinâmica: adeus estático/ISR, precisamente nas noites de evento. Não compensa numa app sem scripts de terceiros. |
| `experimental.authInterrupts`       | Ver [O preço: o status do 403](#o-preço-o-status-do-403).                                                   |

---

## O que foi verificado

Build de produção + Neon real, com duas contas de teste criadas para o efeito:
`qa.porta@firstrow.dev` (`viewer`) e `qa.gestor@firstrow.dev` (`league_owner`).

**Rotas**

- Anónimo em `/admin`, `/admin/ganhos`, `/conta`, `/bilhetes` → **307** para
  `/entrar?next=…` com o destino correto em cada uma.
- `viewer` autenticado em `/admin`, `/admin/eventos`, `/admin/ganhos`,
  `/admin/subscritores`, `/admin/scanner` → **307** para `/sem-acesso`, corpo de
  **11 bytes**, zero dados de backoffice.
- `league_owner` nas mesmas cinco → **200**. Vale a pena notar: esta conta
  **não** está no `ADMIN_EMAILS` e entra pelo papel na BD — o que era impossível
  antes desta frente, porque o gate era o email.
- Matriz de API completa (tabela acima) — todos os valores confirmados.
- `GET /api/tickets/status/<id de outro dono>` → **404**, não 403.
- `POST /api/webhooks/eupago` sem assinatura → **401**.

**Rate limiting**

- `/sign-in/email`: 8 tentativas passaram, as seguintes **429** com
  `retry-after: 58`, `x-ratelimit-limit: 10`, `x-ratelimit-remaining: 0`.
- `/api/tickets/validate`: 29 passaram, 5 travadas com **429** (o balde é por
  operador, como desenhado).

**Integrações que não podiam partir**

- Login por email → **funciona** depois dos cabeçalhos (feito pelo browser, na UI).
- Iframe do Cloudflare Stream → **carrega**, e renderizou a UI do player da
  Cloudflare ("Stream has not started yet.", que é a mensagem correta para um
  live input sem emissão). Nem o CSP, nem o `X-Frame-Options`, nem o
  `Permissions-Policy`, nem o COOP o bloquearam.
- Regra de concorrência (1 sessão por conta) → observada a funcionar: abrir uma
  segunda sessão revogou a primeira e o player mostrou "A tua conta começou a
  ver noutro dispositivo".
- **Zero erros de consola. Zero violações de CSP.**

**Qualidade:** `pnpm check`, `pnpm typecheck` e `pnpm build` verdes.

Capturas em `docs/screenshots/blindagem/`.

---

## Dívida conhecida e próximos passos

Achados que ficam registados por não serem desta frente ou por precisarem de
decisão do dono:

1. **`lib/admin.ts` está morto nas APIs mas vivo nas páginas.** Nenhuma rota de
   API o usa. Continua a ser usado por `app/admin/**` (páginas e a server action
   de `transmissao/actions.ts`) — território da Frente D. Quando a D aterrar e
   migrar para `server/authz.ts`, o ficheiro pode ser apagado. **Enquanto lá
   estiver, o `ADMIN_EMAILS` é uma segunda noção de "admin" a correr em
   paralelo com a coluna `role`.**
2. **`server/auth-helper.ts` é o antecessor de `server/authz.ts`.** Já não é
   usado por nenhuma rota de API, mas ainda serve várias páginas de espectador.
   O seu `requireUser()` **não redireciona** (devolve `null`), ao contrário do
   homónimo em `authz.ts` — dois nomes iguais com comportamentos diferentes é
   uma armadilha; vale a pena consolidar.
3. **O heartbeat não revalida o direito.** `server/playback.ts:heartbeat()` só
   vê se a sessão foi revogada. Um reembolso ou estorno a meio de um evento não
   corta quem já está a ver; só bloqueia sessões novas. Aceitável para MVP,
   decisão a tomar de forma consciente.
4. **`accessRules` da Cloudflare por usar.** Sendo a plataforma só-PT, dá para
   restringir o token de reprodução a `country: ["PT"]` com uma regra
   `{"type":"any","action":"block"}` no fim. Barato. Cuidado com falsos
   positivos de GeoIP (VPN, redes móveis).
5. **TTL do token de reprodução por confirmar em evento real.** São 120 s. Não
   está confirmado se a Cloudflare revalida o `exp` por segmento — se revalidar,
   um evento longo cortava aos 2 minutos. **Testar num evento real antes de
   vender bilhetes.**
6. **`lib/env.ts` mistura segredos e valores públicos** no mesmo objeto
   exportado (`BETTER_AUTH_SECRET` ao lado de `NEXT_PUBLIC_APP_URL`). Nada o
   impede hoje de ser passado a um componente de cliente por engano. Separar em
   `env.server.ts` (com `server-only`) e `env.public.ts` fecha isto de vez.
7. **Validar o `next=` no lado que o LÊ.** O `proxy.ts` só produz caminhos
   internos, mas quem lê o `?next=` na página de login deve revalidar antes de
   redirecionar (rejeitar `//evil.pt`, `/\evil.pt`, esquemas embutidos e as
   variantes codificadas). É o padrão do CVE-2022-24858 no NextAuth.
8. **Next.js:** a 16.2.10 está acima de todos os avisos conhecidos
   (CVE-2025-29927, CVE-2025-57822, lote de maio/2026). Foi anunciado um
   programa de *releases* de segurança mensais, com a **primeira a 20 de julho
   de 2026** (4 High + 5 Moderate, detalhes sob embargo). **Atualizar assim que
   sair.**
9. **`components/tickets/scanner.tsx` assume sempre 2xx** (`res.json() as
   ScanOutcome`). Com 401/403/429 fica com um resultado indefinido em vez de
   mostrar um estado. UI, por isso não foi tocado aqui.
