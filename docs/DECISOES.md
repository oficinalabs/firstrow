# Registo de Decisões — FirstRow

Formato: decisão · porquê · estado. Datas em absoluto.

## ADR-014 · A guarda de duplicados serializa com lock, não com esperança (2026-07-19)
`createEvent` lia (há um igual nos últimos 30 s?) e depois escrevia. Dizia-se que pôr o INSERT antes da chamada à Cloudflare fechava a janela dos pedidos em paralelo. **Medido: 20 rondas × 8 pedidos em paralelo deixaram 153 eventos onde deviam ficar 20 — falharam 19 das 20 rondas.** Um SELECT seguido de INSERT não é atómico: em READ COMMITTED nenhum dos oito vê as linhas por confirmar dos outros sete.

**Decisão.** A leitura e a escrita passam a correr dentro da mesma transação, atrás de um `pg_advisory_xact_lock` cuja chave é derivada de canal + título + hora de início.

**Porquê assim e não de outra maneira:**
- **Não é um índice único** porque a guarda é uma *janela de 30 s*, não uma regra permanente: recriar um evento com o mesmo nome e hora meses depois é legítimo, e uma constraint proibia-o para sempre.
- **É um lock por evento, não global**: dois eventos diferentes têm chaves diferentes e não esperam um pelo outro.
- **A chave é calculada em Node** (SHA-256 → int8 com sinal) e não com o `hashtext()` do Postgres, que é interno, não documentado, e pode mudar de valor entre versões.
- **Não precisa de migração**, o que interessa numa app já em produção.
- **A Cloudflare fica fora da transação** — um lock à espera de uma HTTP de terceiros era trocar um problema por outro.

Nova medição, mesmo teste: 160 pedidos → **20 eventos, 0 duplicados**.

**Estado:** 🟢 decidido e implementado (Frente H). Ver [SEGURANCA-APP.md](SEGURANCA-APP.md#️-a-guarda-de-duplicados-não-aguentava-pedidos-em-paralelo).

## ADR-013 · O canal pergunta-se só quando há mesmo uma escolha (2026-07-19)
Com os papéis por canal (ADR-010), criar um evento passou a precisar de saber **em que canal** ele nasce — e é a única operação sem evento de onde tirar essa resposta. `resolveChannelForNewEvent` recusava quando havia mais do que um canal, o que era certo mas deixava o backoffice sem forma de criar assim que entrasse a segunda liga.

**Decisão.** O formulário adapta-se a quantos canais a pessoa gere: **zero** → não há formulário, falta criar um canal; **um** → não se pergunta nada, o canal é escolhido e mostrado como contexto; **dois ou mais** → seletor, **sem valor por omissão**.

**O que decidiu o desenho:**
- **Não transformar um caso único numa decisão.** Hoje há uma liga e um dono; obrigá-lo a escolher "SmokingBars" de uma lista de um era fazer toda a gente pagar o preço do caso raro. A mesma regra vale para os ecrãs: a coluna "Canal" nas listas e no extrato **só aparece com mais do que um canal** — com um só era a mesma palavra em todas as linhas.
- **Nada de pré-seleção com vários.** Um valor por omissão é a forma mais barata de criar o evento — e o dinheiro dele — na liga errada. Prefere-se um passo a mais a um engano silencioso.
- **A lista oferecida e a lista aceite são a mesma função** (`listCreatableChannels`). Calculadas em sítios diferentes, acabavam por divergir e o formulário oferecia o que a gravação recusava.
- **O seletor não é a segurança.** O slug vem do cliente e é revalidado contra `canManageEvents` a cada pedido; a API recusa canal alheio e canal inexistente com **a mesma mensagem**, para não se poder varrer slugs.

**Estado:** 🟢 decidido e implementado (Frente H). Ver [SEGURANCA-APP.md](SEGURANCA-APP.md#escolher-o-canal-ao-criar-um-evento).

## ADR-001 · Nome: FirstRow (2026-07-16)
Marca **generalista** e em EN, domínio `joinfirstrow.com` (a comprar). Preferido a nomes rap-específicos (Barras, Ringue) para permitir expansão a outros nichos. **Estado:** fixo (domínio por comprar).

## ADR-002 · Mercado: só Portugal; Brasil descartado (2026-07-16)
Brasil é sobretudo **improviso**, não escrita; sem contactos lá; é preciso dimensão num sítio primeiro. **Estado:** fixo.

## ADR-003 · Posicionamento: generalista com beachhead + co-branding (2026-07-16)
Battle rap é o primeiro cliente, não o produto inteiro. Co-branding para a liga não perder a casa. Vertical/foco > horizontal. **Estado:** fixo.

## ADR-004 · Vídeo: Cloudflare Stream (2026-07-16)
Barato (~1€/1000 min), RTMP/OBS, VOD automático, tokens assinados. Mux como alternativa premium. **Estado:** provisório (validar no piloto).

## ADR-005 · Segurança: gate de sessão + concorrência + tokens curtos + watermark; DRM depois (2026-07-16)
É o core do produto. DRM só se a captura de ecrã se tornar problema. **Estado:** fixo (arquitetura).

## ADR-006 · Modelo: revenue-share ~10–12%, não garantias (2026-07-16)
Undercut ao ~23% do Patreon; a liga ganha mais mesmo pagando-nos. Garantias só mais tarde, com dados. **Estado:** provisório.

## ADR-007 · Pagamentos: Eupago (split payments) (2026-07-16)
Polar (default do template) não faz MB WAY. Spike IfthenPay vs Eupago → **Eupago**, por ter split payments (divide o pagamento entre o IBAN da liga e a comissão da FirstRow numa transação), recorrência e cartões internacionais; preço de MB WAY igual ao IfthenPay (~0,07€ + 0,7%, ~10x mais barato que os ~23% do Patreon). Ver [SPIKE-MBWAY-IFTHENPAY-VS-EUPAGO.md](SPIKE-MBWAY-IFTHENPAY-VS-EUPAGO.md) e [PAGAMENTOS.md](PAGAMENTOS.md). **Estado:** 🟢 decidido (falta confirmar split em sandbox + IVA).

## ADR-008 · Piloto: SmokingBars (2026-07-16)
Melhor relação do dono do projeto; 131 patronos; 71% no tier de stream. **Estado:** fixo.

## ADR-012 · Prova de consentimento por compra, que sobrevive ao fecho de conta (2026-07-19)
[CONTEUDO-PAGINAS.md](legal/CONTEUDO-PAGINAS.md) §6 exige que, por cada compra, se consiga apresentar numa disputa o **texto exato** mostrado antes do pagamento, com data/hora, IP, conta e resultado da checkbox. Não chega estar nos Termos — a prova é por compra.

**Decisão.** Tabela `purchase_consents`, em acrescento (sem unicidade por compra: consentir duas vezes deixa duas linhas, e o histórico é mais defensável do que uma linha reescrita).

**O que decidiu o desenho:** a mesma política guarda faturação e histórico de compras **10 anos, mesmo depois de a conta ser fechada**. Logo:
- **Nenhuma FK em cascade.** As quatro ligações (`user`, `event`, `entitlement`, `ticket`) são `ON DELETE SET NULL`. Uma prova que morresse com a conta era o contrário de uma prova — bastava apagar a conta para o registo desaparecer quando é preciso.
- **O que prova está copiado na linha** (`user_email`, `event_title`, `consent_text`). A linha vale por si, sem nada à volta. Verificado: apagar a conta deixa `user_id` a NULL e mantém email, texto, IP e checkbox.
- ⚠️ **O `ip_address` desta tabela não é um log de sessão.** A política dá 90 dias a sessões/IP e 10 anos à faturação; este IP é parte da prova da compra. Uma limpeza periódica de IPs **não pode** varrer esta tabela.

**Estado:** 🟢 tabela e schema feitos (Frente E). O fluxo de checkout que a preenche, os textos legais e a versão do texto ficam por fazer.

## ADR-011 · Ser dono de um canal é uma linha, não uma coluna (2026-07-19)
A SmokingBars **ainda não é cliente** — não assinaram e não têm conta. Não há a quem dar o canal; quem o opera é o Rui (`ruicosta607@gmail.com`), que a migração semeia como `owner` quando não existe nenhum.

**Decisão.** A posse vive em `channel_members` e não numa coluna `channels.owner_id`. Duas razões: entregar o canal à liga quando ela assinar passa a ser um INSERT e um DELETE em vez de uma migração; e **dois donos ao mesmo tempo** é um caso real, porque estas ligas têm sócios.

**Invariante:** um canal nunca fica sem `owner`. Garantido na aplicação (`server/channel-members.ts`), **não** numa constraint — o Postgres não exprime "mantém pelo menos uma linha com role='owner' por canal" sem triggers, e um trigger escondido é pior do que uma função com nome. A condição vai **dentro do `where`** de cada escrita, para duas remoções em paralelo não passarem ambas na contagem.

Hoje é redundante, porque `platform_admin` passa por cima de tudo. Fica à mesma: é o estado certo nos dados e é o que torna a entrega limpa.

**Estado:** 🟢 decidido e implementado (Frente E). Falta a UI (Frente F).

## ADR-010 · Papéis em dois andares: global vs. por canal (2026-07-19)
Os papéis eram todos globais (`user.role`: `platform_admin`, `league_owner`, `league_staff`, `viewer`). Com um canal só — SmokingBars, *hardcoded* em `lib/channels.ts` — não fazia diferença; com a **Liga Knockout** (ADR-009) a entrar, um `league_owner` passava a ser dono dos eventos e do **dinheiro** da outra liga. Era a dívida que bloqueava o multi-tenant.

**Decisão.** Global fica só o que é mesmo global — `platform_admin` (a FirstRow) e `viewer` (toda a gente). Gerir e operar são poderes **de um canal** e passam para `channel_members` (`owner`, `staff`), com `events.channel_id` a dizer de quem é cada evento. `platform_admin` passa por cima de tudo sem ser membro de nada.

**Consequências assumidas:**
- Os predicados de eventos passam a **exigir** o canal (`canManageEvents(user, channelId)`). Não há versão sem canal: seria um convite a assumir o canal por defeito, e o compilador deixaria passar.
- Um evento de outro canal responde **404**, não 403 — a mesma regra que já valia para bilhetes de outra pessoa.
- Toda a query que soma mais do que um evento leva um `ChannelScope`. **Lista de canais vazia = zero linhas**, nunca "sem filtro".
- `getCurrentUser()` faz uma query indexada a mais por pedido autenticado, para os predicados continuarem **puros**. Troca consciente: um só modelo mental em vez de I/O escondido dentro de um `if`.
- A migração converte os papéis que existiam (`league_owner` → `owner` da SmokingBars, `league_staff` → `staff`) e **não promove ninguém**. Um canal sem dono continua gerível pelo `platform_admin`; inventar um dono seria dar acesso a quem não o tinha.

**Estado:** 🟢 decidido e implementado (Frente E). Ver [SEGURANCA-APP.md](SEGURANCA-APP.md#isolamento-entre-canais) e `scripts/migrate-channels.ts`.

## ADR-009 · Construir primeiro, apresentar produto pronto; cadeia de alvos (2026-07-16)
Não esperar pelo "sim" de uma liga para construir — apresenta-se o produto **pronto**. Cadeia de prospects: **SmokingBars → Liga Knockout → PALOPs** (comunidade de escrita relevante). Nota: os PALOPs exigem **cartão** (MB WAY é só PT). Revoga o "gate" anterior do roadmap. **Estado:** fixo.
