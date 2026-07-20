# Segurança da aplicação — quem acede a quê, e como se garante

> Estado: verificado a **19 de julho de 2026** contra o build de **produção**
> (`pnpm build && pnpm start`) e a base de dados **Neon real**.
> Frente B (autorização, blindagem de rotas e segredos) +
> Frente E (isolamento entre canais — ver a secção própria) +
> Frente H (escolha de canal ao criar, e o isolamento medido ponta a ponta com
> dois canais a sério).

Este documento é o mapa de quem pode o quê e, mais importante, **como é que
isso é garantido** — porque em Next 16 o sítio onde se põe o gate muda o
resultado, e há sítios que parecem seguros e não são. A secção
[As três barreiras](#as-três-barreiras) explica porquê; começa por aí se só
leres uma coisa.

---

## Princípios

1. **A base de dados manda.** O papel vive na coluna `user.role`. O que chega
   ao browser serve para pintar ecrãs; autorizar é sempre no servidor, a cada
   pedido (`server/authz.ts`).
2. **Cada camada defende-se sozinha.** Nenhuma rota confia em ter sido
   protegida mais acima. Um route handler não herda o gate do layout, e um
   layout não protege a página do mesmo segmento (ver
   [a fuga que isto fechou](#a-fuga-que-isto-fechou)).
3. **401 é "não sei quem és". 403 é "sei e não podes".** Recurso que não é teu
   responde **404** — um 403 confirmaria que existe.
4. **O erro cai para o lado seguro.** Papel desconhecido é tratado como o menos
   poderoso, nunca como acesso.
5. **Nada de segredos no cliente.** Verificado com o bundle na mão, não por fé
   — ver [Auditoria de segredos](#auditoria-de-segredos).

---

## Papéis

O poder tem **dois andares**. É a mudança mais importante desde a Frente B e
está explicada em [Isolamento entre canais](#isolamento-entre-canais).

**Global** — coluna `user.role`, vale na plataforma inteira:

| Papel            | O que abre                                                 |
| ---------------- | ---------------------------------------------------------- |
| `platform_admin` | Tudo, em todos os canais. Somos nós.                       |
| `viewer`         | Compra e vê. É o valor por omissão de qualquer conta nova. |

**Por canal** — tabela `channel_members`, vale só no canal onde está:

| Papel   | O que abre                                                              |
| ------- | ----------------------------------------------------------------------- |
| `owner` | Gere **este** canal: eventos, dinheiro, compradores.                     |
| `staff` | **Opera** um evento **deste** canal: transmissão e validação à porta.    |

Predicados (`server/authz.ts`, puros, sem I/O):

- `isPlatformAdmin(user)` → global, `platform_admin`
- `canManageEvents(user, channelId)` → `platform_admin` ou `owner` **do canal**
- `canOperateEvents(user, channelId)` → `platform_admin`, `owner` ou `staff` **do canal**
- `canEnterBackoffice(user)` → gere **algum** canal; é só a porta do `/admin`
- `manageScope(user)` / `operateScope(user)` → os canais que as queries agregadas
  podem somar

Não existe `canManageEvents(user)` sem canal: a pergunta sem canal não tem
resposta certa, e uma assinatura que a aceitasse era um convite a assumir o
canal por defeito. O compilador apanha quem se esqueça.

`platform_admin` passa por cima de tudo sem ser membro de nada. Um papel de
canal desconhecido **não é membro** — nunca é acesso.

---

## Matriz de autorização

### Páginas

Nas colunas de canal, `owner`/`staff` querem dizer **deste canal**. Quem tem o
papel noutro canal conta como `viewer` para estas rotas.

| Rota            | Anónimo                | `viewer`               | `staff`                | `owner` / `platform_admin`        | Onde é decidido                     |
| --------------- | ---------------------- | ---------------------- | ---------------------- | --------------------------------- | ----------------------------------- |
| `/`, `/sobre`, `/criadores`, `/canal/**` | ✅ | ✅ | ✅ | ✅ | público |
| `/eventos/[id]` | ✅                     | ✅                     | ✅                     | ✅                                | público (a compra é que fecha)      |
| `/eventos/[id]/ver` | → `/eventos/[id]`  | só com direito ativo   | idem                   | idem                              | página + `hasActiveEntitlement`     |
| `/conta`        | → `/entrar?next=`      | ✅ (só os seus dados)  | ✅                     | ✅                                | `proxy.ts` + página                 |
| `/bilhetes`     | → `/entrar?next=`      | ✅ (só os seus)        | ✅                     | ✅                                | `proxy.ts` + página                 |
| `/admin/**`     | \_\_\_\_\_\_           | \_\_\_\_\_\_           | \_\_\_\_\_\_           | \_\_\_\_\_\_                      | tabela própria, já a seguir — deixou de ter uma resposta só |
| `/sem-acesso`   | ✅                     | ✅                     | ✅                     | ✅                                | público (é a página de recusa)      |

> **A descrição do evento é texto de utilizador**, e as duas páginas que a
> desenham — `/eventos/[id]` e `/eventos/[id]/ver` — tratam-na como filho de
> texto: o React escapa-a, e as quebras de linha são desenhadas por
> `whitespace-pre-line`, sem marcação pelo meio. Não há `dangerouslySetInnerHTML`
> em caminho nenhum da descrição, e há um teste que lê o código-fonte desses
> ficheiros e falha se alguém acrescentar o atalho.

#### O backoffice, página a página

> Estado: **medido a 21 de julho de 2026** contra o build de produção na porta
> 3012, com sessões reais das quatro contas. Os códigos são os observados, não
> os pretendidos. Frente T.

O `/admin` deixou de ter **uma** porta. Cada caminho declara o papel mínimo de
que precisa em [`lib/backoffice-zones.ts`](../lib/backoffice-zones.ts), e essa
tabela é lida em três sítios — `proxy.ts` (que corta), o gate de cada página
(`requireBackofficePage`) e a navegação lateral (que se filtra por ela). Uma
tabela só, três leitores: é o que impede a sidebar de oferecer o que a porta
recusa.

| Rota                            | Zona       | Anónimo | `viewer` | `staff` | `owner` | `platform_admin` |
| ------------------------------- | ---------- | ------- | -------- | ------- | ------- | ---------------- |
| `/admin`                        | `manage`   | 307 `/entrar` | 307 `/sem-acesso` | **307 `/admin/scanner`** | 200 | 200 |
| `/admin/eventos`                | `manage`   | 307 `/entrar` | 307 `/sem-acesso` | 307 `/sem-acesso` | 200 | 200 |
| `/admin/eventos/novo`           | `manage`   | 307 `/entrar` | 307 `/sem-acesso` | 307 `/sem-acesso` | 200 | 200 |
| `/admin/canais`                 | `manage`   | 307 `/entrar` | 307 `/sem-acesso` | 307 `/sem-acesso` | 200 | 200 |
| `/admin/canais/[id]`            | `manage`   | 307 `/entrar` | 307 `/sem-acesso` | 307 `/sem-acesso` | 200 | 200 |
| `/admin/canais/[id]/membros`    | `manage`   | 307 `/entrar` | 307 `/sem-acesso` | 307 `/sem-acesso` | 200 | 200 |
| `/admin/subscritores`           | `manage`   | 307 `/entrar` | 307 `/sem-acesso` | 307 `/sem-acesso` | 200 | 200 |
| `/admin/pagamentos`             | `manage`   | 307 `/entrar` | 307 `/sem-acesso` | 307 `/sem-acesso` | 200 | 200 |
| `/admin/ganhos`                 | `manage`   | 307 `/entrar` | 307 `/sem-acesso` | 307 `/sem-acesso` | 200 | 200 |
| **`/admin/scanner`**            | `operate`  | 307 `/entrar` | 307 `/sem-acesso` | **200** | 200 | 200 |
| `/admin/eventos/[id]/transmissao` | `operate` | 307 `/entrar` | 307 `/sem-acesso` | **200** | 200 | 200 |
| `/admin/eventos/[id]/bilhetes`  | `operate`  | 307 `/entrar` | 307 `/sem-acesso` | **200** | 200 | 200 |
| `/admin/eventos/[id]/editar`    | `operate`¹ | 307 `/entrar` | 307 `/sem-acesso` | 200¹ | 200 | 200 |
| `/admin/plataforma`             | `platform` | 307 `/entrar` | 307 `/sem-acesso` | 200² | 200² | 200 |
| `/admin/canais/novo`            | `platform` | 307 `/entrar` | 307 `/sem-acesso` | 200² | 200² | 200 |

¹ A zona abre; **quem decide é `requireEventManager`** (owner do canal do
evento), dentro da página. A zona é grossa de propósito — é o caminho, e o
caminho não sabe de que canal é o evento. Quem só opera não passa do gate fino.

² **200 com o corpo do 404.** A página responde `notFound()` (o gate próprio
corre antes da primeira query), mas o streaming do App Router já enviou o
cabeçalho — é o mesmo fenómeno descrito em
[⚠️ O "404" das páginas é, na verdade, um 200](#️-o-404-das-páginas-é-na-verdade-um-200--e-porque-é-que-continua-a-servir).
Medido: o corpo traz só a moldura, sem um único número da plataforma. O
`proxy.ts` deixa estas zonas passar **de propósito** — um `redirect` para
`/sem-acesso` confirmava que o ecrã existe, que é o que o 404 esconde.

**Fuga medida:** com sessão de `league_staff`, nenhuma das rotas acima devolveu
`7,50 €`, `Receita`, `Extrato`, o nome ou o email de um comprador no corpo em
bruto (HTML + payload RSC). As mesmas sondas com sessão de `owner` acusam
`7,50 €×4`, `Receita×2` e o nome do comprador em `/admin` — ou seja, a sonda
funciona; o que não aparece é porque não foi enviado.

> **Porque é que o `staff` entra agora.** Ele existe precisamente para validar
> bilhetes à porta, e o scanner vive em `/admin/scanner` — enquanto o gate foi
> único e exigiu `owner`, o único papel feito para o scanner era o único que não
> lhe chegava. **A ordem da troca foi obrigatória e é de segurança:** primeiro
> as páginas de dinheiro e dados ganharam gate próprio, só depois a porta
> aliviou. Pela ordem inversa, entre um passo e o outro o staff da porta via a
> contabilidade da liga.

> **`manage` é a omissão, e isso é a rede.** Um caminho de `/admin` que ninguém
> tenha classificado exige `owner`. Uma página nova nasce fechada ao staff, e
> quem a quiser abrir tem de o ir dizer à tabela — uma linha a mais, e não uma
> fuga a menos.

> **`/admin/**` para um `owner` não quer dizer "vê tudo".** A zona abre a porta;
> o que se vê lá dentro é limitado pelo `ChannelScope` de cada query. Ver
> [Isolamento entre canais](#isolamento-entre-canais).

> **Dentro de uma página `operate`, o dinheiro continua a ser do `owner`.** A
> transmissão e os bilhetes abrem-se à equipa (é lá que se opera o direto e a
> porta), mas o cartão de vendas/receita da transmissão, a receita dos bilhetes
> e o export CSV seguem `canManageEvents` **do canal do evento**. Foi a medição
> que os apanhou: ao abrir a porta ao staff, essas três coisas passaram a ir no
> corpo para quem só valida QR codes.

> **Os dois predicados da porta não são o mesmo, e o nome importa.**
> `canEnterBackoffice` = opera **algum** canal (é só a porta, e é a pergunta do
> atalho no header). `canManageAnyChannel` = gere **algum** canal, e é o que
> guarda dinheiro sem canal à frente — a action de reconciliação de pagamentos e
> o botão de criar evento. Eram a mesma função: alargar a porta sem os separar
> teria aberto a reconciliação de pagamentos a quem valida bilhetes.

### Rotas de API e route handlers

`owner` = dono **do canal do evento em causa**.

| Rota                                        | Regra                          | Anónimo | `viewer` | `owner` |
| ------------------------------------------- | ------------------------------ | ------- | -------- | -------------- |
| `POST /api/admin/events`                    | canal alvo + `canManageEvents` | 401     | 403      | ✅ · **400**⁶  |
| `POST /api/tickets/validate`                | `canOperateEvents` no canal do evento + limite | 401 | **404**⁵ | ✅   |
| `GET /admin/eventos/[id]/bilhetes/export`   | `canManageEvents` no canal do evento | 307¹ | 307¹  | ✅             |
| `GET /admin/eventos/[id]/transmissao/live`  | `canOperateEvents` no canal do evento | 307¹ | 307¹ | ✅             |
| `POST /api/playback/[id]/session`           | sessão + **direito** + limite  | 401     | 403²     | 403²           |
| `POST /api/playback/[id]/heartbeat`         | sessão + posse da sessão       | 401     | `{active:false}` | —      |
| `GET /api/entitlements/[id]`                | sessão (só a própria conta)    | 401     | ✅       | —              |
| `POST /api/checkout/[id]`                   | sessão + limite                | 401     | ✅       | —              |
| `POST /api/tickets/checkout/[id]`           | sessão + limite                | 401     | ✅       | —              |
| `GET /api/tickets/status/[id]`              | sessão + **dono** do bilhete   | 401     | **404**³ | —              |
| `POST /api/auth/**`                         | público, com limite            | ✅      | ✅       | ✅             |
| `POST /api/webhooks/eupago`                 | assinatura HMAC                | 401⁴    | —        | —              |

¹ Vivem debaixo de `/admin/**`, por isso é o `proxy.ts` que os apanha primeiro
e redireciona. O gate próprio (`canManageEvents` / `canOperateEvents`) continua
lá por baixo, para o caso de o matcher do proxy falhar.
² Correto: o acesso à reprodução é o **direito comprado**, não o papel. Um
admin sem bilhete também não vê — e é isso que se quer.
³ **404 e não 403**, de propósito: a query filtra por dono, por isso um bilhete
de outra pessoa é indistinguível de um bilhete inventado. Enumerar ids não
devolve informação nenhuma.
⁴ Sem assinatura válida não passa. A verificação é HMAC-SHA256 do corpo cru com
comparação em tempo constante (`timingSafeEqual`), feita **antes** do `JSON.parse`.
⁵ **404 e não 403**, pela mesma razão do ³: um evento de outro canal tem de ser
indistinguível de um id inventado. Ver [Isolamento entre canais](#isolamento-entre-canais).
⁶ **400** quando gere mais do que um canal e não indica `canal` no corpo: é um
pedido incompleto, que o cliente corrige sozinho, e não uma falta de permissão.
Canal alheio e canal inexistente dão **403 com a mesma mensagem**. Ver
[Escolher o canal ao criar um evento](#escolher-o-canal-ao-criar-um-evento).

---

## Isolamento entre canais

> Estado: verificado a **19 de julho de 2026** contra um Postgres real, com o
> código de produção e **dois canais** semeados. Frente E.

**O bug que isto fechou.** Os papéis eram globais: `league_owner` era uma
coluna do utilizador, não um papel numa liga. Com um canal só — a SmokingBars,
que estava *hardcoded* em `lib/channels.ts` — ninguém notava. No dia em que
entrasse a segunda liga, o dono da primeira passava a ser dono **de tudo**: dos
eventos e do dinheiro de uma liga que nunca viu.

Agora o canal é uma linha em `channels`, o poder vive em `channel_members`, e
`events.channel_id` diz de quem é cada evento.

### As duas perguntas, e onde cada uma se responde

| A pergunta                     | Quem responde                      | Como                                    |
| ------------------------------ | ---------------------------------- | --------------------------------------- |
| "Podes mexer **neste evento**?" | `server/event-access.ts`           | o canal vem de `event.channelId`; não é teu → **404** |
| "De que canais podes **somar**?" | `manageScope` / `operateScope`     | um `ChannelScope` que entra em cada query agregada |

A regra da segunda é a que mais importa acertar: **uma lista de canais vazia
significa zero linhas, nunca "sem filtro"**. `inChannelScope()`
(`server/events.ts`) devolve `false` explícito nesse caso.

### O que estava a fugir e não estava na lista de tarefas

Todas as queries de `server/stats.ts` corriam sobre a tabela de eventos
inteira, sem filtro nenhum. Com duas ligas, o dono da primeira abria o
backoffice e via, sem fazer nada de especial:

| Ecrã                    | O que fugia da outra liga                        |
| ----------------------- | ------------------------------------------------ |
| `/admin`                | receita e nº de compras do mês; últimos pagamentos com **nome do comprador** |
| `/admin/eventos`        | a lista de eventos, com receita por evento       |
| `/admin/subscritores`   | **nome e email** de todos os compradores         |
| `/admin/ganhos`         | o extrato mês a mês, ao cêntimo                  |
| `/admin/plataforma`     | receita total e nº de contas da plataforma toda  |

Mais dois, fora do `server/stats.ts`:

- **`server/tickets.ts`** — a busca do código curto varria a tabela de bilhetes
  toda para poder dizer "isto é de outro evento". Essa resposta leva o **nome do
  comprador** e o **título do evento**: o porteiro de uma liga lia um código e
  ficava a saber quem comprou o quê na outra. A busca passou a parar no canal,
  e o mesmo filtro teve de ir para a query de detalhe — um QR completo
  (`frt_…`) não passa pela busca do código curto e chegava lá direto.
- **`/admin/eventos/[id]/bilhetes/export`** — o CSV de compradores só verificava
  o papel, não o canal. Quem soubesse (ou adivinhasse) um id descarregava os
  contactos de qualquer evento da plataforma.

### Escolher o canal ao criar um evento

> Frente H. Medido a **19 de julho de 2026** contra o build de produção e a base
> **`firstrow_teste`** com **dois canais e um dono para cada**.

Criar é a única operação sem evento de onde tirar o canal, por isso é a única
que o tem de escolher. `resolveChannelForNewEvent` recusava quando havia mais do
que um — correto, mas deixava o backoffice sem forma de criar assim que
entrasse a segunda liga. Agora há uma escolha, e a regra é:

| Canais onde a pessoa pode criar | O que o formulário faz                     |
| ------------------------------- | ------------------------------------------ |
| 0                               | não mostra formulário nenhum — diz que falta criar um canal |
| 1                               | **não pergunta**: preenche e mostra qual é  |
| 2 ou mais                       | seletor, **sem canal pré-escolhido**        |

Não pré-escolher com vários é deliberado: um valor por omissão é a forma mais
barata de criar o evento — e o dinheiro dele — na liga errada.

**A lista oferecida e a lista aceite são a mesma função** (`listCreatableChannels`).
Se fossem calculadas em sítios diferentes, o formulário acabava por oferecer um
canal que a gravação recusava.

O seletor **não é a segurança**: o slug vem do cliente e é revalidado contra
`canManageEvents` a cada pedido. Medido, com o dono da liga A a pedir a liga B:

| Pedido a `POST /api/admin/events`            | Resposta |
| -------------------------------------------- | -------- |
| sem sessão                                    | **401**  |
| `viewer` sem canais                           | **403** "Não tens nenhum canal onde criar eventos." |
| dono de A com `canal: "<slug de B>"`          | **403**  |
| dono de A com `canal: "<slug inexistente>"`   | **403**, **mensagem idêntica** à de cima |
| `platform_admin` com 2 canais, sem `canal`    | **400** "Escolhe o canal onde o evento vai nascer." |
| dono de um canal só, sem `canal`              | **201**, nasce no canal dele |
| dados inválidos **+** canal alheio            | **403** (autorização antes de validação — um 400 já contava que o canal existe) |

O 400 é o único status novo: não dizer qual dos teus canais é um pedido
incompleto que o cliente corrige sozinho, não uma falta de permissão. A resposta
continua a devolver **só o `id`** — a chave da stream vai-se buscar à página de
transmissão.

### Uma consequência boa

O âmbito também tapa a [fuga do render em paralelo](#a-fuga-que-isto-fechou):
as páginas do backoffice já correm as queries antes de o gate do layout as
travar, mas agora essas queries levam os canais de quem pede. Quem não gere
nenhum recebe **zeros**, não a receita de toda a gente.

### ⚠️ O "404" das páginas é, na verdade, um 200 — e porque é que continua a servir

> Achado da Frente H, ao medir. **Não é regressão de ninguém: é assim desde
> sempre e é a mesma causa da [fuga do render em paralelo](#a-fuga-que-isto-fechou).**

A matriz acima diz que `/admin/eventos/[id]/**` responde **404** a um evento de
outro canal. Medido contra o build de produção, responde **200** com o ecrã de
"não encontrado" no corpo. O mesmo acontece em qualquer página que chame
`notFound()` em runtime (`/eventos/[id]`, `/canal/[slug]`) — só um caminho que
não casa com rota nenhuma dá 404 a sério.

A causa é a de sempre: estas páginas são dinâmicas e a resposta **já começou a
ser enviada** quando o `notFound()` corre. O status já foi para o fio.

**O que importa é que a propriedade que o 404 protegia continua de pé.** A regra
nunca foi "o número tem de ser 404", foi *"um evento de outro canal tem de ser
indistinguível de um id inventado"*. Medido com ids do mesmo comprimento
(UUID vs UUID), a pedir o evento de outra liga e um id inventado:

| Rota                              | Evento real de outro canal | UUID inventado | Iguais? |
| --------------------------------- | -------------------------- | -------------- | ------- |
| `/admin/eventos/<id>/transmissao` | 200 · 41 377 bytes         | 200 · 41 377 bytes | **byte a byte** |
| `/admin/eventos/<id>/bilhetes`    | 200 · 37 784 bytes         | 200 · 37 784 bytes | **byte a byte** |

Mesmo status, mesmo tamanho, mesmo hash do corpo depois de normalizar o id. Não
há oráculo: nem pelo conteúdo, nem pelo tamanho da resposta. Varrer ids não
devolve informação nenhuma sobre a liga do lado.

**O que se perde**, e é real: quem contar 4xx no CDN para detetar alguém a bater
a portas fechadas não vê estes. É a mesma troca já assumida em
[O preço: o status do 403](#o-preço-o-status-do-403). As **rotas de API** não
sofrem disto (não streamam) e continuam a dar 404 de verdade — confirmado no
`GET /admin/eventos/[id]/bilhetes/export`, que devolveu **404** ao dono da
outra liga.

### ⚠️ A guarda de duplicados não aguentava pedidos em paralelo

> Achado da Frente H, ao medir antes de mexer. Corrigido em `server/events.ts`.

`createEvent` tinha uma guarda contra duplicados nascida de um incidente real
(16 eventos "TESTE" em produção), e o comentário afirmava que pôr o INSERT antes
da chamada à Cloudflare fechava a janela dos pedidos em paralelo, sobrando só a
hipótese de dois coincidirem "nos poucos milissegundos entre a leitura e a
escrita".

**Foi medido e era falso.** 20 rondas × 8 pedidos em paralelo com o mesmo título
e a mesma hora, contra o build de produção:

| | Eventos criados (esperado: 20) | Rondas com duplicados |
| --- | --- | --- |
| **Antes** | **153** de 160 pedidos | **19 de 20** |
| **Depois** | **20** | **0** |

Um `SELECT` seguido de `INSERT` não é atómico: em READ COMMITTED nenhum dos oito
vê as linhas por confirmar dos outros sete e todos concluem que são o primeiro.
A única ronda que se safou foi a primeira, com o servidor frio — o arranque
atrasou os outros o suficiente. É **a mesma lição** do invariante "um canal
nunca fica sem dono": uma condição dentro do `where` não serializa nada.

A correção é um `pg_advisory_xact_lock` com uma chave derivada de
canal + título + hora, a envolver a leitura e a escrita. Serializa só os pedidos
do **mesmo** evento, larga sozinho no commit ou rollback, e **não precisa de
migração**. A chamada à Cloudflare fica de fora da transação — um lock à espera
de uma HTTP de terceiros era trocar um problema por outro.

Na prática o botão que desativa ao primeiro clique já tapava o caso humano; o
que isto fecha é o cliente com retry automático, o script, e o duplo pedido que
o HTTP/2 deixa sair ao mesmo tempo.

### Como foi verificado

**Isolamento entre dois canais, ponta a ponta** (Frente H) — build de produção
(`next build && next start`) contra a base **`firstrow_teste`** com dois canais,
um `owner` para cada, eventos, compras e compradores com nomes e emails
distintos. Sessões reais, obtidas pelo login normal. Procurou-se, no **corpo em
bruto de cada resposta** (que inclui o payload RSC), cada marcador do outro
canal — nome do canal, título do evento, nome e email do comprador:

| Ecrã | Dono de A vê algo de B? | Dono de B vê algo de A? |
| --- | --- | --- |
| `/admin` | 0 marcadores | 0 |
| `/admin/eventos` | 0 | 0 |
| `/admin/ganhos` | 0 | 0 |
| `/admin/subscritores` | 0 | 0 |
| `/admin/scanner` | 0 | 0 |

**16 asserções, 0 falhas.** Inclui os dois controlos que impedem um falso
positivo: cada dono **vê mesmo** o seu evento (o filtro não é "não mostra
nada"), e o `platform_admin` vê os dois.

**Extrato por canal** — o `getMonthlyStatement` passou a agrupar por mês **e**
canal. As taxas somam-se por transação (`sum(round(x))`, não `round(sum(x))`),
por isso reagrupar não podia mexer nos totais; confirmado contra o agrupamento
antigo: bruto, compras, taxa FirstRow, taxa Eupago e líquido **iguais ao
cêntimo** (41,00 € / 4 compras / 36,34 € líquido).

**Isolamento (Frente E)** — Postgres real (PGlite sobre socket) com o schema anterior à
migração, dados com a forma dos de produção, e depois uma segunda liga semeada.
As funções testadas são as **de produção**, importadas diretamente:

- 10 asserções sobre os predicados puros — dono de A não gere nem opera B; staff
  opera mas não gere; `platform_admin` passa sem ser membro; papel de canal
  desconhecido **não** dá acesso; `null` não dá acesso.
- 12 asserções sobre as queries — subscritores, extrato, lista de eventos,
  pagamentos recentes e dashboard, cada um só com o seu canal; `platform_admin`
  vê os dois; e o caso crítico: **conta sem canais vê zero, não tudo**.

**Migração** — contra a base **`firstrow_teste`** (Neon, separada de produção),
partindo do schema anterior materializado com `drizzle-kit push` e um fixture
com a forma de produção: 2 eventos `draft`, 1 `platform_admin` + 3 `viewer`,
compras, bilhetes e sessão de reprodução.

Os dois ramos foram exercitados:

| Cenário | Resultado |
| --- | --- |
| **com** `league_owner`/`league_staff` (que produção não tem) | convertidos em `owner`/`staff` do canal; o Rui **não** é acrescentado, porque já há dono |
| **sem** nenhum (igual a produção hoje) | nada a converter; o Rui entra como `owner` da SmokingBars |

Ciclo completo em ambos: aplicar → reaplicar (idempotente) → `--rollback` →
aplicar outra vez, com os 2 eventos, entitlements, bilhetes e sessão intactos
em todas as passagens. Mais 20 asserções sobre o estado final, incluindo:

- o `--rollback` devolve `league_owner`/`league_staff` à coluna **antes** de
  deitar as filiações fora, e recusa-se a apagar `purchase_consents` se ela
  tiver registos;
- **a prova de consentimento sobrevive ao fecho de conta** — apagar o
  utilizador deixa `user_id` e `entitlement_id` a NULL e mantém email, texto
  exato, IP e resultado da checkbox;
- **um canal nunca fica sem dono** — remover ou despromover o último `owner` é
  recusado; com dois donos passa; e o que sobra volta a ser intocável.

Os nomes das restrições foram conferidos contra `drizzle-kit generate`, para um
`generate`/`push` futuro não ver diferenças onde não há nenhuma.

---

## As três barreiras

### 1. `proxy.ts` — corta à entrada

Chama-se `proxy.ts` e não `middleware.ts` porque o Next 16 deu o convénio
`middleware` por descontinuado (o build avisa) e renomeou-o. Mesmo sítio na
cadeia, mesma API, runtime Node fixo.

- `/conta`, `/bilhetes` → confirma que **existe** cookie de sessão. Sem BD.
- `/admin/**` → lê a sessão **a sério** e decide o papel.

**Sim, isto consulta a base de dados em `/admin` — e é deliberado.** O plano
original era o clássico "proxy só espreita o cookie, o servidor decide o
papel". Testou-se e **não chega**. Ver a secção seguinte.

O custo está contido: a ida à BD é só em `/admin/**` (meia dúzia de pessoas,
páginas que já falam com a BD de qualquer forma). As superfícies pessoais
continuam com o corte barato do cookie, porque aí o pior caso é inofensivo —
essas páginas só mostram dados da própria conta e vão buscá-los já filtrados
pelo id da sessão lida no servidor.

### 2. Gates de servidor — `server/authz.ts`

Cada página e cada route handler repete o seu gate. `app/admin/layout.tsx` usa
`requireUser` + `canManageEvents`. Se o matcher do proxy falhar ou alguém lhe
mexer, o backoffice não abre à mesma.

### 3. `server/api-guard.ts` — o adaptador HTTP

Um sítio só onde vivem os 401/403 das rotas de API, para não haver dez cópias
do mesmo `if`. As rotas de API **não estão no matcher do proxy**, de propósito:
uma API cuja única proteção fosse um padrão de matcher ficava aberta ao primeiro
erro de padrão — e isso não é teórico, foi a classe de bugs das
CVE-2026-44573/44574/44575, em que variantes `.rsc` e query params chegavam à
página sem passar pelo matcher.

---

## A fuga que isto fechou

**O achado mais importante desta frente, e não estava na lista de tarefas.**

No App Router, o layout e a página do mesmo segmento renderizam **em
paralelo**, não em sequência. Quando o gate vive no layout, a página já correu
as queries e já está a escrever o resultado no payload em streaming antes de o
layout ter maneira de a travar.

Medido com uma conta `viewer` autenticada a pedir `/admin`, contra o build de
produção:

| Gate no `app/admin/layout.tsx`      | Status | Corpo da resposta                                        |
| ----------------------------------- | ------ | -------------------------------------------------------- |
| `forbidden()` (Next 16)             | 200    | ❌ `"Receita · julho"`, `"7,50 €"`, `"1 compras este mês"` |
| devolver `<Forbidden/>` sem children| 200    | ❌ a mesma fuga                                            |
| `redirect("/sem-acesso")`           | 200    | ❌ a mesma fuga                                            |
| **corte no `proxy.ts`**             | **307**| ✅ 11 bytes, zero dados                                    |

Ou seja: **o `redirect("/")` que aqui estava antes desta frente também fugia.**
O ecrã ficava correto — a pessoa era mandada para fora — e os números da liga
iam à mesma para o browser de quem não os devia ver. Bastava abrir o
código-fonte da página.

Não há forma de um layout impedir os filhos de renderizar. A única barreira que
corta **antes de a página existir** é o proxy. É por isso que ele consulta a BD
em `/admin`, contra a regra geral de não o fazer.

---

## O preço: o status do 403

`/admin` para quem não tem papel responde **307** para `/sem-acesso`, e essa
página responde 200. Não é um 403 de verdade, e isso é uma perda real: quem
quiser contar 4xx no CDN para detetar alguém a bater a portas fechadas não os
vê aqui.

Foi uma troca deliberada, depois de esgotar as alternativas:

- `NextResponse.rewrite(url, { status: 403 })` → o `status` **é ignorado**
  ([vercel/next.js#50155](https://github.com/vercel/next.js/issues/50155),
  aberto desde 2023).
- `forbidden()` + `app/forbidden.tsx` (com `experimental.authInterrupts`) →
  num layout dá 200 **e** a fuga acima; numa página devolveu 404 e renderizou o
  not-found. A flag foi retirada — menos uma experimental numa app com clientes.
- Um route handler a devolver HTML com status 403 → dava o status certo, mas
  obrigava a manter o 403 em HTML à mão, fora do design system.

**Um status certo com fuga de dados vale menos do que um status morno sem fuga
nenhuma.** Se o `#50155` fechar, passa a dar para ter as duas coisas: o proxy
faz `rewrite` para `/sem-acesso` com 403 e mantém-se o URL original.

---

## Auditoria de segredos

Método: `pnpm build`, e depois procurar no bundle público (`.next/static/`,
38 ficheiros) o **valor** real de cada variável de ambiente — não o nome.

| Segredo                             | No bundle? |
| ----------------------------------- | ---------- |
| `BETTER_AUTH_SECRET`                | ✅ ausente |
| `DATABASE_URL`                      | ✅ ausente |
| `CLOUDFLARE_ACCOUNT_ID`             | ✅ ausente |
| `CLOUDFLARE_STREAM_API_TOKEN`       | ✅ ausente |
| `CLOUDFLARE_STREAM_SIGNING_KEY_ID`  | ✅ ausente |
| `CLOUDFLARE_STREAM_SIGNING_KEY_JWK` | ✅ ausente |
| `EUPAGO_API_KEY`                    | ✅ ausente |
| `GOOGLE_CLIENT_SECRET`              | ✅ ausente |
| `RESEND_API_KEY`                    | ✅ ausente |
| `NEXT_PUBLIC_APP_URL`               | presente — é para ser |

Padrões genéricos (`postgres://`, `-----BEGIN … PRIVATE KEY-----`, JWT,
`Bearer …`, `re_…`): **nenhum** no bundle público.

Um falso positivo digno de nota: `BETTER_AUTH_URL` aparece — porque tem o
**mesmo valor** que `NEXT_PUBLIC_APP_URL` (a origem pública da app). Não é
segredo.

**Respostas de API:** o checkout e o checkout de bilhetes deixaram de devolver
a resposta crua da Eupago ao browser. Traz referências e identificadores do
nosso contrato que o cliente não precisa de ver; agora vai `{ ok: true }` e,
nos bilhetes, o `ticketId` (que é o que o polling usa). Nenhum cliente lia o
campo `payment` — confirmado antes de o remover.

**Guardas de build.** Ficheiros que tocam em segredos passaram a começar com
`import "server-only"`. Se algum dia um componente `"use client"` os importar,
direta ou indiretamente, **o build parte** com um erro que aponta ao import
culpado. Não é preciso instalar nada: o Next resolve `server-only` internamente.

- `lib/server-env.ts` — o leitor genérico de segredos
- `lib/cloudflare.ts` — token da API + chave que assina os tokens de reprodução
- `lib/eupago.ts` — chave da API + segredo do webhook
- `app/admin/eventos/[id]/transmissao/stream-credentials.ts` — **a chave RTMPS**

> **Sobre a chave de stream (RTMPS).** É o segredo mais perigoso do repositório
> e não é pela razão óbvia. Um token de reprodução que fuja deixa uma pessoa
> **ver** de graça; a chave de stream deixa **emitir** — quem a tiver transmite
> para dentro do evento e o que aparece no ecrã de toda a gente que pagou passa
> a ser dele. Não é acesso indevido, é sequestro da emissão.
> O `masked` no `<CopyField>` é conforto visual, não proteção: o valor vai à
> mesma no payload RSC para o browser de quem abrir a página. O que protege
> isto a sério é o gate do servidor no backoffice.

**Nada de segredos em URLs.** Uma exceção assumida: o token de reprodução vai
no caminho do URL do iframe (`iframe.cloudflarestream.com/<token>`) — é o
mecanismo da Cloudflare, não uma escolha nossa. Está mitigado por TTL de 120 s
e pelo `Referrer-Policy`.

---

## Rate limiting — e a limitação, dita como é

`lib/rate-limit.ts`, partilhado. Políticas num sítio só:

| Balde            | Limite   | Chave           | Onde                                             |
| ---------------- | -------- | --------------- | ------------------------------------------------ |
| `auth`           | 10/min   | IP + caminho    | `/sign-in/email`, `/sign-up/email`, reset        |
| `authEmail`      | 4/min    | IP + caminho    | pedidos que disparam email                       |
| `playback`       | 12/min   | conta           | mint do token de reprodução                      |
| `ticketValidate` | 30/min   | **operador**    | validação de QR à porta                          |
| `checkout`       | 8/min    | conta           | iniciar pagamentos MB WAY                        |

**Porquê por IP no login e não por conta:** travar por conta deixava um atacante
trancar a conta de outra pessoa à vontade — bastava saber o email, que é público.
O limite viraria a arma (*lockout-as-DoS*). O IP é quem paga a fatura do que
está a tentar. (OWASP Authentication Cheat Sheet.)

**Porquê por operador na porta:** numa porta com fila, o staff sai todo pelo
mesmo router. Um balde por IP bloqueava a equipa inteira quando um telemóvel
encravasse a repetir pedidos.

### ⚠️ Isto vive em memória, por instância

Os contadores estão num `Map` no processo. Na Vercel a app corre em várias
instâncias em paralelo, cada uma com o seu `Map`, e uma instância fria começa a
contar do zero. **O limite efetivo é, no pior caso, `limite × nº de instâncias
ativas`.** Não há forma honesta de contornar isso sem um contador partilhado.

O que **defende mesmo**: o ataque de origem única (o caso comum), o scanner
encravado em loop, e o pico que fazia disparar a fatura. O que **não** defende:
um atacante distribuído por muitos IPs, ou com paciência para esperar pelo
reciclar das instâncias.

Não escrever "temos rate limiting" em material comercial sem esta nota ao lado.

**Upgrade quando houver orçamento** (~10 min, o mais barato primeiro):
1. Upstash Redis pelo Marketplace da Vercel (o Vercel KV foi descontinuado e
   migrado para lá em dez/2024) + `@upstash/ratelimit`. Trocar o `hit()` de
   `lib/rate-limit.ts` por um `INCR`+`EXPIRE` atómico — a superfície pública
   (`checkRateLimit`, `limitByIp`) foi desenhada para essa troca não tocar em
   nenhuma rota. Bónus: o Better Auth aceita `rateLimit.storage:
   "secondary-storage"` e os limites dele passam a ser distribuídos de borla.
2. Uma regra de rate limit no WAF da Vercel (grátis até 1 M pedidos), à frente
   de tudo.

Proteção de memória: teto de 10 000 chaves e limpeza preguiçosa disparada por
volume de chamadas (não por `setInterval` — numa função serverless a instância
congela entre invocações e um temporizador não tem garantia de disparar).

---

## Cabeçalhos de segurança

Em `next.config.ts`. A regra que decidiu tudo: **um cabeçalho que parte o
player a meio de um evento pago faz mais estragos do que o ataque de que
defende.** Cada um foi escolhido contra as duas integrações que a app não pode
perder — o iframe do Cloudflare Stream e o login com Google.

| Cabeçalho                     | Valor                                   |
| ----------------------------- | --------------------------------------- |
| `Strict-Transport-Security`   | `max-age=63072000; includeSubDomains`   |
| `X-Content-Type-Options`      | `nosniff`                               |
| `Referrer-Policy`             | `strict-origin-when-cross-origin`       |
| `X-Frame-Options`             | `DENY`                                  |
| `Content-Security-Policy`     | `frame-ancestors 'none'`                |
| `Cross-Origin-Opener-Policy`  | `same-origin-allow-popups`              |
| `Permissions-Policy`          | ver abaixo                              |
| `X-XSS-Protection`            | `0`                                     |
| `Cache-Control` (só `/api/*`) | `no-store, max-age=0`                   |
| `x-powered-by`                | **removido** (`poweredByHeader: false`) |

**`frame-ancestors 'none'` importa mais aqui do que na maioria dos sites:** esta
plataforma vende acesso a vídeo. Sem isto, qualquer pessoa metia a página do
player dentro de um site próprio e revendia o que nós cobramos. (Atenção à
direção: isto diz quem pode embeber **nós**. O iframe do Cloudflare é o
contrário — nós a embeber terceiros — e não é afetado.)

### Permissions-Policy: o mais fácil de estragar

O que **não** está na lista fica proibido para a página **e para os iframes
dela**. O atributo `allow` de um iframe só aperta o que o cabeçalho já deu;
nunca alarga. Cada permissão aberta aponta a uma linha de código real:

- `camera=(self)` → `components/tickets/scanner.tsx` (`getUserMedia`, ler o QR à porta)
- `autoplay`, `encrypted-media`, `picture-in-picture`, `accelerometer`,
  `gyroscope`, `fullscreen` = `(self "https://iframe.cloudflarestream.com")` →
  o `allow` do iframe em `components/player/watch-player.tsx`

Tudo o resto leva `()`. **A `camera` é a armadilha:** as listas de "hardening"
que se copiam da internet negam-na sempre — e negá-la aqui deixava a equipa sem
scanner à porta de um evento esgotado.

### CSP completo: em modo de relatório, de propósito

Além do `frame-ancestors` (que é *enforcing* e não parte nada), vai um
`Content-Security-Policy-Report-Only` com a política toda. O browser avalia e
**grita na consola o que teria bloqueado**, sem bloquear. Passa a haver
evidência em vez de opinião.

**Para promover a *enforcing*** (a decisão é do dono do projeto):
1. correr um evento real de ponta a ponta — OBS → live → player → fim;
2. login por email e por Google, comprar um bilhete, validar um QR;
3. tudo em Chrome, Safari e Firefox, de olho na consola;
4. zero violações inesperadas → mudar a chave do cabeçalho em `next.config.ts`
   de `Content-Security-Policy-Report-Only` para `Content-Security-Policy`.

### O que ficou de fora, e porquê

| Não ligado                          | Razão                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `Cross-Origin-Embedder-Policy`      | `require-corp` **parte o iframe do Cloudflare** (COEP herda para iframes e a Cloudflare não envia CORP). O `credentialless` não tem Safari. E não ganhávamos nada: só serve para `SharedArrayBuffer`. |
| `Cross-Origin-Resource-Policy`      | `same-origin` bloquearia clientes de email a carregar o cartaz nos nossos emails (`emails/vai-comecar.tsx`). |
| `COOP: same-origin` (estrito)       | Parte OAuth em popup (`window.opener` a `null`). Hoje o Google entra por redirecionamento, mas bastava ligar o One Tap. Usada a variante `-allow-popups`. |
| `HSTS ... ; preload`                | Semi-irreversível (sair da lista demora meses) e o domínio definitivo do projeto ainda nem está comprado.   |
| CSP com nonce + `strict-dynamic`    | Obriga **todas** as páginas a renderização dinâmica: adeus estático/ISR, precisamente nas noites de evento. Não compensa numa app sem scripts de terceiros. |
| `experimental.authInterrupts`       | Ver [O preço: o status do 403](#o-preço-o-status-do-403).                                                   |

---

## O que foi verificado

> Registo da **Frente B** (blindagem de rotas), tal como foi medido a 19 de
> julho. Fica como está, de propósito — é o que foi observado nessa altura.
> `league_owner` já não existe: virou `owner` da SmokingBars em
> `channel_members` (ver [Isolamento entre canais](#isolamento-entre-canais)).
> Ler "`league_owner`" aqui como "a conta que gere a liga"; os resultados de
> cada rota mantêm-se, com a diferença de que hoje o que decide é o canal.

Build de produção + Neon real, com duas contas de teste criadas para o efeito:
`qa.porta@firstrow.dev` (`viewer`) e `qa.gestor@firstrow.dev` (`league_owner`).

**Rotas**

- Anónimo em `/admin`, `/admin/ganhos`, `/conta`, `/bilhetes` → **307** para
  `/entrar?next=…` com o destino correto em cada uma.
- `viewer` autenticado em `/admin`, `/admin/eventos`, `/admin/ganhos`,
  `/admin/subscritores`, `/admin/scanner` → **307** para `/sem-acesso`, corpo de
  **11 bytes**, zero dados de backoffice.
- `league_owner` nas mesmas cinco → **200**. Vale a pena notar: esta conta
  **não** está no `ADMIN_EMAILS` e entra pelo papel na BD — o que era impossível
  antes desta frente, porque o gate era o email.
- Matriz de API completa (tabela acima) — todos os valores confirmados.
- `GET /api/tickets/status/<id de outro dono>` → **404**, não 403.
- `POST /api/webhooks/eupago` sem assinatura → **401**.

**Rate limiting**

- `/sign-in/email`: 8 tentativas passaram, as seguintes **429** com
  `retry-after: 58`, `x-ratelimit-limit: 10`, `x-ratelimit-remaining: 0`.
- `/api/tickets/validate`: 29 passaram, 5 travadas com **429** (o balde é por
  operador, como desenhado).

**Integrações que não podiam partir**

- Login por email → **funciona** depois dos cabeçalhos (feito pelo browser, na UI).
- Iframe do Cloudflare Stream → **carrega**, e renderizou a UI do player da
  Cloudflare ("Stream has not started yet.", que é a mensagem correta para um
  live input sem emissão). Nem o CSP, nem o `X-Frame-Options`, nem o
  `Permissions-Policy`, nem o COOP o bloquearam.
- Regra de concorrência (1 sessão por conta) → observada a funcionar: abrir uma
  segunda sessão revogou a primeira e o player mostrou "A tua conta começou a
  ver noutro dispositivo".
- **Zero erros de consola. Zero violações de CSP.**

**Qualidade:** `pnpm check`, `pnpm typecheck` e `pnpm build` verdes.

Capturas em `docs/screenshots/blindagem/`.

---

## Dívida conhecida e próximos passos

Achados que ficam registados por não serem desta frente ou por precisarem de
decisão do dono:

1. ~~**`lib/admin.ts` está morto nas APIs mas vivo nas páginas.**~~ ✅ Resolvido:
   o ficheiro foi apagado (ver `ffe6019`) e já não há uma segunda noção de
   "admin" a correr em paralelo com a coluna `role`.
2. **`server/auth-helper.ts` é o antecessor de `server/authz.ts`.** Já não é
   usado por nenhuma rota de API, mas ainda serve várias páginas de espectador.
   O seu `requireUser()` **não redireciona** (devolve `null`), ao contrário do
   homónimo em `authz.ts` — dois nomes iguais com comportamentos diferentes é
   uma armadilha; vale a pena consolidar.
3. **O heartbeat não revalida o direito.** `server/playback.ts:heartbeat()` só
   vê se a sessão foi revogada. Um reembolso ou estorno a meio de um evento não
   corta quem já está a ver; só bloqueia sessões novas. Aceitável para MVP,
   decisão a tomar de forma consciente.
4. **`accessRules` da Cloudflare por usar.** Sendo a plataforma só-PT, dá para
   restringir o token de reprodução a `country: ["PT"]` com uma regra
   `{"type":"any","action":"block"}` no fim. Barato. Cuidado com falsos
   positivos de GeoIP (VPN, redes móveis).
5. **TTL do token de reprodução por confirmar em evento real.** São 120 s. Não
   está confirmado se a Cloudflare revalida o `exp` por segmento — se revalidar,
   um evento longo cortava aos 2 minutos. **Testar num evento real antes de
   vender bilhetes.**
6. **`lib/env.ts` mistura segredos e valores públicos** no mesmo objeto
   exportado (`BETTER_AUTH_SECRET` ao lado de `NEXT_PUBLIC_APP_URL`). Nada o
   impede hoje de ser passado a um componente de cliente por engano. Separar em
   `env.server.ts` (com `server-only`) e `env.public.ts` fecha isto de vez.
7. **Validar o `next=` no lado que o LÊ.** O `proxy.ts` só produz caminhos
   internos, mas quem lê o `?next=` na página de login deve revalidar antes de
   redirecionar (rejeitar `//evil.pt`, `/\evil.pt`, esquemas embutidos e as
   variantes codificadas). É o padrão do CVE-2022-24858 no NextAuth.
8. **Next.js:** a 16.2.10 está acima de todos os avisos conhecidos
   (CVE-2025-29927, CVE-2025-57822, lote de maio/2026). Foi anunciado um
   programa de *releases* de segurança mensais, com a **primeira a 20 de julho
   de 2026** (4 High + 5 Moderate, detalhes sob embargo). **Atualizar assim que
   sair.**
9. **`components/tickets/scanner.tsx` assume sempre 2xx** (`res.json() as
   ScanOutcome`). Com 401/403/429 fica com um resultado indefinido em vez de
   mostrar um estado — e agora também com **404**, que é o que uma porta de
   outro canal devolve. UI, por isso não foi tocado aqui.

### Deixado pela Frente E (multi-canal)

10. **Ninguém consegue criar nem editar canais pela app.** A tabela `channels`
    existe e é lida em todo o lado, mas escrever nela é SQL à mão. A UI é da
    **Frente F**; o schema já tem os campos todos à espera dela.
11. **As funções de membros existem, falta o ecrã.** `server/channel-members.ts`
    tem `listChannelMembers`, `setChannelMemberByEmail` e `removeChannelMember`,
    já com o invariante de que **um canal nunca fica sem dono** (recusa remover
    ou despromover o último `owner`, com a condição dentro do `where` para
    aguentar duas remoções em paralelo). Não há UI nenhuma a chamá-las — é da
    Frente F.
16. **A prova de consentimento tem retenção própria e ninguém a está a aplicar.**
    `purchase_consents` guarda IP como **prova de compra** (10 anos), não como
    log de sessão (90 dias). Se algum dia entrar uma limpeza periódica de IPs,
    **tem de excluir esta tabela** — ver ADR-012. Também não há ainda purga para
    os 10 anos: quando houver, é por `created_at`.
17. **`purchase_consents` está vazia de significado até o checkout a preencher.**
    A tabela e o schema são desta frente; o fluxo, os textos legais e o esquema
    de versões (`text_version`) não. Enquanto ninguém escrever lá, a obrigação
    legal continua por cumprir — a tabela sozinha não prova nada.
12. **A sidebar do backoffice não tem seletor de canal.** Quem gere **um** canal
    vê-o na sidebar; o `platform_admin` (que gere todos) não vê canal nenhum,
    porque a pergunta "qual é o canal ativo?" não tem resposta única para ele —
    e mostrar um à sorte era repetir o bug que esta frente fechou.
    `app/admin/layout.tsx` já passa o canal por prop. ⚠️ Note-se que **um
    seletor de canal ATIVO na sidebar seria outra coisa** do que o seletor de
    criação: este escolhe onde nasce UM evento; esse filtraria o backoffice
    inteiro. Se algum dia existir, o filtro continua a ter de ser o
    `ChannelScope` do servidor — um seletor de UI nunca pode ser o que decide o
    que se vê.
13. ~~**`resolveChannelForNewEvent` recusa quando há mais do que um canal.**~~
    ✅ Resolvido: ver [Escolher o canal ao criar um
    evento](#escolher-o-canal-ao-criar-um-evento).
14. **`/admin/eventos/[id]/bilhetes` monta um `BackofficeShell` dentro do
    `BackofficeChrome` do layout** — duas sidebars encavalitadas. É anterior a
    esta frente e é só UI, por isso não foi mexido; nota-se mais agora, porque
    o shell de dentro fica sem o bloco do canal.
15. **`getPlatformTotals()` é a única query sem âmbito.** É de propósito (é o
    ecrã interno da FirstRow) e a página tem gate `isPlatformAdmin`. Se alguém a
    chamar de outro sítio, tem de repetir esse gate — não há nada no tipo que o
    obrigue.
