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

## Decisão
**Eupago, com split payments** (ver [SPIKE-MBWAY-IFTHENPAY-VS-EUPAGO.md](SPIKE-MBWAY-IFTHENPAY-VS-EUPAGO.md)). O espectador paga uma vez por MB WAY e a Eupago divide automaticamente: ~88% para o IBAN da liga, ~10% de comissão para a FirstRow, taxa deduzida no payout. Resolve o "quem é o comerciante". Preço MB WAY ~0,07€ + 0,7% (~2–3% all-in, vs ~23% do Patreon). Alternativa (fallback): IfthenPay, se optarmos por "cada liga é o comerciante" e faturarmos a comissão à parte.

## A confirmar na integração
- Split com MB WAY one-off em sandbox; taxa exata do split.
- IVA/faturação (nem Eupago nem IfthenPay são Merchant of Record — confirmar modelo com contabilista).
- Onboarding/KYC (regulados pelo Banco de Portugal).

## Estado
🟢 **Decidido: Eupago.** Não bloqueia o desenho; os pontos "a confirmar" bloqueiam o go-live.
