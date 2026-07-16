# 🗄️ Base de Dados

> 🔒 fixo · ✏️ preencher · ☑️ escolher

## Motor & fornecedor
- 🔒 **Motor:** PostgreSQL.
- ☑️ **Fornecedor:**
  - [x] Supabase (default — gerido, + auth/storage)
  - [ ] Neon (serverless, scale-to-zero)
  - [ ] Self-host (Coolify / Hetzner)
  - [ ] SQLite / Turso (edge, app pequena)
- ☑️ **ORM:**
  - [x] Drizzle (default — SQL-first, leve)
  - [ ] Prisma 7 (abstração + tooling)

## Convenções de schema (fixas)
- 🔒 Tabelas em `snake_case`, no plural (`users`, `orders`).
- 🔒 Chave primária: `id` (uuid ou cuid2).
- 🔒 Timestamps `created_at` e `updated_at` em todas as tabelas.
- ☑️ **Soft delete (`deleted_at`):** [ ] Não · [ ] Sim
- ✏️ **Entidades principais:** `________`  ·  _ex.: users, projects, subscriptions_

## Migrations & ambientes
- 🔒 Migrations **versionadas no repo**. Nunca alterar produção à mão.
- 🔒 Bases separadas por ambiente: dev · (staging) · prod.
- ✏️ **Seed de desenvolvimento:** `________`
- 🔒 Índices nas colunas de filtro/junção mais usadas.

## Dados & conformidade
- ✏️ **Dados pessoais (PII) guardados:** `________`
- 🔒 Encriptar em trânsito e em repouso. Segredos fora da BD.
- ✏️ **Backups:** `________`  ·  _frequência e retenção_
- ✏️ **Retenção / apagar conta (RGPD):** `________`
