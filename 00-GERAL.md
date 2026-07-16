# 📋 Projeto — Definição Geral

> **Como preencher este pack**
> - 🔒 **Fixo** — é o standard. Não mexer sem uma boa razão escrita.
> - ✏️ **Preencher** — valor específico deste projeto.
> - ☑️ **Escolher** — marca **uma** opção com `[x]`. A recomendada já vem marcada.

## Índice
1. [Geral](00-GERAL.md) — este ficheiro
2. [Design](01-DESIGN.md) — cores, tipografia, movimento
3. [Frontend](02-FRONTEND.md) — interface e estado
4. [Backend](03-BACKEND.md) — API, auth, lógica
5. [Base de Dados](04-BASE-DE-DADOS.md) — dados e schema
6. [Infra & Deploy](05-INFRA-E-DEPLOY.md) — hosting, CI/CD
7. [Serviços Externos](06-SERVICOS-EXTERNOS.md) — pagamentos, email, IA

> **Estratégia, segurança e processo** deste projeto estão em [`docs/`](docs/) — começa por [docs/VISAO-E-NEGOCIO.md](docs/VISAO-E-NEGOCIO.md).

---

## Identidade
- ✏️ **Nome:** FirstRow
- ✏️ **Slug / repositório:** `firstrow` (`oficinalabs/firstrow`)
- ✏️ **Uma frase (o que é):** plataforma de streaming e conteúdo pago com acesso controlado à prova de fugas.
- ✏️ **Domínio:** `joinfirstrow.com` — **ainda não comprado** (fica para depois).
- ☑️ **Tipo de projeto:**
  - [x] SaaS (subscrição)
  - [ ] Site institucional / landing
  - [ ] Web app (sem cobrança)
  - [ ] API / serviço
  - [ ] Engine de dados (batch/cron)
- ☑️ **Estado:**
  - [x] Ideia / protótipo
  - [ ] MVP
  - [ ] Produção

## Âmbito
- ✏️ **Problema que resolve:** criadores de lives pagas perdem receita porque o link privado é partilhado/traficado (hoje: Patreon + link de live privada no YouTube).
- ✏️ **Público-alvo:** organizações/criadores portugueses com lives e conteúdo pago. **Primeiro nicho (beachhead):** ligas de batalhas escritas — SmokingBars (piloto) e Liga Knockout.
- ✏️ **Métrica de sucesso (uma):** % da audiência live que paga — i.e. fechar a fuga de links, medido num evento real da SmokingBars.
- ✏️ **Fora de âmbito (não fazer):** rede social/feed completo estilo Patreon; app nativa; qualquer mercado fora de PT por agora (Brasil descartado — ver [docs/DECISOES.md](docs/DECISOES.md)).

## Standards fixos (valem para toda a stack)
- 🔒 **Linguagem:** TypeScript (modo strict). Python só em engines de dados.
- 🔒 **Framework:** Next.js (App Router).
- 🔒 **Gestor de pacotes:** pnpm.
- 🔒 **Lint & format:** Biome.
- 🔒 **Node:** versão LTS, fixada em `.nvmrc`.
- 🔒 **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:` …).
- 🔒 **Branching:** `main` protegida; trabalho em branch + Pull Request.
- ✏️ **Idiomas do produto:** PT (produto); marca/naming em EN.

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
| **Vídeo (adição deste projeto)** | **Cloudflare Stream** — live (RTMP/OBS) + VOD + tokens assinados |

> Isto é a **espinha dorsal**. A única adição à stack base é o fornecedor de vídeo (ver [06-SERVICOS-EXTERNOS.md](06-SERVICOS-EXTERNOS.md) e [docs/ARQUITETURA.md](docs/ARQUITETURA.md)).

## Marca (resumo — detalhe em [Design](01-DESIGN.md))
- ✏️ **Tom numa palavra:** exclusivo — "a porta privada para algo que vale a pena pagar".
- ✏️ **Referências / inspiração:** modelo OTT/desporto (DAZN, UFC Fight Pass); Patreon é o que substituímos.
