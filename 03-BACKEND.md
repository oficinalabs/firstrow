# ⚙️ Backend

> 🔒 fixo · ✏️ preencher · ☑️ escolher

## API
- 🔒 **Runtime:** Next.js server (Node).
- ☑️ **Estilo de API:**
  - [x] Server Actions (default — mutações da app)
  - [x] Route Handlers — **webhooks de pagamento** e **endpoints de vídeo** (mint de token de reprodução, heartbeat de concorrência)
  - [ ] tRPC
- 🔒 **Validação:** Zod em **todas as fronteiras** (input nunca é de confiança).

## Autenticação & autorização
- ☑️ **Auth:**
  - [x] Better Auth (default — dono dos users, dados na UE, sem custo/MAU)
  - [ ] Supabase Auth (RLS)
  - [ ] Clerk (SSO / SAML enterprise)
  - [ ] Nenhuma (site público)
- ✏️ **Métodos de login:** email + password (obrigatório); Google (opcional). **Sem magic-link partilhável** para conteúdo — a sessão é que dá acesso, não um link.
- ☑️ **Multi-tenant (equipas / workspaces):** [ ] Não · [x] Sim — **cada liga/criador é um tenant**.
- ✏️ **Papéis / permissões:** `platform_admin` (nós) · `tenant_owner` (a liga) · `tenant_staff` (equipa da liga) · `viewer` (subscritor). Autorização verificada no servidor em todas as fronteiras.

## Trabalho assíncrono
- ☑️ **Jobs & cron:**
  - [x] Inngest (default — event-driven, sem workers)
  - [ ] Trigger.dev (long-running / AI)
  - [ ] GitHub Actions (batch de dados)
  - [ ] Nenhum
- ✏️ **Jobs previstos:** processar/registar o **VOD** no fim da live · sincronizar **estado de subscrições** a partir dos webhooks de pagamento · **limpar sessões de visualização** expiradas (concorrência) · enviar emails (novo evento, recibo) · (futuro) processar **relatórios de fuga**.

## Serviços de backend
- 🔒 **Email transacional:** Resend + React Email.
  - ✏️ **Emails previstos:** boas-vindas · confirmação/recibo de subscrição · "o evento vai começar" · reset de password · aviso de fim de subscrição.
- ☑️ **IA / LLM:** [x] Não (no MVP) · [ ] Claude API (Anthropic SDK)
  - _Futuro possível: moderação de chat da live, legendas automáticas de VOD._
- ☑️ **Storage de ficheiros:** [x] Nenhum próprio — os vídeos vivem no **Cloudflare Stream**; imagens (cartazes/OG) em Cloudflare R2 se preciso.

## Segurança de acesso (core do produto — ver [docs/SEGURANCA-E-ANTIPIRATARIA.md](docs/SEGURANCA-E-ANTIPIRATARIA.md))
- 🔒 Reprodução só com **token assinado de curta duração**, emitido pelo servidor após verificar (a) sessão válida, (b) direito (entitlement) ao conteúdo, (c) **concorrência** (1 sessão a ver por conta).
- 🔒 **Heartbeat** do player regista a sessão ativa; segunda reprodução na mesma conta é recusada ou mata a primeira.
- 🔒 **Watermark dinâmica** por espectador (email/id) sobreposta no player.

## Regras fixas
- 🔒 **Segredos:** só em variáveis de ambiente; `.env.example` sempre atualizado.
- 🔒 **Webhooks:** verificar assinatura, responder rápido, processar em job.
- ✏️ **Rate limiting:** no **login** (por conta + IP), no **mint de token de reprodução** e no **heartbeat**. Objetivo: travar brute-force e abuso de emissão de tokens. (Upstash Ratelimit / middleware.)
