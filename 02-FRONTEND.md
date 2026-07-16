# 🖥️ Frontend

> 🔒 fixo · ✏️ preencher · ☑️ escolher

## Base
- 🔒 **Framework:** Next.js (App Router), **RSC-first** — client components só quando preciso.
- 🔒 **Estilo:** Tailwind CSS.
- 🔒 **UI:** shadcn/ui (ver [Design](01-DESIGN.md)).

## Estado
- 🔒 **Estado do servidor:** TanStack Query (cache de dados remotos).
- ☑️ **Estado do cliente:**
  - [x] Zustand (default)
  - [ ] Jotai (atómico, granular)
  - [ ] Nenhum (só estado local)

## Formulários & dados
- 🔒 **Formulários:** React Hook Form + Zod.
- 🔒 **Validação:** Zod — **schema partilhado** com o backend.
- ☑️ **Chamada à API:**
  - [x] Server Actions (default)
  - [ ] Route Handlers (REST)
  - [ ] tRPC (RPC tipado, apps grandes)

## Conteúdo
- ☑️ **i18n:** [ ] Não · [x] Sim (next-intl) — idiomas: ✏️ PT (produto); marca/naming em EN.
- ☑️ **Tabelas:** [x] TanStack Table (quando houver dados tabulares)
- ☑️ **Gráficos:** [ ] Nenhum · [x] Recharts · [ ] Tremor · [ ] Nivo / visx
- 🔒 **SEO:** Metadata API, `sitemap.ts`, `robots.ts`, imagens OG.

## Estrutura de pastas (sugestão fixa)
```
app/            rotas (App Router)
components/     UI reutilizável
  ui/           shadcn
  player/       leitor de vídeo + overlay de watermark (client)
lib/            helpers, clients, utils
server/         lógica de servidor / actions
  video/        mint de token de reprodução + heartbeat de concorrência
db/             schema + queries (ver Base de Dados)
styles/         tokens + globals
```
- ✏️ **Desvios a esta estrutura:** `app/(watch)/` para rotas de visualização gated (só com sessão + entitlement). O leitor e a watermark são client components; a autorização é sempre no servidor.
