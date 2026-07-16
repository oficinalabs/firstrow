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

## ADR-007 · Pagamentos: MB WAY prioritário; MoR vs IfthenPay/Eupago em aberto (2026-07-16)
Polar (default do template) não faz MB WAY. Ver [PAGAMENTOS.md](PAGAMENTOS.md). **Estado:** 🔴 aberto.

## ADR-008 · Piloto: SmokingBars (2026-07-16)
Melhor relação do dono do projeto; 131 patronos; 71% no tier de stream. **Estado:** fixo.
