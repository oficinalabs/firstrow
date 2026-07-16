# Spec do MVP — Fase 0 (Piloto SmokingBars)

## Objetivo
Provar, **num evento real**, que mover a live da SmokingBars para trás do controlo de acesso da FirstRow **tapa a fuga** — quem via à borla por link deixa de conseguir, e isso vê-se nos números.

**Hipótese a validar:** fechar o acesso converte/bloqueia os ~20 borlistas por evento; a contagem de pagantes sobe e a fuga vai a ~0.

## Âmbito (o mínimo que prova a tese)

### Dentro
- Conta (Better Auth, email + password).
- **Compra one-off (PPV) de 1 evento** via **MB WAY**. (Subscrição recorrente fica para a Fase 1.)
- Ingest da live via **OBS → Cloudflare Stream**.
- Página de visualização **gated**: só logado + com acesso; **token assinado curto** + **1 sessão concorrente** + **watermark** com o email.
- **VOD** automático do evento, acessível a quem comprou.
- Painel mínimo de métricas (acessos vendidos, pico de concorrentes, 2ªs sessões bloqueadas).
- Páginas legais (privacidade + termos com cláusula anti-partilha).

### Fora (fica para depois)
- Multi-tenant / co-branding (Fase 2) — o piloto é **single-tenant** (só SmokingBars).
- Segundo tier (conteúdo/acesso antecipado) e subscrição recorrente (Fase 1).
- DRM (Fase 2).
- Login Google, catálogo de VODs, app nativa.

## Fluxos

### A. Espectador compra e vê
1. Página pública do evento (cartaz, data, preço, "Comprar acesso").
2. Criar conta / entrar (email + password).
3. Pagar por **MB WAY** (one-off). Webhook confirma → cria `entitlement` (user × evento).
4. Quando a live está no ar, aparece "Ver em direto".
5. Página de visão: o servidor verifica acesso + concorrência → emite **token Cloudflare curto** → o player carrega com **overlay de watermark** (email a mudar de posição). **Heartbeat** ~20s; 2ª sessão da mesma conta é recusada.
6. Depois do evento: a mesma página serve o **VOD** (mesmo gating).

### B. SmokingBars transmite
1. Evento criado (título, data, preço) — no piloto, criado por ti.
2. FirstRow provisiona um **live input** no Cloudflare Stream → devolve **URL RTMP + chave**.
3. SmokingBars cola no OBS e entra no ar.
4. Estado "live" (webhook do Cloudflare ou toggle manual) → espectadores podem ver.
5. No fim, o Cloudflare grava automaticamente → **VOD** ligado ao evento.

### C. Prova
- Painel: nº de acessos vendidos, nº de contas, **pico de espectadores concorrentes**, tentativas de 2ª sessão bloqueadas.
- Comparar os pagantes com a fuga habitual (~20/evento).

## Arquitetura (ver [ARQUITETURA.md](ARQUITETURA.md))
Stack do template + Cloudflare Stream. Componentes-chave:
- **Auth:** Better Auth (email + password).
- **Pagamentos:** IfthenPay/Eupago MB WAY one-off + webhook (Route Handler, assinatura verificada) → `entitlements`.
- **Vídeo:** Cloudflare Stream — API de live inputs (criar input, obter RTMP), **signed playback tokens** (JWT com a chave do Cloudflare), webhooks de estado (live / VOD pronto).
- **Gating/segurança:** endpoint que emite o token só após (sessão + entitlement + concorrência); `playback_sessions` + endpoint de heartbeat; overlay de watermark client-side.

## Modelo de dados (subconjunto MVP)
- `users` (Better Auth)
- `events(id, title, starts_at, price_cents, status, cf_live_input_id, cf_vod_uid)`
- `entitlements(id, user_id, event_id, status, provider_ref, created_at)`
- `playback_sessions(id, user_id, event_id, started_at, last_heartbeat_at, revoked_at)`

Single-tenant: sem tabela `tenants` ainda (entra na Fase 2).

## Serviços externos & setup
| Serviço | Para quê | Setup |
|---|---|---|
| Cloudflare Stream | live + VOD + tokens | conta CF, API token, chave de assinatura |
| IfthenPay **ou** Eupago | MB WAY | conta + credenciais + webhook (🔴 decisão — ver [PAGAMENTOS.md](PAGAMENTOS.md)) |
| Supabase | Postgres | projeto + connection string |
| Vercel | deploy | ligar repo |
| Resend | emails | domínio + API key |

## Esforço (estimativa — dev solo + IA)
| Bloco | Dias |
|---|---|
| Scaffold app (Next.js, Better Auth, Drizzle, Supabase, Vercel, CI) | 2 |
| Contas + páginas de auth | 1 |
| Evento: modelo + página pública + criar-evento (admin) | 1–2 |
| **Pagamentos MB WAY** (integração + webhook + entitlement) | 2–3 |
| **Cloudflare Stream** (live input, RTMP, token assinado, webhooks) | 2–3 |
| **Página de visão** (gating + player + watermark + concorrência/heartbeat) | 2–3 |
| Painel de métricas | 1 |
| Emails (recibo / "vai começar") | 0.5–1 |
| Testes E2E + ensaio com OBS + polish + páginas legais | 2–3 |
| **Total** | **~14–19 dias focados (~3–5 semanas)** |

Os dois blocos de risco que podem estourar o prazo: **pagamentos MB WAY** e **vídeo/concorrência**. Faz esses dois primeiro (spikes) para tirar a incerteza cedo.

## Custo de operação (piloto)
Quase tudo escala com o uso — **não há custo fixo grande**:
- **Cloudflare Stream:** ~1€/1000 min entregues + ~5$/1000 min armazenados. Um evento de 2h com ~55 espectadores ≈ **~30–50€/evento**. Escala com a audiência (logo, com a receita).
- **Vercel / Supabase / Resend / Sentry / PostHog:** tiers grátis chegam para o piloto (0€; só ~20–25€/mês cada se precisares de Pro).
- **Pagamento (IfthenPay/Eupago):** taxa por transação (~1,5–2% + fixo), sai da receita; pouco ou nenhum fixo mensal.
- **Domínio** `joinfirstrow.com`: ~10–15€/ano (ainda por comprar).

Resumo: **~0€ fixo + ~30–50€ por evento.** O MVP não custa quase nada a manter até alguém ver.

## Riscos & notas honestas
- **MB WAY é a maior incógnita** (decisão em aberto + integração). Valida em sandbox antes de te comprometeres com o resto.
- **Watermark visível é dissuasor, não à prova de tudo** — um overlay client-side pode ser removido do DOM por quem sabe. O que segura o acesso é o **token de servidor + 1 sessão**; a watermark serve para denunciar/assustar. Watermark "queimada" no vídeo (forense a sério) é mais cara → Fase 2 se for preciso.
- **Ensaio com OBS** com o streamer da SmokingBars **antes** do evento real (a noite do evento não pode ser o primeiro teste).
- **Legal antes de cobrar:** política de privacidade + termos (cláusula anti-partilha de conta) + RGPD básico.

## Definição de "pronto" (Fase 0)
Um evento real da SmokingBars corre 100% na FirstRow: pagamento MB WAY a funcionar, live estável a partir do OBS, acesso fechado (0 links a circular), VOD disponível a seguir, e um número claro de pagantes para comparar com o histórico do Patreon.
