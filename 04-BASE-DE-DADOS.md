# 🗄️ Base de Dados

> 🔒 fixo · ✏️ preencher · ☑️ escolher

## Motor & fornecedor
- 🔒 **Motor:** PostgreSQL.
- ☑️ **Fornecedor:**
  - [x] **Neon** (serverless Postgres, scale-to-zero) — free tier generoso (~100 projetos) + MCP oficial. Só como Postgres; a auth é Better Auth.
  - [ ] Supabase (gerido)
  - [ ] Self-host (Coolify / Hetzner)
  - [ ] SQLite / Turso (edge, app pequena)
- ☑️ **ORM:**
  - [x] Drizzle (default — SQL-first, leve)
  - [ ] Prisma 7 (abstração + tooling)

## Convenções de schema (fixas)
- 🔒 Tabelas em `snake_case`, no plural (`users`, `subscriptions`).
- 🔒 Chave primária: `id` (uuid ou cuid2).
- 🔒 Timestamps `created_at` e `updated_at` em todas as tabelas.
- ☑️ **Soft delete (`deleted_at`):** [ ] Não · [x] Sim — em contas e subscrições (auditoria + RGPD).
- ✏️ **Entidades principais:** (esboço — detalhe em [docs/ARQUITETURA.md](docs/ARQUITETURA.md))
  - `tenants` — a liga/criador (multi-tenant)
  - `users` · `memberships` (papel do user num tenant)
  - `tiers` (planos por tenant: ex. Acesso Antecipado, Live Stream) · `subscriptions`
  - `events` · `streams` (a live) · `vod_assets` (a gravação)
  - `entitlements` (o que cada user pode ver)
  - `playback_sessions` (**concorrência** — quem está a ver agora) · `playback_tokens`
  - `payments` / `invoices`
  - `leak_reports` / `bans` (fugas detetadas via watermark)

## Migrations & ambientes
- 🔒 Migrations **versionadas no repo**. Nunca alterar produção à mão.
- 🔒 Bases separadas por ambiente: dev · (staging) · prod.
- ✏️ **Seed de desenvolvimento:** 1 tenant (SmokingBars-demo), 2 tiers, 1 evento, users de teste.
- 🔒 Índices nas colunas de filtro/junção mais usadas (ex.: `playback_sessions(user_id, active)`, `subscriptions(tenant_id, status)`).

## Dados & conformidade
- ✏️ **Dados pessoais (PII) guardados:** nome, email, estado de subscrição, IP/sessões. **Dados de pagamento NÃO** — ficam no provedor (não guardamos cartões).
- 🔒 Encriptar em trânsito e em repouso. Segredos fora da BD.
- ✏️ **Backups:** point-in-time restore do Neon (retenção conforme o plano).
- ✏️ **Retenção / apagar conta (RGPD):** apagar conta → anonimizar PII + soft delete; purga definitiva agendada. Página de pedido de exportação/eliminação.
