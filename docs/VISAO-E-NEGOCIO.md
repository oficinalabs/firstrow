# Visão & Negócio — FirstRow

## O que é
Plataforma de streaming e conteúdo pago com **acesso controlado à prova de fugas**. Criadores vendem lives, um arquivo de VOD e conteúdo exclusivo, sem perder dinheiro para links partilhados.

Mentalidade: **não é streaming, é controlo de acesso + pagamentos.** Streaming é commodity; o valor está em impedir que um pagante alimente dez borlistas.

## O problema (a cunha)
Hoje as ligas usam **Patreon + link privado de live no YouTube**. Quem tem o link entra — pague ou não. O link é traficado. A receita foge.

FirstRow fecha a porta:
- Sem link partilhável — tudo atrás de login (comprar = conta).
- Uma sessão a ver de cada vez, por conta (mata a partilha de login, sobretudo no ao vivo).
- Tokens de reprodução assinados e curtos.
- Watermark dinâmica por espectador (rastreável).

Ver [SEGURANCA-E-ANTIPIRATARIA.md](SEGURANCA-E-ANTIPIRATARIA.md).

## Posicionamento: generalista, com beachhead
FirstRow é **generalista** — serve qualquer criador PT com lives/conteúdo pago (comédia, música, esports, formação). O **primeiro cliente** é o nicho das **batalhas escritas** (rap), onde o dono do projeto tem contactos e conhece a dor.

- **Co-branding:** o espectador entra em "SmokingBars, na FirstRow" — a liga nunca sente que perde a casa dela.
- **Regra:** vertical/foco ganha ao horizontal. Não competir de frente com o Patreon "para todos"; ser o **substituto completo** destas ligas, com a arma que o Patreon não tem (live gated + VOD + anti-pirataria).

## Mercado: só Portugal (por agora)
Brasil foi **descartado** (ver [DECISOES.md](DECISOES.md)):
1. Brasil é sobretudo batalha de **improviso**, não escrita.
2. Sem contactos lá.
3. É preciso ganhar dimensão num sítio primeiro → Portugal.

Duas ligas principais de batalhas escritas em PT (dados de 2026-07-16):
| Liga | Pagantes (Patreon) | Tiers |
|---|---|---|
| Liga Knockout | 314 | 2,99€ / 8,99€ |
| SmokingBars (piloto) | 131 | 3,50€ / 8,59€ |

Tier barato = acesso antecipado a batalhas/cartazes/faceoffs + exclusivos. Tier caro = a stream.

## As contas reais — SmokingBars
9 meses de payouts do Patreon (Ago 2025 – Abr 2026):

| Mês | Bruto | Líquido p/ liga |
|---|---|---|
| Abr 2026 | 1.124,68€ | 1.004,58€ |
| Mar 2026 | 1.265,54€ | 1.037,20€ |
| Fev 2026 | 689,25€ | 540,72€ |
| Jan 2026 | 812,49€ | 636,18€ |
| Dez 2025 | 1.305,97€ | 995,46€ |
| Nov 2025 | 853,74€ | 665,35€ |
| Out 2025 | 1.342,64€ | 1.042,50€ |
| Set 2025 | 697,22€ | 542,58€ |
| Ago 2025 | 772,07€ | 594,99€ |

- **Média:** ~985€/mês bruto, ~784€/mês líquido.
- **O Patreon come ~23% do bruto** (~2.000€/ano) — muitas transações pequenas + conversão de moeda.
- **Split de tiers** (a 198 patronos): **71% no tier de stream (8,59€)**, 29% no de conteúdo. Ou seja, a stream é **~86% da receita** → a parte que a FirstRow serve é o prato principal, não uma fatia.
- **Padrão de eventos:** meses de evento (Ago/Out/Nov/Mar) disparam o bruto (~1.100–1.340€); meses parados ~690–810€. As pessoas subscrevem para o evento e cancelam depois → o **arquivo VOD** é a ferramenta que suaviza esses vales.

## Modelo de negócio
- **Revenue-share** (~10–12%), **não garantias**. A garantia mínima fica como arma competitiva mais tarde, com dados.
- **A conta que fecha o "sim" da liga:** o Patreon leva ~23%; a FirstRow leva ~12% (comissão + rails PT). A liga passa a **guardar ~88% em vez de ~77%** — ganha mais **mesmo pagando-te** — e ainda tapa a fuga e ganha arquivo VOD.
- **Upside:** recuperar os ~20 borlistas/evento que entram por link.

## A conta honesta (para o dono)
- Uma liga: ~90–140€/mês para ti. As duas: ~270–320€/mês (~3.500€/ano).
- **Isto não é um negócio autónomo com estas duas ligas.** Constrói-se por uma de duas razões:
  1. **Beachhead** para outros nichos PT com a mesma dor (comédia, música, esports, formação) — a infra é a mesma.
  2. Jogada de **paixão/portfólio** que se aceita começar pequena.
- O que **não** se deve fazer: construir à espera que estas duas ligas paguem as contas.

## Expansão (não é geografia)
A escala real é **horizontal dentro de PT**: qualquer criador/organização com lives pagas e o problema de links partilhados. Battle rap é a cabeça-de-praia; a plataforma é niche-agnostic.
