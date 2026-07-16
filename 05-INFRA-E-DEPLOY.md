# 🚀 Infra & Deploy

> 🔒 fixo · ✏️ preencher · ☑️ escolher

## Hosting
- ☑️ **App:**
  - [x] Vercel (default — arrancar rápido, preview deploys)
  - [ ] Coolify + Hetzner (portfólio, custo fixo)
  - [ ] Railway (meio-termo gerido)
- ✏️ **Base de dados alojada em:** Supabase (ver [Base de Dados](04-BASE-DE-DADOS.md))
- ✏️ **Domínio & DNS:** `joinfirstrow.com` (a comprar) · DNS na Cloudflare (que também aloja o Stream) · SSL 🔒 automático.

## CI/CD (fixo)
- 🔒 **GitHub Actions** em cada PR: `lint` → `typecheck` → `test` → `build`.
- 🔒 **Ambientes:** preview por PR · (staging) · produção.
- 🔒 **Deploy:** só a partir de `main` verde.

## Variáveis & segredos
- 🔒 Nunca em commit. Geridos no painel do host + `.env.example` no repo.
- ✏️ **Onde estão os segredos de produção:** painel da Vercel (env) + Cloudflare; `.env.example` sempre atualizado no repo.

## Observabilidade
- 🔒 **Erros:** Sentry.
- ☑️ **Analytics de produto:** [ ] Nenhum · [x] PostHog · [ ] Plausible
- ✏️ **Alertas / uptime:** Sentry (erros); uptime da live a definir (Better Stack / UptimeRobot) — crítico nas noites de evento.
- ✏️ **Estratégia de rollback:** Vercel instant rollback + migrations reversíveis (Drizzle).
