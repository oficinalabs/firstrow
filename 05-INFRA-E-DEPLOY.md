# 🚀 Infra & Deploy

> 🔒 fixo · ✏️ preencher · ☑️ escolher

## Hosting
- ☑️ **App:**
  - [x] Vercel (default — arrancar rápido, preview deploys)
  - [ ] Coolify + Hetzner (portfólio, custo fixo)
  - [ ] Railway (meio-termo gerido)
- ✏️ **Base de dados alojada em:** `________` (ver [Base de Dados](04-BASE-DE-DADOS.md))
- ✏️ **Domínio & DNS:** `________`  ·  SSL 🔒 automático.

## CI/CD (fixo)
- 🔒 **GitHub Actions** em cada PR: `lint` → `typecheck` → `test` → `build`.
- 🔒 **Ambientes:** preview por PR · (staging) · produção.
- 🔒 **Deploy:** só a partir de `main` verde.

## Variáveis & segredos
- 🔒 Nunca em commit. Geridos no painel do host + `.env.example` no repo.
- ✏️ **Onde estão os segredos de produção:** `________`

## Observabilidade
- 🔒 **Erros:** Sentry.
- ☑️ **Analytics de produto:** [ ] Nenhum · [x] PostHog · [ ] Plausible
- ✏️ **Alertas / uptime:** `________`
- ✏️ **Estratégia de rollback:** `________`
