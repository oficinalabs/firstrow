# Qualidade de vídeo e definições do OBS

> Escrito a 21/07/2026 pela Frente AA, a fechar o apontamento do dono
> ("a qualidade máxima do player é 720p — dá para mais?").
> A regra desta sessão vale aqui: **a causa não se afirma sem a medir**. O que
> está em baixo é a resposta da API da Cloudflare, não a interpretação dela.

## A pergunta

O dono reparou que, no player, a qualidade máxima que consegue escolher é
**720p**, e perguntou se dá para mais (1080p).

Duas hipóteses possíveis, e só uma se confirma:

- **(a)** um tecto real do player / do token / do plano da Cloudflare;
- **(b)** a resolução com que o vídeo de teste foi **codificado no OBS** — a
  gravação existente é de um teste antigo.

## O que se mediu

A gravação real do teste (`uid d4714203fbd610dbe19a24ef6ce38443`, do live input
`6e053c5f340afe446cb7ee066acfb5d3`), pedida à API da Cloudflare
(`GET /accounts/<id>/stream/<uid>`):

```json
{
  "uid": "d4714203fbd610dbe19a24ef6ce38443",
  "status": { "state": "ready" },
  "readyToStream": true,
  "requireSignedURLs": true,
  "duration": 219.13,
  "input": { "width": 1280, "height": 720 },
  "meta": { "name": "SB Clash #14 — Final de Verão 20 Jul 26 15:09 UTC" }
}
```

O campo que responde à pergunta é o `input`:

```
"input": { "width": 1280, "height": 720 }
```

`input` são as dimensões da **FONTE** — o que entrou na Cloudflare pelo RTMPS,
tal e qual o OBS o codificou. E entrou a **1280×720 (720p)**.

A mesma resposta aparece na listagem de gravações do live input
(`GET /stream/live_inputs/<id>/videos`): `"input": { "width": 1280, "height": 720 }`.

## A conclusão — é a hipótese (b), e não há nada a corrigir no código

A Cloudflare Stream cria as qualidades do player (as _renditions_ adaptativas:
360p, 480p, 720p…) **a partir da fonte, transcodificando para baixo**. Nunca
inventa resolução que a fonte não tem: de uma fonte a 720p **não sai um 1080p**.

Logo, o player mostrar 720p como máximo é o comportamento **correto** — está a
refletir a fonte, não um limite da plataforma, do token ou do plano. A hipótese
(a) não se confirma: não há tecto nosso a cortar nada; o vídeo é que é 720p à
nascença.

**Não há correção de código.** Não é um bug da plataforma. É uma definição do
encoder (OBS) no dia em que se gravou o teste.

## O que fazer antes do próximo evento (OBS)

Para entregar 1080p, a **fonte** tem de sair do OBS a 1080p. Nas
**Advanced Output Settings** (Definições → Saída → modo "Avançado"):

- **Resolução de saída (Output/Scaled Resolution):** `1920×1080`
- **FPS:** `30`
- **Bitrate de vídeo:** `~4500 kbps` (CBR)
- Codificador: x264 (ou o de hardware disponível), _keyframe interval_ 2s

Confirmar que a **Base (Canvas) Resolution** e a **Output (Scaled) Resolution**
estão ambas em 1920×1080 — se o _canvas_ estiver a 720p, escalar para 1080p na
saída não acrescenta detalhe nenhum.

Depois de gravar um novo teste com estas definições, a mesma verificação
confirma-o: `input.width/height` na API passa a `1920 × 1080`, e o player passa a
oferecer 1080p.

## Como reverificar (sem adivinhar)

```
GET https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/stream/<uid>
Authorization: Bearer <CLOUDFLARE_STREAM_API_TOKEN>
```

Ler o `input`. É a fonte. Se disser 1080, o player dá 1080; se disser 720, a
origem é 720 e o resto é conversa.
