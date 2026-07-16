# 🔌 Serviços Externos & Integrações

> 🔒 fixo · ✏️ preencher · ☑️ escolher

## Pagamentos ⚠️ decisão em aberto — ver [docs/PAGAMENTOS.md](docs/PAGAMENTOS.md)
- ☑️ **Provedor:**
  - [ ] Nenhum (grátis)
  - [ ] Polar (MoR) — **trata do IVA, mas NÃO faz MB WAY** ← conflito com o requisito
  - [ ] Lemon Squeezy (MoR)
  - [ ] Stripe (MB WAY limitado)
  - [x] **A decidir** — provável **IfthenPay ou Eupago** (MB WAY + Multibanco nativos, PT), com o custo de sermos nós/a liga o comerciante (tratamos do IVA).
- ✏️ **Modelo:** subscrição mensal por tier (por liga) + possível **PPV por evento** para eventos grandes.
- ✏️ **Planos & preços:** definidos por cada liga. Ref. SmokingBars: 3,50€ (Acesso Antecipado) · 8,59€ (Live Stream).
- ✏️ **Moeda:** EUR.
- 🔒 **Requisito duro:** **MB WAY** é prioritário (é o que o público PT usa nos bilhetes). O trade-off MoR-vs-MB WAY está tratado em [docs/PAGAMENTOS.md](docs/PAGAMENTOS.md).

## Vídeo / Streaming (adição à stack base)
- ☑️ **Provedor:**
  - [x] **Cloudflare Stream** (default — barato, ~1€/1000 min entregues)
  - [ ] Mux (mais caro, features de topo)
- 🔒 **Ingest:** RTMP/RTMPS a partir do **OBS** (o que as ligas já usam).
- 🔒 **VOD:** gravação automática da live → arquivo gated (argumento de venda).
- 🔒 **Acesso:** signed URLs / signed playback tokens de curta duração (nunca URL público).
- ☑️ **DRM (Widevine/FairPlay):** [x] Fase 2 (se aparecer captura de ecrã séria) · [ ] MVP.

## Comunicação
- 🔒 **Email transacional:** Resend (ver [Backend](03-BACKEND.md)).
- ☑️ **Email marketing / newsletter:** [ ] Não · [x] Resend Broadcasts (avisos de evento) · [ ] Outro: `________`

## IA
- ☑️ **LLM:** [x] Não (MVP) · [ ] Anthropic Claude
  - _Futuro: moderação de chat, legendas._

## Outras integrações
- ✏️ **OAuth / login social:** Google (opcional).
- ✏️ **APIs externas:** Cloudflare Stream (vídeo) · provedor de pagamento MB WAY (IfthenPay/Eupago).
- ✏️ **Quotas / rate limits a vigiar:** minutos entregues do Cloudflare Stream (custo) · limites/rate do provedor de pagamento · nº de sessões concorrentes por conta.

## Conformidade (checklist)
- [ ] Política de privacidade + termos
- [ ] Banner de cookies (se aplicável)
- [ ] Processamento de dados / RGPD mapeado (ver [04-BASE-DE-DADOS.md](04-BASE-DE-DADOS.md))
- [ ] Páginas legais ligadas no footer
- [ ] Termos anti-partilha de conta (base para banir fugas)
