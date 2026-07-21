# Preparar o FirstRow — passo a passo

Guia para pôr o MVP a correr de ponta a ponta. (Design fica para depois.)
Tudo corre dentro da pasta `firstrow/`. Os comandos assumem que estás lá: `cd firstrow`.

## Parte 1 — Local + base de dados (~10 min)
1. Copia o ambiente: `cp .env.example .env`
2. Cria uma conta grátis no **Neon** e um projeto novo (o free tier dá ~100 projetos).
3. No Neon: **Connect** → copia a **connection string** (Pooled connection) → cola em `DATABASE_URL` no `.env`. (Opcional: `npx neon@latest init` liga o MCP do Neon ao Claude Code.)
4. Gera o secret de auth: corre `openssl rand -base64 32` e cola o resultado em `BETTER_AUTH_SECRET`.
5. Preenche no `.env`: `NEXT_PUBLIC_APP_URL=http://localhost:3000`, `BETTER_AUTH_URL=http://localhost:3000`, `ADMIN_EMAILS=<o teu email>`.
6. Cria as tabelas: `pnpm db:push`
7. Arranca: `pnpm dev` → abre http://localhost:3000 (deves ver a landing).

## Parte 2 — Vídeo (Cloudflare Stream) (~15 min)
8. Cria conta na **Cloudflare**. No dashboard vai a **Stream** e ativa (pago por uso, ~1€/1000 min — pede cartão).
9. Copia o **Account ID** → `.env` `CLOUDFLARE_ACCOUNT_ID`.
10. **My Profile → API Tokens → Create Token**, com permissão **Stream: Edit** → `.env` `CLOUDFLARE_STREAM_API_TOKEN`.
11. Cria a **signing key** (uma só vez), no terminal:
    ```
    curl -X POST https://api.cloudflare.com/client/v4/accounts/SEU_ACCOUNT_ID/stream/keys \
      -H "Authorization: Bearer SEU_API_TOKEN"
    ```
    Da resposta: `result.id` → `CLOUDFLARE_STREAM_SIGNING_KEY_ID`; `result.jwk` → `CLOUDFLARE_STREAM_SIGNING_KEY_JWK`.

## Parte 3 — Pagamentos (Eupago sandbox) (~15 min)
12. Regista-te no **sandbox**: `sandbox.eupago.pt` (conta de testes). `EUPAGO_ENV=sandbox`.
13. Backoffice → **Canais** → copia a **API Key** → `.env` `EUPAGO_API_KEY`.
14. Define/gera a **chave de encriptação dos webhooks** → `EUPAGO_WEBHOOK_SECRET`.
15. Cria os **beneficiários do split** (liga + plataforma) e copia os `externKey` → `EUPAGO_LEAGUE_EXTERNKEY` e `EUPAGO_PLATFORM_EXTERNKEY`. Deixa `PLATFORM_COMMISSION_PCT=10`.
16. **Confirma com o suporte Eupago** a estrutura exata do array `beneficiaries` do `split-payments/mbway` (a doc pública não a fecha — há um TODO no código, `lib/eupago.ts`).

## Parte 4 — Testar de ponta a ponta
17. Para o webhook da Eupago chegar ao teu PC, abre um **túnel**: `npx cloudflared tunnel --url http://localhost:3000` (ou `ngrok http 3000`). Mete o URL público em `NEXT_PUBLIC_APP_URL` e reinicia o `pnpm dev`.
18. Entra com a conta **admin** → `/admin/eventos` → cria um evento (título, data, preço). Recebes o **servidor + chave RTMP**.
19. No **OBS**: Definições → Transmissão → Serviço "Personalizado" → Servidor = o rtmps, Chave = a stream key → "Iniciar transmissão". Antes disso, confirma a **qualidade de saída** (1080p/30fps/~4500 kbps): a Cloudflare entrega no máximo a resolução com que o OBS codifica — ver `docs/QUALIDADE-VIDEO-OBS.md`.
20. Como espectador (outro browser/conta): `/eventos/{id}` → comprar → confirma no **MB WAY sandbox** → `/eventos/{id}/ver` → live + watermark.
21. Testa a **concorrência**: abre `/ver` em dois sítios com a MESMA conta → o primeiro deve cortar.

## Peça de código ainda em falta
O passo 18/20 ("entrar com a conta") precisa do **ecrã de registo/login**, que ainda não existe — o Better Auth está configurado (`lib/auth.ts`, `lib/auth-client.ts`), falta só a UI em `/entrar` e `/registar`. Sem ela não dá para criar conta pelo browser.
