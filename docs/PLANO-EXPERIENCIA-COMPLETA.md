# Plano — experiência de visualização completa

> Escrito a 20/07/2026, depois do primeiro teste real de ponta a ponta (OBS → live →
> VOD → player). O teste provou a cadeia — e revelou os bugs que abrem este plano.
> Regra herdada do plano anterior e que continua em vigor: **nenhuma afirmação sobre
> concorrência, segurança ou UX entra sem verificação medida ou vista no ecrã.**

---

## P0 — o que o teste real revelou (corrigir antes de tudo)

### P0.1 O token de reprodução expira a meio da visualização
**O bug mais grave da plataforma neste momento.** O token assinado para o player tem
TTL de **120 segundos** (`lib/cloudflare.ts`, `signPlaybackToken`) e nada o renova.
O player morre ao fim de ~2 minutos, o espectador recarrega, e volta a morrer.

Evidência (sessões reais do teste de 20/07, conta `ruiclaro998@`):
sessões consecutivas de ~141s cada, nova sessão segundos depois da anterior ser
revogada — a assinatura clássica de um utilizador a recarregar para continuar a ver.
Numa batalha de 3 horas: ~90 interrupções por espectador. Inaceitável.

**Correção:** o TTL passa a cobrir a visualização inteira — para VOD, a duração do
vídeo com folga; para live, a duração prevista do evento (ex.: 6h). O anti-pirataria
NÃO está no TTL curto: está no login obrigatório, na sessão única, na marca de água e
no facto de o token ser assinado por evento. Um TTL de horas não enfraquece nada
disso. Medir depois: uma sessão de teste de >10 min sem uma única recarga.

### P0.2 O contador de "sessões bloqueadas" mente
As reconexões do MESMO browser contam como "sessão bloqueada" — o que polui a métrica
que existe para detetar partilha de conta. As 7 "sessões cortadas" do teste eram uma
pessoa só num browser só.

**Correção:** um identificador de dispositivo (cookie httpOnly gerado no primeiro
play). Reconexão do mesmo dispositivo substitui a sessão **em silêncio**, sem contar
como bloqueio; só um dispositivo DIFERENTE conta — que é o que a métrica quer dizer.
Medir: recarregar 5× no mesmo browser → 0 bloqueios; abrir num segundo browser → 1.

### P0.3 A marca de água está parada 90 segundos de cada vez
`animation: wm-hop 360s step-end infinite` — salta entre 4 posições, uma vez a cada
90s. Pedido explícito: **movimento contínuo.** Deriva lenta e permanente (keyframes
com easing, ciclo longo, opacidade baixa para não estragar a visualização), mais o
salto de posição que já existe. Sem depender só de JS: se o JS falhar, a animação CSS
continua.

**Honestidade sobre a marca de água, para ficar escrito:** ela vive no DOM, por cima
do iframe. Quem abrir o inspetor apaga o `<span>` e fica com o vídeo limpo. Isto é
inerente à abordagem — a Cloudflare não grava marcas de água no próprio vídeo em
live. O valor real dela é (1) dissuadir o espectador comum de filmar o ecrã, e
(2) identificar a conta em qualquer gravação partilhada *sem* o inspetor aberto.
Contra o atacante técnico, as defesas são o login, a sessão única e o token por
conta. Não vender às ligas mais do que isto.

---

## Onda A — a página de ver (live e VOD)

### A1. Descrição do evento
Coluna `events.description` (texto, opcional). Entra no formulário de criar/editar
(o `event-form` já partilhado), na página pública do evento, na página de ver, e no
texto de partilha. Migração aditiva no padrão habitual.

### A2. Chat ao vivo
**Âmbito:** chat por evento, ativo enquanto o evento está `live`. Só para quem pode
ver o evento (`canWatchEvent` — a mesma regra do player, sem segunda opinião).

**Arquitetura — decisão tomada e porquê:** transporte por **polling curto (3–5s)
contra o Postgres**, atrás de uma interface (`ChatTransport`) que permita trocar
para SSE ou um serviço externo sem reescrever a UI.
Porquê: estamos em Vercel serverless (sem WebSockets nativos); a escala da Fase 0 é
50–150 espectadores; um poll de 3s com 150 pessoas são ~50 req/s de leituras baratas
indexadas — o Neon aguenta isso sem infraestrutura nova, sem custo novo e sem
dependência nova. Um serviço externo (Pusher/Ably) fica documentado como caminho de
upgrade quando houver um evento >500 espectadores.

**Modelo:** `chat_messages` (id, event_id, user_id, body, created_at,
deleted_at, deleted_by). Mensagens curtas (limite ~300 chars), rate limit por conta
(o `limitByIpShared` da Frente L serve de base). Sem edição; apagar é soft-delete.

**Papéis visíveis:** o dono e o staff do canal aparecem com distintivo (nome + cor
`--tenant` do canal, badge "SB" ou equivalente), lido de `channel_members` — nunca
hardcoded. Clientes comuns aparecem com o nome simples.

**Moderação (mínimo viável):** dono/staff podem apagar mensagem e silenciar uma conta
no evento (tabela `chat_timeouts`). Sem filtro automático de linguagem — é battle
rap, palavrões são o género; a moderação é humana e do canal.

### A3. Comentários no VOD
Quando o evento passa a `ended`, o chat fecha e a mesma tabela ganha uma segunda
vida: os comentários. Mesma UI, mesmo modelo, mesma moderação — a diferença é só que
deixam de ser "ao vivo" (sem polling agressivo; carregar ao abrir + botão "mais").
Quem pode comentar = quem pode ver o VOD. O chat da live fica visível como histórico
("durante a transmissão"), os comentários novos ficam por baixo — decisão de UI a
afinar no ecrã, não duas tabelas.

### A4. Gosto e partilha
- **Gosto:** `event_likes` (event_id, user_id, unique). Um por conta, toggle.
  Contagem visível. Só para autenticados; anónimo vê a contagem.
- **Partilha:** Web Share API no telemóvel (partilha nativa), fallback copiar-link
  com confirmação visual. O link é a página pública do evento (nunca a de ver). O
  texto de partilha usa título + descrição (A1).

### A5. Botão "Backoffice" no frontoffice
No header do site, para quem tem poderes (qualquer filiação em `channel_members` ou
`platform_admin`): link discreto "Backoffice". Lido das filiações reais — o viewer
comum nunca o vê. E o simétrico já existe (o backoffice linka ao site).

---

## Onda B — backoffice

### B1. Clicar no nome do evento abre o evento
Na dashboard e na listagem de eventos, o título passa a link para a página do evento
(`/admin/eventos/<id>` — hoje não existe página de detalhe; o destino certo é a de
transmissão, que é o "hub" do evento). Uma linha por tabela. Quick win.

### B2. Upload de logo e banner do canal
Hoje `logoUrl`/`bannerUrl` são colunas de texto sem forma de as preencher.

**Armazenamento — decisão:** **Cloudflare R2** (já temos conta Cloudflare; API
S3-compatível; free tier 10 GB) com URLs públicos por bucket. Alternativa Vercel
Blob fica documentada; R2 ganha por já estarmos lá e pelo custo zero à escala atual.
Precisa de: bucket, chave R2, 3 variáveis de ambiente novas (entram no
`startup-check` como capacidade "Imagens de canal", não-grave).

**Validação no servidor, não só no input:** tipo real do ficheiro (magic bytes, não
extensão), dimensões via `sharp` (já está autorizado nos builds), limites:
- logo: quadrado, mín. 256×256, máx. 1024×1024, ≤1 MB, PNG/JPG/WebP/SVG*
- banner: 3:1 (±10%), mín. 1200×400, ≤3 MB, PNG/JPG/WebP
(*SVG só se sanitizado — sem `<script>`; senão excluir SVG e dizer porquê no ecrã.)
O formulário mostra pré-visualização antes de gravar e diz as dimensões esperadas
ANTES do erro, não depois.

### B3. Descrição no formulário de eventos
Parte de A1 — mesmo formulário partilhado criar/editar.

---

## Onda C — responsividade e a dashboard do admin

### C1. Passagem de responsividade à plataforma toda
Não é "meter media queries": é uma auditoria página a página, com critérios:
- **Frontoffice** (home, canal, evento, ver, checkout, conta, legal): 375px sem
  scroll horizontal, alvos de toque ≥44px, player full-width, chat utilizável com o
  teclado aberto (o caso difícil real).
- **Backoffice**: as TABELAS são o problema — em ecrã pequeno passam a cartões
  (padrão a criar uma vez em `DataTable`, não página a página). O scanner já é
  mobile-first; a régie de transmissão tem de funcionar num tablet na régie.
- **Verificação:** cada página vista a 375/768/1280 no browser real (o harness tem
  browser), com registo do que se corrigiu. Sem "deve estar bom".

### C2. Dashboard do platform_admin com gráficos
Responde à pergunta "devia haver um papel tipo ADMIN que vê tudo": **já existe — é o
`platform_admin`, e és tu.** O dono de canal vê só o seu canal (confirmado e medido:
âmbito vazio → zero linhas; canal alheio → mesma resposta que um id inexistente). O
que falta não é o papel, é a **vista**: `/admin/plataforma` hoje é básica.

Conteúdo da dashboard nova (tudo global, só `platform_admin`):
- Receita por semana/mês, empilhada por canal
- Espectadores em simultâneo por evento (curva do pico)
- Vendas por evento (PPV vs bilhetes), comissão acumulada
- Custos de vídeo (da Frente M) vs comissão — o rácio que decide o negócio
- Novos registos por semana e taxa de conversão registo→compra
- Saúde: pagamentos pendentes/expirados (da reconciliação), sessões bloqueadas
  (agora com a métrica limpa de P0.2)

**Gráficos — decisão:** `recharts` (client-side, tree-shakeable, sem CDN externo —
a CSP não deixa; entra no bundle). Interativo q.b.: tooltip, hover, período
selecionável. Nada de dashboards-de-brinquedo com animações gratuitas.

---

## Decisões de produto ainda em aberto (para o Rui)
1. **Chat anónimo lê?** Proposta: quem não comprou não vê o chat (é parte do
   produto pago). Confirmar.
2. **Likes públicos?** Proposta: contagem pública, quem gostou é privado.
3. **Comentários: janela de tempo?** Proposta: abertos enquanto o VOD estiver
   disponível (30 dias — decisão já tomada), fecham quando o VOD expira.
4. **Upload: quem pode?** Proposta: dono do canal e platform_admin; staff não.

## Custos novos deste plano
- R2: 0 € à escala atual (free tier 10 GB).
- Chat por polling: 0 € de infraestrutura nova; carga no Neon a vigiar no primeiro
  evento (>500 espectadores → reavaliar transporte).
- recharts: 0 €, custo em KB de bundle (só na rota do admin, com import dinâmico).

## Ordem de execução proposta
1. **P0 inteiro** — são bugs, não features; o P0.1 bloqueia qualquer evento real.
2. **B1 + A5 + A1/B3** — quick wins que destravam o uso diário.
3. **A2 (chat live)** — a feature mais visível para as ligas.
4. **B2 (uploads)** — precisa das chaves R2 do Rui.
5. **A3 + A4** — comentários, gosto, partilha.
6. **C1 (responsividade)** — transversal, em paralelo com o resto quando possível.
7. **C2 (dashboard)** — por último: precisa dos dados das outras peças para ter o
   que mostrar.

## Fora deste plano (continuam pendentes de terceiros / do Rui)
- Split Eupago: obter as `externKey` no backoffice (sonda diz que o serviço está
  ativo; faltam os identificadores dos beneficiários).
- NIF da Aresta nos documentos legais.
- `CRON_SECRET` na Vercel (reconciliação automática).
- Subscrição Cloudflare Stream: **feita** (primeira transmissão provada a 20/07).
