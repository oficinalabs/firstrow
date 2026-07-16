# Segurança & Anti-pirataria — FirstRow

> Requisito nº 1 do produto: ser **super seguro contra os "Fugitivos"** (quem tenta ver sem pagar) e sério o suficiente para as ligas não olharem com desdém.

## Modelo de ameaça
| Ameaça | Como acontece hoje |
|---|---|
| Tráfico de link | O link privado do YouTube é partilhado em grupos |
| Partilha de login | Uma conta paga, vários usam |
| Gravação de ecrã + reupload | Alguém grava a live e republica |
| Roubo de manifest/URL | Copiar o URL do vídeo para fora do site |

## Defesa em camadas
1. **Sem link para partilhar.** Tudo atrás do **Better Auth**. Comprar = conta, não um URL. Sem conta autenticada, não há vídeo.
2. **Uma sessão a ver de cada vez, por conta.** O player envia um **heartbeat** ao servidor a cada X segundos; o servidor mantém um registo de sessões ativas (`playback_sessions`). Uma segunda reprodução na mesma conta é **recusada** (ou mata a primeira). No **ao vivo** isto é decisivo — todos querem ver à mesma hora, por isso emprestar o login deixa de servir.
3. **Tokens de reprodução assinados e de curta duração.** Cada play pede ao servidor um token (JWT, poucos minutos), emitido **só após** verificar sessão + entitlement + concorrência. Sem token válido, o stream não arranca (Cloudflare Stream signed URLs / Mux signed playback tokens). O token não é reutilizável fora da janela.
4. **Watermark dinâmica por espectador.** Overlay com email/id do utilizador, a **mudar de posição** no ecrã. Não impede gravar, mas (a) denuncia quem gravou (forense) e (b) mata a vontade de republicar.
5. **VOD igualmente fechado.** Mesmo esquema de token + watermark. Nunca um URL público.
6. **Rate limiting** no login, no mint de token e no heartbeat. Trava brute-force e abuso.
7. **DRM (Widevine/FairPlay) — Fase 2.** Reforço se aparecer captura de ecrã séria. O MVP não precisa.

## Threat → mitigação
| Ameaça | Mitigação |
|---|---|
| Tráfico de link | Não há link; acesso por sessão |
| Partilha de login | 1 sessão concorrente + heartbeat |
| Gravação + reupload | Watermark forense + bans |
| Roubo de URL | Token assinado curto; sem URL público |

## Resposta a fugas
- Watermark → identificar a conta fonte → **ban** (`bans`) + registo (`leak_reports`).
- Termos de utilização com cláusula anti-partilha de conta (base legal para banir).

## Princípio
O ao vivo é **naturalmente mais à prova de pirataria** do que o VOD, por causa da concorrência (simultaneidade). Por isso o evento live é o coração do produto; o VOD é gated com o mesmo rigor.
