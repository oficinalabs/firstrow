# FirstRow

Plataforma de streaming e conteúdo pago com **acesso controlado** — vende lives, arquivo de VOD e conteúdo exclusivo sem perder dinheiro para links partilhados.

> Estado: **ideia / protótipo** · Domínio: `joinfirstrow.com` (a comprar) · Repo: `oficinalabs/firstrow`

## O problema

Criadores que fazem lives pagas (hoje via Patreon + link privado do YouTube) perdem receita porque **o link circula** — quem não paga entra na mesma. FirstRow fecha essa porta.

## A cunha (o que nos distingue)

Não é "mais um streaming". É **controlo de acesso à prova de fugas**:

- Sem link partilhável — tudo atrás de login.
- Uma sessão a ver de cada vez, por conta.
- Tokens de reprodução assinados e de curta duração.
- Watermark dinâmica por espectador (rastreável).

Detalhe em [`docs/SEGURANCA-E-ANTIPIRATARIA.md`](docs/SEGURANCA-E-ANTIPIRATARIA.md).

## Posicionamento

Plataforma **generalista** (qualquer criador com lives/conteúdo pago), com as **ligas portuguesas de batalhas escritas** como primeiro cliente (beachhead). Piloto: **SmokingBars**.

## Documentação

| Doc | O quê |
|---|---|
| [docs/VISAO-E-NEGOCIO](docs/VISAO-E-NEGOCIO.md) | Posicionamento, mercado, contas reais, modelo de negócio |
| [docs/SEGURANCA-E-ANTIPIRATARIA](docs/SEGURANCA-E-ANTIPIRATARIA.md) | Arquitetura anti-fugas |
| [docs/ARQUITETURA](docs/ARQUITETURA.md) | Vídeo, OBS, tokens, modelo de dados |
| [docs/PAGAMENTOS](docs/PAGAMENTOS.md) | MB WAY — decisão: Eupago (split payments) |
| [docs/SPIKE-MBWAY-IFTHENPAY-VS-EUPAGO](docs/SPIKE-MBWAY-IFTHENPAY-VS-EUPAGO.md) | Spike: IfthenPay vs Eupago |
| [docs/ROADMAP](docs/ROADMAP.md) | Fases, MVP, piloto |
| [docs/SPEC-MVP-FASE-0](docs/SPEC-MVP-FASE-0.md) | Spec do MVP: âmbito, esforço, custo |
| [docs/DECISOES](docs/DECISOES.md) | Registo de decisões (o porquê) |
| [docs/HISTORICO-EXPLORACAO](docs/HISTORICO-EXPLORACAO.md) | Como chegámos aqui |

Convenções de stack e preenchimento: ficheiros `00`–`06` na raiz (do template `oficinalabs/template-projeto`).

## Stack (num relance)

TypeScript · Next.js (App Router) · Tailwind + shadcn/ui · Better Auth · Drizzle + PostgreSQL · Vercel · **Cloudflare Stream** (vídeo — a única adição à stack base).
