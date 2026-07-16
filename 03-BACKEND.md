# ⚙️ Backend

> 🔒 fixo · ✏️ preencher · ☑️ escolher

## API
- 🔒 **Runtime:** Next.js server (Node).
- ☑️ **Estilo de API:**
  - [x] Server Actions (default)
  - [ ] Route Handlers (REST / webhooks)
  - [ ] tRPC
- 🔒 **Validação:** Zod em **todas as fronteiras** (input nunca é de confiança).

## Autenticação & autorização
- ☑️ **Auth:**
  - [x] Better Auth (default — dono dos users, dados na UE, sem custo/MAU)
  - [ ] Supabase Auth (RLS)
  - [ ] Clerk (SSO / SAML enterprise)
  - [ ] Nenhuma (site público)
- ✏️ **Métodos de login:** `________`  ·  _ex.: email+password, Google_
- ☑️ **Multi-tenant (equipas / workspaces):** [ ] Não · [ ] Sim
- ✏️ **Papéis / permissões:** `________`  ·  _ex.: owner, admin, member_

## Trabalho assíncrono
- ☑️ **Jobs & cron:**
  - [x] Inngest (default — event-driven, sem workers)
  - [ ] Trigger.dev (long-running / AI)
  - [ ] GitHub Actions (batch de dados)
  - [ ] Nenhum
- ✏️ **Jobs previstos:** `________`  ·  _ex.: enviar emails, sync diário_

## Serviços de backend
- 🔒 **Email transacional:** Resend + React Email.
  - ✏️ **Emails previstos:** `________`  ·  _ex.: boas-vindas, reset de password_
- ☑️ **IA / LLM:** [ ] Não · [x] Claude API (Anthropic SDK)
  - ✏️ **Modelo default:** `________`  ·  _ex.: claude-sonnet-5_
- ☑️ **Storage de ficheiros:** [ ] Nenhum · [ ] Supabase Storage · [ ] S3 / R2

## Regras fixas
- 🔒 **Segredos:** só em variáveis de ambiente; `.env.example` sempre atualizado.
- 🔒 **Webhooks:** verificar assinatura, responder rápido, processar em job.
- ✏️ **Rate limiting:** `________`  ·  _onde e que limites_
