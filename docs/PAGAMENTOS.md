# Pagamentos — FirstRow

## Requisito
**MB WAY é prioritário.** É o que o público PT usa (as ligas já o usam para bilhetes físicos). Multibanco e cartão como complementos. Explorar mais no futuro.

## A tensão com a stack base
O default do template é o **Polar** (Merchant of Record — trata do IVA da UE por nós). **Mas o Polar não faz MB WAY.** Logo, há um trade-off real:

| Opção | MB WAY | IVA | Comerciante | Notas |
|---|---|---|---|---|
| Polar / Lemon Squeezy (MoR) | ❌ | tratado pelo provedor | provedor | Simples no IVA, mas perde conversão em PT |
| Stripe | ⚠️ limitado | nós | nós | MB WAY fraco/instável |
| **IfthenPay / Eupago** | ✅ nativo | **nós** | **nós/liga** | Melhor conversão e custo em PT; ficamos com o IVA |

## Quem é o comerciante?
Pergunta-chave por resolver:
- **A liga é o comerciante** dos seus subscritores (como hoje no Patreon) e a FirstRow fatura-lhe a comissão à parte — mais simples no IVA para nós, e cada liga trata do seu.
- **Ou a FirstRow é o comerciante** (marketplace) e faz o split — mais poder e dados, mas herda todo o IVA/faturação.

## Recomendação (provisória)
Para o MVP: **IfthenPay ou Eupago** (MB WAY nativo, barato), com **a liga como comerciante** dos seus subscritores e a FirstRow a cobrar a comissão por fatura separada. Confirmar viabilidade de split/subcontas e obrigações de IVA antes de fixar.

## Estado
🔴 **Decisão em aberto.** Não bloqueia o desenho do resto; bloqueia o go-live. Reavaliar com um contabilista e com os termos do provedor.
