# template-projeto

Pack de arranque para projetos novos: uma **stack uniforme** + um conjunto de
**templates de preenchimento** para que cada projeto parta sempre da mesma base.

## Como usar

1. Clica em **Use this template** (ou copia esta pasta para o repo novo).
2. Preenche os ficheiros de cima a baixo, **antes** de escrever código.
3. Segue a convenção:
   - 🔒 **Fixo** — o standard; não mexer sem uma boa razão escrita.
   - ✏️ **Preencher** — valor específico deste projeto.
   - ☑️ **Escolher** — marca **uma** opção com `[x]`; a recomendada já vem marcada.

## Ficheiros

| # | Ficheiro | O quê |
|---|---|---|
| 00 | [GERAL](00-GERAL.md) | identidade, âmbito, stack fixa |
| 01 | [DESIGN](01-DESIGN.md) | cores, tipografia, movimento |
| 02 | [FRONTEND](02-FRONTEND.md) | interface e estado |
| 03 | [BACKEND](03-BACKEND.md) | API, auth, jobs |
| 04 | [BASE-DE-DADOS](04-BASE-DE-DADOS.md) | schema e dados |
| 05 | [INFRA-E-DEPLOY](05-INFRA-E-DEPLOY.md) | hosting, CI/CD |
| 06 | [SERVICOS-EXTERNOS](06-SERVICOS-EXTERNOS.md) | pagamentos, email, IA |

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

---

Documento vivo — ajusta à medida que testas peças novas.
