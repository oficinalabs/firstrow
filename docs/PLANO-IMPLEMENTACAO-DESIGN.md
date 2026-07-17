# Plano de implementação — Design + Lógica (FirstRow)

> Fonte de verdade do design: `design/FirstRow Plataforma/*.dc.html` (abrir no browser).
> Assets do logo: `assets/`. Este plano divide o trabalho em **1 fundação + 5 frentes paralelas**,
> com fronteiras de ficheiros para as frentes não colidirem. Cada frente trabalha em
> **worktree isolado + branch + PR** (convenção do repo: `main` protegida).

## Tokens aprovados (resumo)
- **Neutros quentes (light):** fundo `#F6F5F1` · cartão `#FCFBF8` · muted `#ECEAE3` · linha `#DFDCD4` · texto2 `#6E6A61` · grafite `#3B3934` · tinta `#161512`
- **Dark (espectador):** barra FR `#0F0E0C` · fundo `#131211` · cartão `#1B1A18` · linha `#2B2926` · texto2 `#A39F96` · texto `#F1EFEA`
- **Funcionais:** ação = **TINTA** `#161512` (hover `#2A2823`; inverte em dark: botão `#F1EFEA`/texto tinta) · **AO VIVO `#E5372B`** (só live/urgência, com pulse) · **acento LIMÃO `#EAE04A`** (light: marcador/fundo com texto tinta; dark: texto/linha) · sucesso `#2F9E63` · aviso `#E08A1E` · destructive `#A62E24`
- **Tipografia (next/font/google):** Archivo (600–900, display/títulos) · Instrument Sans (400–700, corpo/UI) · IBM Plex Mono (400–600, números/€/mono)
- **Raio 6px** · espaçamento múltiplos de 4 · foco visível sempre
- **Temas:** superfícies do espectador = **dark por defeito** (o vídeo vive melhor); backoffice = **light**; marketing = light. Implementar com `data-theme` por segmento de layout (tokens em CSS vars).

## Estado atual do código (o que já existe)
- Lógica core: `server/` (events, entitlements, playback c/ 1-sessão-por-conta), `lib/` (cloudflare signed tokens, eupago split + webhook, split), rotas API (checkout, webhook, playback session/heartbeat, entitlements, admin events), player+watermark, buy-button, admin event form. Tudo verde (typecheck/build/lint) mas **sem design** e **sem UI de auth**.
- DB no Neon (tabelas criadas). Better Auth configurado (email+password).

## Contratos partilhados (para as frentes não divergirem)

### Novo schema — bilhetes (SÓ a Frente D mexe em `db/schema.ts`)
```
tickets: id text pk · event_id fk events · user_id fk user · qr_token text unique
         status text 'pending'|'issued'|'used'|'refunded' · used_at timestamp?
         price_cents int · provider_ref text? · created_at/updated_at
events (colunas novas): ticket_price_cents int? · ticket_capacity int?
```

### Rotas novas
- Espectador: `/` (canal, single-tenant por agora) · `/eventos/[id]` · `/eventos/[id]/ver` · `/vod` · `/bilhetes` (meus bilhetes+QR) · `/conta` · `/entrar` · `/registar` · `/recuperar` · `/criadores` (marketing)
- Backoffice (gate `ADMIN_EMAILS`): `/admin` (dashboard) · `/admin/eventos` · `/admin/eventos/[id]/transmissao` · `/admin/eventos/[id]/bilhetes` · `/admin/scanner` · `/admin/subscritores` · `/admin/ganhos`
- API bilhetes: `POST /api/tickets/checkout/[eventId]` (MB WAY one-off, reusa lib/eupago) · webhook eupago existente passa a ativar também tickets (identifier = ticket id) · `POST /api/tickets/validate` (qr_token → válido/já usado/outro evento; marca used_at)

### Single-tenant (Fase 0)
`lib/tenant.ts` exporta a config do canal (nome, logos, cor de destaque, banner) — hardcoded SmokingBars-demo. O co-branding (canal dentro da moldura FirstRow, barra `#0F0E0C`) usa isto. Multi-tenant é Fase 2; NÃO criar tabela tenants agora.

### Subscritores/tiers — honestidade de âmbito
Recorrência Eupago ainda não confirmada em sandbox → **não implementar billing recorrente**. `/admin/subscritores` lista compradores (entitlements/tickets) por evento; a UI de tiers na página de canal mostra o PPV/acessos. Billing mensal = fase seguinte.

## Frentes (chips)

### A — Fundação (TEM de ser a 1ª a fazer merge; as outras arrancam depois)
Tokens CSS light/dark + `data-theme` · fontes next/font · componentes base `components/ui/` (Button, Input, Badge, LiveBadge c/ pulse, Card, Table compacta, Skeleton, EmptyState) · logo/favicons/OG/app-icons de `assets/` → `public/brand/` + metadata no layout · shell de navegação (barra FR dark do espectador + sidebar light do backoffice) · restyle mínimo da watermark/player-frame (tokens). Fica o "kit" que todas as frentes consomem.
**Dona de:** `app/globals.css`, `app/layout.tsx`, `components/ui/*`, `public/*`, `lib/tenant.ts`, `lib/format.ts` (formatadores partilhados) e o mapeamento tokens→Tailwind (`@theme`) que impede hex hardcoded nas outras frentes.

### B — Espectador core (depois de A)
Página de canal (`/`, dark, hero com próxima live + countdown, agenda, arquivo, co-branding) · evento + checkout MB WAY (4 estados: telemóvel→pendente→sucesso→expirado; reusa BuyButton/rotas existentes) · player live + sessão revogada + VOD (restyle do WatchPlayer; badge AO VIVO; watermark) · mobile-first.
**Dona de:** `app/(viewer)/…` novas páginas, `components/checkout/*`, `components/player/*`. **Não mexe** em `db/schema.ts` nem `components/ui`.

### C — Auth + conta (depois de A; paralela a B/D/E/F)
`/entrar` · `/registar` (espelha o design de entrar) · `/recuperar` · `/conta` (compras, terminar sessão) — liga ao `lib/auth-client.ts` existente; redirect de volta à página de origem; estados de erro humanos PT-PT.
**Dona de:** `app/(auth)/*`, `app/conta/*`.

### D — Bilhetes end-to-end (depois de A; única que mexe no schema)
Schema `tickets` + colunas em `events` (contrato acima) + `pnpm db:push` · compra MB WAY (reusa `lib/eupago`; webhook ativa ticket) · geração QR (lib `qrcode` ou SVG próprio) · `/bilhetes` (QR grande, alto contraste, funciona por screenshot) · `/admin/eventos/[id]/bilhetes` (vendidos/lotação, lista, export CSV) · `/admin/scanner` (mobile fullscreen, câmara via `BarcodeDetector` c/ fallback de input manual; resultados GIGANTES verde/vermelho/laranja).
**Dona de:** `db/schema.ts` (aditivo), `server/tickets.ts`, `app/api/tickets/*`, `app/bilhetes/*`, `app/admin/eventos/[id]/bilhetes/*`, `app/admin/scanner/*`.

### E — Backoffice (depois de A; NÃO mexe no schema — lê o contrato de D se preciso, com fallback se tabela ainda não existir no merge)
`/admin` dashboard (receita, subscritores, próximo evento) · `/admin/eventos` lista + criar (restyle do form existente; campos de bilhetes) · `/admin/eventos/[id]/transmissao` (RTMP copy-to-clipboard, estado, espectadores em tempo real, sessões bloqueadas) · `/admin/subscritores` · `/admin/ganhos` (extrato: bruto, taxa FR, líquido) · admin interno mínimo. Números tabulares alinhados à direita (IBM Plex Mono).
**Dona de:** `app/admin/*` (exceto bilhetes/scanner), `components/admin/*`, `server/stats.ts`.

### F — Marketing + transversal + emails (depois de A)
Homepage marketing (dupla audiência) · `/criadores` (pitch B2B com comparação de taxas ~23% Patreon vs ~12% FirstRow — números em docs/VISAO-E-NEGOCIO.md) · 404 · página de erro · empty states/skeletons onde faltem · emails React Email + Resend (recibo de compra, "vai começar") em `emails/`.
**Dona de:** `app/(marketing)/*`, `app/not-found.tsx`, `app/error.tsx`, `emails/*`, `lib/email.ts`.

## Boas práticas de código (obrigatórias em TODAS as frentes)
- **DRY / componentes:** qualquer secção, cartão ou padrão visual usado **2+ vezes vira componente reutilizável** (ex.: `EventCard`, `CountdownTimer`, `StatCard`, `SectionHeader`, `QrCard`, `PriceTag`). Zero copy-paste de JSX entre páginas. Componentes de domínio em `components/<domínio>/`; genéricos em `components/ui/`.
- **Tokens, não valores:** **ZERO hex, px mágicos ou nomes de fonte hardcoded nos componentes** — cores, raio, espaçamentos e fontes só via variáveis CSS/tokens do tema (definidos uma vez em `app/globals.css` pela Frente A e mapeados para classes Tailwind via `@theme`). Trocar a paleta amanhã = mexer num único ficheiro. **Hex fora de `globals.css` bloqueia o PR.**
- **Formatadores partilhados:** `lib/format.ts` (criado pela Frente A) com `formatEuro` ("8,59 €"), `formatDate`/`formatDateTime` (PT-PT), `formatPhone` — usar SEMPRE; nunca formatar euros/datas à mão nas páginas.
- **Server Components por defeito;** `"use client"` só onde há interação real. Zod nas fronteiras (regra do repo). Named exports; ficheiros pequenos e focados; sem lógica de negócio dentro de componentes de UI (vive em `server/`).
- **Estados sempre desenhados:** nenhuma página nova sem os três — loading (`Skeleton`), vazio (`EmptyState`), erro.

## Regras de qualidade (TODAS as frentes — "não pode falhar nada")
1. **Fidelidade:** abrir o `.dc.html` correspondente e replicar (cores/tipos/espaçamentos dos tokens; copy PT-PT do design). Proibido: gradientes roxos, glassmorphism, emojis como ícones, cartões arredondados XL — manter o look editorial aprovado (raio 6px).
2. **Verificação obrigatória antes do PR:** `pnpm check && pnpm typecheck && pnpm build` verdes + abrir preview e comparar com o design (screenshot) + zero erros de consola.
3. **Git:** worktree isolado (EnterWorktree) · branch `feat/<frente>` · Conventional Commits · PR para `main` com resumo e screenshots · **não fazer merge de PRs de outras frentes**.
4. **Fronteiras:** cada frente só toca nos ficheiros de que é dona (lista acima). Precisas de algo fora? Regista no PR, não improvises.
5. Mobile-first no espectador; AA de contraste; foco visível; touch ≥44px; textos humanos PT-PT (nada de jargão).

## Ordem e integração
1. Merge A (fundação).
2. B, C, D, E, F em paralelo (worktrees), PRs revistos e merged por ordem de chegada; conflitos improváveis (fronteiras) — se houver, rebase.
3. Passo final (sessão principal): varrimento de integração — navegação completa, dark/light, build, e checklist de fidelidade ecrã a ecrã.
