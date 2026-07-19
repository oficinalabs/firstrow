/*
 * ============================================================================
 *  DECISÕES DE NEGÓCIO QUE ENTRAM NO TEXTO LEGAL
 * ============================================================================
 *
 * Valores que eram `[DEFINIR]` em `docs/legal/CONTEUDO-PAGINAS.md` e que o dono
 * do negócio já decidiu. Vivem aqui, num sítio só, para não andarem repetidos
 * pelas páginas e pela FAQ — mudar um é mudar aqui.
 *
 * O que continua `[DEFINIR]` (NIF, sede, prazos de reembolso, política de falha
 * de stream, repasse às ligas…) NÃO está aqui de propósito: o renderizador
 * mostra-o como marcador para se ver o que falta, e inventá-lo seria pior do
 * que assumir que ainda não está decidido.
 */

/*
 * ⚠️ PENDENTE DE CRIAÇÃO — a caixa de correio `suporte@arestadigital.pt` ainda
 * NÃO existe. O Rui tem de a criar antes do lançamento; até lá, um email
 * enviado para este endereço não chega a ninguém.
 *
 * O endereço já aparece no site porque foi a decisão tomada — o que falta é a
 * caixa do outro lado, não a decisão. Deixado aqui, comentado, para não cair no
 * esquecimento entre "decidido" e "a funcionar".
 */
export const EMAIL_SUPORTE = "suporte@arestadigital.pt";

/**
 * Ligação de suporte já em marcação inline (ver `components/legal/texto-inline`),
 * para não repetir o par texto/mailto em cada frase que manda contactar-nos.
 */
export const LINK_SUPORTE = `[${EMAIL_SUPORTE}](mailto:${EMAIL_SUPORTE})`;

/**
 * A entidade legal nomeada nos documentos.
 *
 * NIF e sede continuam por preencher (`[—]` no texto) — o Rui ainda não deu o
 * NIF, e sem ele a identificação fiscal fica incompleta na mesma. Só o nome
 * está decidido.
 */
export const ENTIDADE_LEGAL = "Aresta";

/**
 * Dias em que o arquivo/VOD fica disponível na conta depois do direto.
 * Decisão de produto (não é imposição legal), mas tem de estar escrita.
 */
export const JANELA_VOD_DIAS = 30;
