# Plano — plataforma completa e sem erros

> Estado em 19/07/2026. A plataforma está em produção em https://firstrow.arestadigital.pt
> com canais em BD, papéis por canal, checkout MB WAY e webhook a funcionar ponta a ponta.
> Este documento é o que falta para a pôr à frente de uma liga sem receio.

## O princípio que atravessa tudo

Esta sessão ensinou a mesma lição **três vezes**:

| O que o código afirmava | O que a medição mostrou |
|---|---|
| "o invariante do dono está garantido pela condição no `where`" | 16 em 20 canais ficaram sem dono |
| "o INSERT antes da Cloudflare fecha a janela de duplicados" | 153 eventos onde deviam ficar 20 |
| "`confirmPaid` valida o pagamento" | apontava para um endpoint inexistente; em produção recusaria tudo |

Nenhum destes foi encontrado a ler código. Todos foram encontrados a **medir**.

**Regra deste plano:** nenhuma afirmação sobre concorrência, idempotência, atomicidade ou
segurança entra sem um número que a sustente. Escreve-se o script, corre-se, mostra-se o
resultado. Uma afirmação por inspeção não vale nada aqui.

---

## Onda 1 — o dinheiro não se pode perder

O risco mais caro não é o site em baixo: é alguém pagar e não receber nada, e nós não darmos
por isso. **Isto já aconteceu hoje**, em sandbox: pagamento confirmado do lado da Eupago,
notificação por email ao admin, e o webhook nunca chegou. A compra ficou `pending` para sempre.

Em produção isso é um cliente que pagou 7,50 €, não tem acesso, e escreve à liga — que escreve
a ti. E não há nada no backoffice que to mostre.

### 1.1 Reconciliação de pagamentos perdidos
O sistema tem de conseguir perguntar à Eupago, sozinho, "estas compras pendentes já foram
pagas?" e fechar as que foram. Peças: um varrimento das compras pendentes com referência,
`confirmPaid` para cada uma, e a mesma ativação idempotente que o webhook usa — nunca um
caminho paralelo que se desvie do original.

Ficamos com uma pergunta em aberto que a frente tem de responder: **quando é que corre?** Cron
da Vercel, ou à chegada de quem abre a página do evento? Decide, justifica, implementa.

### 1.2 O backoffice tem de mostrar dinheiro em risco
Hoje não há onde ver compras pendentes, falhadas ou expiradas. Uma liga que venda 200 bilhetes
precisa de ver as que ficaram a meio, com a referência da Eupago ao lado para poder perguntar.

### 1.3 Prova de consentimento no checkout
A tabela `purchase_consents` existe desde a Frente E e **ninguém escreve nela**. A obrigação
legal (ver `docs/legal/CONTEUDO-PAGINAS.md`, secção 6) é conseguir provar o que a pessoa aceitou:
texto exato mostrado, timestamp, IP, conta. Sem isto, a plataforma não pode cobrar a sério.

---

## Onda 2 — o que um evento real exige

### 2.1 Editar eventos
O backoffice cria e apaga. **Não edita.** Uma hora mudou, um preço mudou, o título tinha um erro
— hoje a única saída é apagar e criar outro, e apagar recusa se já houve vendas. É o buraco mais
óbvio para quem usa isto a sério.

### 2.2 Quando as coisas falham, dizer o quê
Cloudflare em baixo, Eupago a devolver erro, stream que não arranca, QR que não valida. Hoje o
utilizador vê um ecrã partido ou uma mensagem genérica. Cada falha previsível precisa de um
estado com texto humano e uma saída.

### 2.3 As cadeias que nunca foram percorridas
Nunca foram testadas de ponta a ponta, nem uma vez: **OBS → live → VOD**, e **comprar bilhete →
QR → validar à porta**. Não é código novo; é provar que o que existe funciona, e corrigir o que
aparecer.

---

## Onda 3 — a rede de segurança

### 3.1 Não há testes automatizados
Nenhum. Toda a garantia desta sessão veio de scripts descartáveis que se apagaram a seguir. Isso
significa que **cada um dos três bugs acima pode voltar amanhã sem ninguém dar por isso**.

O que interessa cobrir, por ordem: as regras de dinheiro (idempotência da ativação, janela da
cobrança, split), o isolamento entre canais, o invariante do dono, a guarda de duplicados, e a
validação do QR. Testes de concorrência a sério — não `expect(true)`.

### 3.2 `notFound()` responde 200
Debaixo de `/admin` e nas páginas de evento, o `notFound()` devolve **200** porque a resposta já
começou a ser enviada. Não há fuga (medido pela Frente H: a resposta a um evento alheio é byte a
byte igual à de um id inventado), mas o `docs/SEGURANCA-APP.md` **promete 404** em duas linhas.
Ou se cumpre a promessa, ou se corrige o documento — uma promessa por cumprir vale menos que uma
limitação assumida.

### 3.3 O limite de pedidos não sobrevive ao serverless
`lib/rate-limit.ts` guarda contadores em memória. Cada instância da Vercel tem a sua, e elas
morrem entre pedidos. Na prática **não há limite nenhum**, e isso não pode ser descrito a uma
liga como proteção.

---

## Onda 4 — apresentável a uma liga

### 4.1 Páginas legais
O conteúdo está pesquisado e escrito (`docs/legal/CONTEUDO-PAGINAS.md`): privacidade, termos,
reembolsos, cookies, FAQ. **Não existe uma única rota.** Faltam as páginas, os links no rodapé, e
os 11 pontos marcados `[VERIFICAR COM ADVOGADO]` continuam por rever.

### 4.2 Detalhes que se notam
Imagem OG da raiz, metadados por página, e uma passagem de acessibilidade a sério (foco, teclado,
leitor de ecrã) — não só contraste, que a Frente F já garantiu.

---

## Fora deste plano (dependem de terceiros)

- **Split de pagamentos** — bloqueado na Eupago. É o único bloqueador de dinheiro real.
- **Webhook em pagamento genuíno** — só se prova com um MB WAY a sério em sandbox.
- **Release de segurança do Next** — instalar quando sair.

## Decisões de produto (tomadas 19/07/2026)

- **Comissão da plataforma:** 10%.
- **Janela de acesso ao VOD:** 30 dias após o evento.
- **Entidade legal nos documentos:** Aresta.
- **`/admin/subscritores`:** separado **por canal** (não junta compradores de vários canais).
- **Email de suporte:** a intenção é `suporte@arestadigital.pt` (domínio já verificado no Resend),
  mas a caixa **ainda não existe** — o Rui tem de a criar. Usar este endereço nos textos e marcar
  como pendente de criação onde for preciso.

### Ainda por decidir
- **NIF** da entidade legal para os documentos — fica `[DEFINIR]` até o Rui o dar.
