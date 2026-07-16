# 🔌 Serviços Externos & Integrações

> 🔒 fixo · ✏️ preencher · ☑️ escolher

## Pagamentos
- ☑️ **Provedor:**
  - [ ] Nenhum (grátis)
  - [x] Polar (default — Merchant of Record, trata do IVA da UE)
  - [ ] Lemon Squeezy (MoR)
  - [ ] Stripe (quando tens de ser o comerciante)
- ✏️ **Modelo:** `________`  ·  _subscrição mensal / anual / one-off_
- ✏️ **Planos & preços:** `________`
- ✏️ **Moeda:** `________`
- 🔒 Se MoR: IVA, faturas e reverse-charge B2B tratados pelo provedor.

## Comunicação
- 🔒 **Email transacional:** Resend (ver [Backend](03-BACKEND.md)).
- ☑️ **Email marketing / newsletter:** [ ] Não · [ ] Resend Broadcasts · [ ] Outro: `________`

## IA
- ☑️ **LLM:** [ ] Não · [x] Anthropic Claude
  - ✏️ **Modelo:** `________`  ·  **Budget mensal:** `________`

## Outras integrações
- ✏️ **OAuth / login social:** `________`
- ✏️ **APIs externas:** `________`  ·  _ex.: mapas, dados financeiros, redes sociais_
- ✏️ **Quotas / rate limits a vigiar:** `________`  ·  _o que pode partir no dia 1_

## Conformidade (checklist)
- [ ] Política de privacidade + termos
- [ ] Banner de cookies (se aplicável)
- [ ] Processamento de dados / RGPD mapeado
- [ ] Páginas legais ligadas no footer
