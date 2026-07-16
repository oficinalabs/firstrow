# Histórico da Exploração — FirstRow

Registo do processo de ideação (conversa de origem, 2026-07-16), incluindo as viragens e correções. Serve para quem chegar depois perceber **porquê**, não só **o quê**.

## Ponto de partida
Ideia: uma plataforma de streams pagas tipo Patreon para o nicho das batalhas escritas em PT, para acabar com o tráfico de links (Patreon → link privado do YouTube → partilhado).

## Viragens
1. **"Não é streaming, é controlo de acesso."** O valor está em impedir a fuga, não em servir vídeo.
2. **Lusófono/Brasil — proposto e depois descartado.** Cheguei a sugerir o Brasil como a "tese real" de escala. **O dono corrigiu:** Brasil é improviso, não escrita, e não tem contactos. Mercado = PT. (Boa correção, cedo.)
3. **"Não sejas Patreon" → afinado.** Primeiro achei que a plataforma só devia fazer a stream. Os dados mostraram o contrário: na SmokingBars, **71% dos pagantes estão no tier de stream** (~86% da receita). Conclusão: ser o **substituto vertical completo** da liga, com a arma que o Patreon não tem.
4. **De rap-específico para generalista.** No naming, o dono preferiu algo **generalista** para stream/conteúdo. Battle rap passou a ser o beachhead, não o âmbito. Nome escolhido: **FirstRow** (domínio `joinfirstrow.com`).
5. **Números reais entraram.** Split de tiers e 9 meses de payouts da SmokingBars → confirmaram que o Patreon come ~23% e que, em PT sozinho, isto é side-income/beachhead, não negócio autónomo.

## Requisitos que o dono fixou
- Interligar com **OBS** (RTMP).
- **Guardar o VOD** da stream.
- **MB WAY** como pagamento principal.
- Ser **super seguro** contra fugas e **minucioso** para as ligas não olharem com desdém.

## Onde ficámos
Repo criado a partir do template `oficinalabs/template-projeto`; convenções `00`–`06` preenchidas; estratégia, segurança, arquitetura, pagamentos, roadmap e decisões escritas em `docs/`. Próximo passo em aberto: proposta de uma página para a SmokingBars e/ou spec técnico do MVP (Fase 0).
