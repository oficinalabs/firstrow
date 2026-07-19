# Registo de Decisões — FirstRow

Formato: decisão · porquê · estado. Datas em absoluto.

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
