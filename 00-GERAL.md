# 📋 Projeto — Definição Geral

> **Como preencher este pack**
> - 🔒 **Fixo** — é o standard. Não mexer sem uma boa razão escrita.
> - ✏️ **Preencher** — valor específico deste projeto.
> - ☑️ **Escolher** — marca **uma** opção com `[x]`. A recomendada já vem marcada.
>
> Copia esta pasta para cada projeto novo e preenche de cima a baixo **antes** de escrever código.

## Índice
1. [Geral](00-GERAL.md) — este ficheiro
2. [Design](01-DESIGN.md) — cores, tipografia, movimento
3. [Frontend](02-FRONTEND.md) — interface e estado
4. [Backend](03-BACKEND.md) — API, auth, lógica
5. [Base de Dados](04-BASE-DE-DADOS.md) — dados e schema
6. [Infra & Deploy](05-INFRA-E-DEPLOY.md) — hosting, CI/CD
7. [Serviços Externos](06-SERVICOS-EXTERNOS.md) — pagamentos, email, IA

---

## Identidade
- ✏️ **Nome:** `________`
- ✏️ **Slug / repositório:** `________`
- ✏️ **Uma frase (o que é):** `________`
- ✏️ **Domínio:** `________`
- ☑️ **Tipo de projeto:**
  - [ ] Site institucional / landing
  - [ ] SaaS (subscrição)
  - [ ] Web app (sem cobrança)
  - [ ] API / serviço
  - [ ] Engine de dados (batch/cron)
- ☑️ **Estado:**
  - [x] Ideia / protótipo
  - [ ] MVP
  - [ ] Produção

## Âmbito
- ✏️ **Problema que resolve:** `________`
- ✏️ **Público-alvo:** `________`
- ✏️ **Métrica de sucesso (uma):** `________`
- ✏️ **Fora de âmbito (não fazer):** `________`

## Standards fixos (valem para toda a stack)
- 🔒 **Linguagem:** TypeScript (modo strict). Python só em engines de dados.
- 🔒 **Framework:** Next.js (App Router).
- 🔒 **Gestor de pacotes:** pnpm.
- 🔒 **Lint & format:** Biome.
- 🔒 **Node:** versão LTS, fixada em `.nvmrc`.
- 🔒 **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:` …).
- 🔒 **Branching:** `main` protegida; trabalho em branch + Pull Request.
- ✏️ **Idiomas do produto:** `________` (ex.: PT, EN)

## Stack fixa (num relance)
| Camada | Standard |
|---|---|
| Linguagem | TypeScript |
| Framework | Next.js (App Router) |
| Estilo / UI | Tailwind + shadcn/ui |
| Estado do servidor | TanStack Query |
| Formulários | React Hook Form + Zod |
| Base de dados | PostgreSQL |
| ORM | Drizzle |
| Autenticação | Better Auth |
| Email | Resend |
| Erros | Sentry |
| CI/CD | GitHub Actions |
| Deploy | Vercel |

> Isto é a **espinha dorsal**. As camadas opcionais e as escolhas por projeto estão nos ficheiros seguintes.

## Marca (resumo — detalhe em [Design](01-DESIGN.md))
- ✏️ **Tom numa palavra:** `________`
- ✏️ **Referências / inspiração:** `________`
