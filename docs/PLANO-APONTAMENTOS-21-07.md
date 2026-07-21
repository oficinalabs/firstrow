# Plano — apontamentos do dono depois de explorar a plataforma

> Escrito a 21/07/2026, depois de o dono ter percorrido o
> `docs/GUIA-EXPLORAR-A-PLATAFORMA.md` de ponta a ponta e reportar uma lista de
> bugs e pedidos de UX. Um deles (upload de logo, 500 em produção) foi corrigido
> antes deste plano — ver `next.config.ts` (`serverExternalPackages: ["sharp"]`)
> e o commit `95d4812`. O resto está agrupado em frentes por afinidade de
> ficheiros, seguindo o padrão desta sessão: cada frente mede o que afirma.

## Uma nota de interpretação

> "Acho que a marca de agua devia ser email e password dele."

Lido literalmente isto é impossível e perigoso: nunca guardamos a password em
claro (só o hash), e mesmo que guardássemos, **nunca** se mostra uma password a
ninguém, e muito menos gravada visualmente por cima de um vídeo. A leitura mais
provável é **nome**, não "password" — os dois soam parecido a ditar. A Frente Z
implementa **email + nome**, e o dono corrige se a intenção fosse outra.

---

## Frente Z — Interação global + marca de água + galeria da home

### Cursor pointer em tudo o que é clicável
Botões, links, controlos do player, o novo interruptor de chat. Fazer isto num
sítio central (regra em `app/globals.css` para os elementos nativos que o
precisam) e não página a página — nove frentes já mexeram em botões espalhados
pela app; uma regra global evita a décima.

### Marca de água: email + nome
Hoje é só o email. Passa a `${nome} · ${email}` (ou equivalente — decidir o
formato que não fique demasiado comprido a mover-se pelo ecrã).

### Botão "Backoffice" no frontoffice tem par: botão "Site" no backoffice
Já existe o atalho frontoffice → backoffice (`components/ui/backoffice-link.tsx`,
só visível para quem tem poderes). Falta o inverso: um link discreto no
backoffice para voltar ao site. Não precisa da mesma verificação de papel — quem
já está no backoffice pode sempre ver o site público.

### Homepage: canais em galeria (quadrados)
Hoje a lista de canais é... (ver `app/page.tsx` / `components/home/*`). Passa a
grelha de cartões quadrados — imagem (logo/banner ou iniciais, já existe upload
desde a Onda B2), nome, tagline. Responsivo: 1 coluna a 375px, mais a 768/1280
(já há auditoria de responsividade feita — segue o padrão).

---

## Frente AA — Cloudflare Stream: thumbnails e qualidade máxima

### Thumbnails para VOD, arquivo e eventos ao vivo
A Cloudflare Stream gera thumbnails automaticamente a partir do vídeo
(endpoint `https://videodelivery.net/<uid>/thumbnails/thumbnail.jpg`, ou o
subdomínio de cliente equivalente). **Confirmar isto contra a conta real** antes
de construir — não assumir o formato do endpoint só pela memória. Ligar aos
cartões de evento/arquivo (`components/eventos/event-card.tsx` e afins). Um
evento ao vivo sem gravação ainda não tem thumbnail — decidir o placeholder
(cor do canal? logo?).

### Qualidade máxima do player em 720p
Investigar antes de mudar código: pode ser (a) um tecto real do player da
Cloudflare/do nosso token, ou (b) simplesmente a resolução com que o vídeo de
teste foi codificado no OBS (a gravação existente é de um teste antigo). Ver as
`renditions`/qualidades disponíveis do vídeo real via API da Cloudflare antes de
concluir que é bug. Se for (b), não é bug nenhum — documentar e dizer ao dono
para verificar as definições do OBS (a sessão já recomendou 1080p/30fps/4500kbps
em Advanced Output Settings). Se for (a), investigar se depende de alguma opção
do live input ou do plano.

---

## Frente AB — Chat: descoberta do interruptor (o dono disse que as teclas não funcionaram)

A Frente W construiu o interruptor com tecla `c` e um botão nos controlos que
aparece ao passar o rato — mas o dono reportou que **as teclas não
funcionaram**. Isto é um bug de UX ou de implementação e tem prioridade:
diagnosticar porquê (será que o botão não é suficientemente visível/descoberto?
Será que o foco não está no sítio certo para a tecla funcionar? Testar como um
utilizador novo, sem saber da tecla, e ver se ele encontra o controlo sozinho).

**Correção:** o controlo tem de ser **descoberto sem se saber da tecla** —
manter um botão sempre alcançável (não só ao passar o rato) para ligar/desligar
o chat em ecrã inteiro, com rótulo textual visível ou tooltip claro. A tecla
fica como atalho, não como único caminho.

---

## Frente AC — IA do backoffice: fundir "Eventos" e "Agenda", e o detalhe de evento

### O problema, nas palavras do dono
> "Isto de ter duas abas 'Eventos' e 'agenda' é confuso e parece informação
> duplicada. mete numa pagina, otimiza! E se é uma pagina por causa dos 'roles'
> mete permissoes numa so pagina!"

### Porque há duas hoje, e o que NÃO se pode perder ao fundir
A Frente Y criou `/admin/agenda` **de propósito**, depois de medir uma fuga: no
App Router, o que uma página vai buscar entra no payload RSC mesmo que não seja
desenhado no ecrã. Se `/admin/eventos` trouxer receita por linha e só se
escondam colunas por CSS/role no cliente, a receita **viaja na resposta** para o
`staff` mesmo que ele nunca a veja no ecrã — é a mesma fuga que já apareceu
noutra página desta plataforma (transmissão/bilhetes mostravam dinheiro ao
staff antes de a Frente T fechar isso).

### A solução: UMA rota, DUAS queries
Fundir a **navegação e o URL**, não a segurança:
- Um único item de menu, uma única rota (`/admin/eventos`, dropar `/admin/agenda`).
- **Dentro** da página, a função que vai buscar os dados verifica o papel
  **antes** do primeiro `await` e escolhe: `canManageEvents` → query completa
  (receita, comissão); só `canOperateEvents` → query sem dinheiro (a mesma
  `listEventsForOperations` que a Frente Y já escreveu). A UI mostra colunas
  diferentes de acordo com o que **recebeu**, nunca esconde colunas que recebeu.
- **Medir**, como sempre: sessão de staff no mesmo URL → zero ocorrências de
  valores no HTML e no payload RSC. Sessão de owner → os valores aparecem.
  Controlo positivo obrigatório.

Atualizar `lib/backoffice-zones.ts` e a matriz de testes
(`tests/unidade/matriz-de-acessos-do-backoffice.test.ts`) para refletir a rota
única.

### Detalhe de evento — mais completo
> "Se tou na pagina detalhe de um evento tenho de conseguir editar e ver as
> coisas todas (nem que seja um botao para ver bilhetes que pode meter a
> aparecer uma div e um bota de scanner que pode tar na pagina de detalhe ou da
> lista."

Hoje o fluxo obriga a saltar entre transmissão/editar/bilhetes/scanner como
páginas separadas. Juntar como **abas ou secções expansíveis** dentro da mesma
página de detalhe do evento, cada uma sob o gate de papel que já existe para
essa informação (edição = `canManageEvents`; bilhetes/scanner = `canOperateEvents`
no canal do evento). Não duplicar as queries — reutilizar as funções que já
existem por trás de cada aba.

---

## Frente AD — Ganhos: redesenho de UI

> "esta sem sal... Quero ver filtros, a linha do total nao pode ser igual a uma
> linha normal, tem muito texto em baixo das tabelas... tenho de clicar para
> ver nao posso levar logo com isso."

- **Filtros**: por canal (se houver mais do que um), por período (reutilizar o
  seletor que a dashboard global já tem, se fizer sentido o mesmo componente).
- **Linha de total visualmente distinta**: peso de fonte, borda superior mais
  forte, ou fundo ligeiramente diferente — não pode confundir-se com uma linha
  de dados.
- **Texto explicativo em `<details>`/disclosure**: o texto que hoje aparece
  sempre por baixo das tabelas (notas sobre o que os números significam) passa
  a estar recolhido por omissão, com um "saber mais" a expandir. A informação
  não se perde — só deixa de ser a primeira coisa que se vê.
- Pesquisar (não inventar) padrões de tabelas financeiras bem resolvidas antes
  de desenhar — o objetivo é parecer uma ferramenta de contabilidade a sério,
  não uma tabela HTML genérica.

---

## Frente AE — Dashboard: mais análise, melhor organização

> "gostava mesmo de ver mais graficos analistas ver coisas a subir e a descer,
> alguns filtros... Torna a dashboard mais intuitiva... pesquisa sobre UIs para
> dashboards e procura o que encaixaria."

### Pesquisar antes de construir
Padrões de dashboards analíticos bem resolhidos (Stripe Dashboard, Vercel
Analytics, Linear Insights são bons pontos de partida conceptual — **não
copiar visualmente**, perceber os princípios: hierarquia clara do mais
importante, indicadores de tendência ao lado dos números, comparação
período-sobre-período, filtros que não escondem a informação principal).

### Indicadores de tendência (subir/descer)
Cada métrica principal (receita, espectadores, conversão) ganha uma variação
face ao período anterior — seta e percentagem, com cor **e** texto (nunca só
cor). Isto exige comparar o período atual com o anterior equivalente nas
queries — atenção a fazer isto certo com fusos horários (já houve um bug de
fuso horário nesta dashboard, corrigido pela Frente S).

### Mais filtros
Para além do período que já existe: filtro por canal (quando há mais do que
um), e talvez por tipo de venda (PPV vs bilhete).

### Reorganização
Agrupar por pergunta que a pessoa está a fazer, não por tabela que existe na
base de dados — "como vai o negócio", "que evento correu melhor", "onde está o
risco". Rever a ordem e agrupamento atual dos blocos com isto em mente.

---

## Fronteiras entre frentes (para não colidirem)

| Frente | Dono de |
|---|---|
| Z | `app/globals.css` (cursor), `components/player/watermark.tsx`, `components/ui/backoffice-link.tsx` + novo `site-link.tsx`, `app/page.tsx`/`components/home/**` |
| AA | `components/eventos/event-card.tsx`, `server/cloudflare-stream.ts` (thumbnails), docs sobre qualidade |
| AB | `components/chat/**` (só a parte do interruptor/descoberta), `components/player/fullscreen-button.tsx` se necessário |
| AC | `app/admin/eventos/**`, `app/admin/agenda/**` (remove), `lib/backoffice-zones.ts`, `server/stats.ts` (funções de listagem de eventos) |
| AD | `app/admin/ganhos/**`, `server/stats.ts` (funções de ganhos) |
| AE | `app/admin/plataforma/**`, `components/admin/charts/**`, `server/stats.ts` (funções de dashboard global) |

**`server/stats.ts` é partilhado por AC, AD e AE** — cada uma mexe só nas suas
funções (nomes diferentes, sem sobreposição de linhas). Conflitos de rebase são
esperados e resolvidos na integração, como em toda a sessão.

## A regra que continua a valer
Nove vezes nesta sessão uma afirmação confiante foi desmentida por medição.
Nenhuma frente afirma que algo funciona sem o mostrar — número, captura, ou os
dois.
