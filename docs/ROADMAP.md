# Roadmap — FirstRow

> Estratégia: **construir primeiro, apresentar o produto pronto.** Não dependemos de um único "sim" — cadeia de alvos: **SmokingBars → Liga Knockout → PALOPs** (comunidade de escrita, mas exige cartão, não MB WAY). Revoga o gate anterior — ver [DECISOES.md](DECISOES.md) ADR-009.

## Fase 0 — Piloto / validação (SmokingBars)
Objetivo: **provar que se tapa a fuga** num evento real e obter um case study.
- Login (Better Auth) + 1 tier pago (Live Stream).
- Checkout com **MB WAY**.
- Live via **Cloudflare Stream** com ingest do **OBS**.
- Player gated + **watermark** + **1 sessão por conta**.
- Gravação automática de **VOD** acessível a subscritores.
- Métrica: nº de pagantes vs audiência real (comparar com o histórico do Patreon).

## Fase 1 — Produto completo p/ 1 liga
- Dois tiers (Live Stream + Acesso Antecipado/conteúdo).
- Arquivo/back-catalog de VOD.
- Concorrência endurecida; painel de admin da liga (criar evento, ver subscritores).
- Emails (Resend): novo evento, recibo, "vai começar".

## Fase 2 — Multi-tenant + 2ª liga
- Co-branding por tenant; onboarding da **Liga Knockout**.
- DRM (Widevine/FairPlay) se necessário.
- Analytics de produto (PostHog); relatórios de fuga.

## Fase 3 — Outros nichos PT
- Self-serve onboarding para criadores fora do rap (comédia, música, esports, formação).

## Sucesso por fase
- F0: fuga medida e reduzida num evento.
- F1: SmokingBars 100% na FirstRow, a receber mais que no Patreon.
- F2: 2 ligas, co-branding a funcionar.
- F3: 1º cliente fora do battle rap.

## Backlog de features (ainda por agendar)

### Bilhetes físicos + validação por QR
Vender os bilhetes de entrada dos eventos **presenciais** na FirstRow, com **taxa baixa**, e "entregar tudo direitinho à liga":
- **Para a liga:** lista de compradores (nome, email, quantidade), exportável.
- **Para o cliente:** um **QR único** por bilhete, para validar à porta do recinto.
- **Validação à entrada:** página/endpoint de scan → marca o QR como usado (evita reentradas e revenda de prints).
- **Rail:** mesma integração de pagamento (Eupago MB WAY) já feita para o streaming.
- **Porquê:** as ligas já vendem bilhetes por MB WAY hoje → porta para entrar nas operações delas para além do streaming; a taxa baixa é o argumento vs. bilhética genérica. Reforça o "somos a casa da liga" (streaming + bilhetes + dados dos fãs).
- **Esboço técnico:** tabela `tickets` (evento, comprador, `qr_token` único, estado emitido/usado, `usado_em`); geração de QR; scan de validação; export para a liga. Pode cruzar com o acesso à VOD (quem foi ao vivo também vê a gravação).

### Cores por canal (personalização da página do canal)
Na criação do canal, escolher **1 ou 2 cores** da marca e a página `/canal/[slug]` passa a usá-las.
- **Porque é barato:** o design system já vive todo em variáveis CSS e a Frente C já isolou o
  co-branding numa var `--tenant` aplicada só onde faz sentido (canal, evento, arquivo — e **não**
  em `/bilhetes` e `/conta`, que são transversais). Personalizar é alimentar essa var a partir da
  config do canal em vez de a ter fixa.
- **Cuidados:** garantir **contraste AA** com a cor escolhida (validar no momento da escolha e não
  aceitar cores que rebentem a legibilidade); limitar a cor a acentos (não repintar superfícies
  inteiras, senão perde-se a identidade FirstRow); manter o AO VIVO vermelho intocável — é sinal de
  estado, não de marca.
- **Quando:** encaixa naturalmente com a criação de canais em BD (Fase 2, multi-tenant), porque é aí
  que deixa de ser config e passa a ser dado do canal.

### Gates por página no backoffice (para o `league_staff` poder usar o scanner)
Hoje o layout do `/admin` corta em `canManageEvents`, logo um `league_staff` — que existe
precisamente para validar bilhetes à porta — não chega ao scanner. Para aliviar o layout para
`canOperateEvents` é preciso **primeiro** pôr gate próprio nas páginas de dinheiro/dados
(`/admin`, `/admin/ganhos`, `/admin/subscritores`, `/admin/plataforma`), senão o staff passava a
ver a contabilidade. Ordem obrigatória: gates nas páginas → só depois relaxar o layout.
