# Spike — Pagamentos MB WAY: IfthenPay vs Eupago

Data: 2026-07-16. Objetivo: escolher o provedor de MB WAY para a FirstRow e fechar a [ADR-007](DECISOES.md).

## TL;DR
**Escolha: Eupago.** Preço de MB WAY igual ao IfthenPay, mas a Eupago tem **split payments** (dividir automaticamente um pagamento entre vários recebedores) — que é exatamente o modelo da FirstRow: o espectador paga uma vez por MB WAY e o dinheiro divide-se sozinho entre o IBAN da liga e a comissão da FirstRow. Tem também **recorrência** (Fase 1) e **cartões internacionais** (para os PALOPs, onde o MB WAY não chega). O IfthenPay fica como alternativa simples se a FirstRow **não** for o comerciante.

## Preço (praticamente igual)
| Método | IfthenPay | Eupago |
|---|---|---|
| MB WAY (online) | 0,07€ + 0,7% | 0,07€ + 0,7% |
| Referência Multibanco | 0,20€ + 1,5% | tarifa fixa/mista (serviço "Terra") |
| Cartão | 0,20€ + 1,5% | TPA 0,09% + 0,08€ (mín. 15€/mês) |
| Mensalidade | Nenhuma | Nenhuma p/ MB WAY/Multibanco; mín. 15€/mês só no TPA de cartão |

Acresce IVA (23%) sobre a comissão.

**Na prática, MB WAY custa ~2–3% all-in:**
- 8,59€ → ~0,13€ de taxa (~1,5%; ~1,9% c/ IVA).
- 3,50€ → ~0,09€ (~2,7%; ~3,3% c/ IVA).

Contexto: o Patreon leva ~23%. **Qualquer um dos dois é ~10x mais barato** — é o argumento de venda em números.

## O que decide: split payments (só a Eupago)
A **Eupago tem split payments**, pensado para marketplaces/plataformas/criadores (dão o exemplo do "Tipme", distribuição a criadores). Funciona com **MB WAY**:
- O cliente faz **um** pagamento; a Eupago **divide automaticamente** pelos recebedores.
- Cada recebedor (liga) dá o seu **IBAN**; define-se a **% de cada um**; a comissão da FirstRow e a taxa da Eupago são deduzidas no payout.
- Timing imediato ou pós-cumprimento; reembolsos suportados em MB WAY/cartão.

Isto resolve o "quem é o comerciante / como tiro a minha comissão": a FirstRow tira ~10% automaticamente, a liga recebe ~88% no IBAN dela, tudo numa transação.

O **IfthenPay não tem split/marketplace** (só recebedor único). Serve se cada liga tiver a sua própria conta e a FirstRow faturar a comissão à parte — mais manual, não escala tão bem entre várias ligas.

## Recorrência (Fase 1)
- **Eupago:** suporta recorrentes (confirmação por callback, tentativas de retry, cancelamento pelo cliente), incluindo MB WAY ("menos comum") + cartão/débito direto/Multibanco.
- **IfthenPay:** recorrência sobretudo via débito direto; sem gestão de subscrições MB WAY explícita.

## Internacional / PALOPs
- **MB WAY é só Portugal** (~5M de utilizadores PT). Para os PALOPs precisas de **cartão**.
- **Eupago:** Visa/Mastercard de todo o mundo; no split "a comissão é igual independentemente do país".
- **IfthenPay:** também tem cartão, mas é mais PT-focado.

## Developer experience
- **IfthenPay:** SDK PHP + SDK JavaScript (browser, `@ifthenpay/js-sdk`); Node não é explicitamente suportado no SDK (chama-se a REST API do lado do servidor). Callback = HTTP GET com chave anti-phishing. Simples, boa doc, arranque rápido. Docs: ifthenpay.com/docs.
- **Eupago:** REST API (eupago.readme.io) + callbacks. Mais features (split, recorrência) = um pouco mais para aprender. Integra bem do lado do servidor (Next.js Route Handlers).

## A tratar na integração (não bloqueia decidir; bloqueia go-live)
- Confirmar **split com MB WAY one-off em sandbox** (é o fluxo da Fase 0).
- **Taxa exata do split** da Eupago.
- **IVA / faturação:** nem Eupago nem IfthenPay são Merchant of Record (ao contrário do Polar) → o IVA/faturas são da FirstRow e/ou das ligas. Confirmar com contabilista o modelo (provável: cada liga trata do seu IVA sobre a sua fatia; a FirstRow sobre a comissão).
- **Onboarding/KYC:** ambos são instituições reguladas pelo Banco de Portugal → contar com documentação de empresa e KYC (dias, não minutos).

## Decisão
**Eupago, com split payments.** Fecha a [ADR-007](DECISOES.md). Fallback: IfthenPay se optarmos por "a liga é o comerciante".

## Fontes
- IfthenPay — custos do serviço: https://helpdesk.ifthenpay.com/pt-PT/support/solutions/articles/79000086484
- IfthenPay — docs/API/callback: https://www.ifthenpay.com/docs/en/
- Eupago — split payments: https://www.eupago.com/payment-options/split-payments
- Eupago — pagamentos recorrentes: https://www.eupago.pt/opcoes-de-pagamento/pagamentos-recorrentes
- Eupago — preçário: https://www.eupago.com/pricing
- Comparação de gateways PT: https://ecommerceparatodos.pt/os-10-melhores-gateways-de-pagamento-em-portugal-para-lojas-online/
