import "server-only";

import { isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import { channels } from "@/db/schema";
import { deleteImage, keyFromPublicUrl, listImages, type R2Object, r2Config } from "@/lib/r2";

/*
 * ============================================================================
 *  IMAGENS ÓRFÃS NO R2 — o que ficou no bucket sem ninguém a apontar-lhe
 * ============================================================================
 *
 * DE ONDE VÊM. Há um único sítio que escreve no bucket
 * (`app/api/uploads/canal/route.ts`) e ele escreve ANTES de o formulário ser
 * gravado — tem de ser, porque a pré-visualização precisa de um URL. Portanto:
 *
 *  1. quem carrega uma imagem e fecha o separador sem gravar deixa-a lá;
 *  2. quem troca de imagem três vezes antes de gravar deixa DUAS lá (cada
 *     upload gera um id novo, e `imageObjectKey` não permite sobrescrever);
 *  3. no ecrã de CRIAR canal ainda não há id de canal, por isso a chave fica
 *     `canais/_novo/<userId>/…` — e nada a move quando o canal nasce.
 *
 * Nada disto parte seja o que for: são uns KB por imagem. Mas acumula para
 * sempre, e um bucket que só cresce acaba por ser uma conta que só cresce.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  ⚠️ O CRITÉRIO — e porque é que NÃO é "apagar o que está debaixo de `_novo/`"
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A tentação é limpar por PREFIXO: `canais/_novo/**` parece lixo por definição.
 * NÃO É. Um canal criado por esse ecrã fica com o `logo_url` a apontar
 * exatamente para lá, para sempre — o URL nunca é reescrito. Uma limpeza por
 * prefixo apagava os logos de canais VIVOS, em produção, e o sintoma seria
 * imagens partidas no site público sem nada nos registos a explicar porquê.
 *
 * Por isso o critério é por REFERÊNCIA, e tem de valer as duas condições:
 *
 *   (a) a chave NÃO é referida por nenhuma linha de `channels`
 *       (nem `logo_url` nem `banner_url`);  E
 *   (b) o objeto foi escrito há mais de `PRAZO_DE_GRACA_MS`.
 *
 * A condição (b) não é excesso de zelo: entre o upload e o `submit` pode passar
 * muito tempo — a pessoa está a escolher a imagem, a mudar de ideias, a ir
 * almoçar com o formulário aberto. Sem prazo de graça, uma limpeza que corresse
 * nesse intervalo apagava a imagem por baixo de um formulário que ainda ia ser
 * gravado, e o utilizador gravava um canal com um URL morto.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  AS GUARDAS QUE IMPEDEM O ACIDENTE CARO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Uma limpeza automática é a única coisa aqui que APAGA, e apaga do bucket real
 * do dono. As três guardas abaixo existem porque o modo de falha não é "não
 * limpou": é "limpou tudo".
 *
 *  1. **Lista ilegível ⇒ não se apaga nada.** `listImages` devolve `null` (e não
 *     lista vazia) quando não consegue ler. Se a leitura falhar a meio, o
 *     conjunto "o que existe" fica INCOMPLETO — e um conjunto incompleto de
 *     referências transformava ficheiros vivos em órfãos.
 *  2. **Zero referências com bucket cheio ⇒ aborta.** Se a query a `channels`
 *     devolver zero URLs mas o bucket tiver objetos, o mais provável NÃO é que
 *     esteja tudo órfão — é que a query correu contra a base errada, ou a
 *     coluna mudou de nome. É a mesma lição do `inChannelScope()`: uma lista
 *     vazia significa "zero linhas", nunca "sem filtro".
 *  3. **`dryRun` é o valor por omissão.** Quem quiser apagar tem de o pedir.
 */

/**
 * Quanto tempo um objeto sem referência é deixado em paz.
 *
 * Sete dias cobrem com folga o formulário deixado aberto de um dia para o
 * outro, e continuam a esvaziar o bucket em ritmo útil. Não há pressa nenhuma
 * do outro lado: o que se ganha em apagar mais cedo são cêntimos.
 */
export const PRAZO_DE_GRACA_MS = 7 * 24 * 60 * 60 * 1000;

/** O prefixo onde vivem as imagens de canal. Nada fora daqui é sequer olhado. */
export const PREFIXO_DAS_IMAGENS = "canais/";

export type RelatorioDeOrfas = {
  /** Objetos vistos no bucket sob o prefixo. */
  vistos: number;
  /** Chaves referidas por alguma linha de `channels`. */
  referidas: number;
  /** Sem referência, mas ainda dentro do prazo de graça — não se toca. */
  recentes: number;
  /** Sem referência e fora do prazo: os órfãos a sério. */
  orfas: R2Object[];
  /** Bytes que os órfãos ocupam. */
  bytesOrfaos: number;
  /** Quantos foram mesmo apagados (0 num `dryRun`). */
  apagadas: number;
  /** Preenchido quando uma guarda travou a operação. */
  abortadoPorque?: string;
};

/**
 * Todas as chaves do bucket referidas por algum canal.
 *
 * Lê as DUAS colunas, e de TODOS os canais — sem âmbito nenhum, de propósito:
 * isto não é um ecrã, é uma limpeza, e um filtro por canal aqui significaria
 * apagar as imagens dos canais que o filtro deixasse de fora.
 *
 * Os valores guardados podem ser caminhos internos (`/imagens/logo.svg`, dos
 * logos que vêm no repositório). O `keyFromPublicUrl` devolve `null` para
 * esses, o que é o que se quer — não são objetos do bucket.
 */
async function chavesReferidas(): Promise<Set<string>> {
  const config = r2Config();
  const referidas = new Set<string>();
  if (!config) return referidas;

  const linhas = await db
    .select({ logoUrl: channels.logoUrl, bannerUrl: channels.bannerUrl })
    .from(channels)
    .where(or(isNotNull(channels.logoUrl), isNotNull(channels.bannerUrl)));

  for (const linha of linhas) {
    for (const url of [linha.logoUrl, linha.bannerUrl]) {
      const chave = keyFromPublicUrl(url ?? "", config);
      if (chave) referidas.add(chave);
    }
  }
  return referidas;
}

/**
 * Encontra (e opcionalmente apaga) as imagens órfãs.
 *
 * @param dryRun `true` (por omissão) só relata; `false` apaga mesmo.
 * @param agora  instante de referência, para os testes poderem envelhecer o
 *               prazo de graça sem esperar sete dias.
 */
export async function limparImagensOrfas(
  opcoes: { dryRun?: boolean; agora?: Date } = {},
): Promise<RelatorioDeOrfas> {
  const dryRun = opcoes.dryRun ?? true;
  const agora = opcoes.agora ?? new Date();

  const vazio: RelatorioDeOrfas = {
    vistos: 0,
    referidas: 0,
    recentes: 0,
    orfas: [],
    bytesOrfaos: 0,
    apagadas: 0,
  };

  const objetos = await listImages(PREFIXO_DAS_IMAGENS);
  // GUARDA 1: sem lista fiável não se apaga nada.
  if (objetos === null) {
    return { ...vazio, abortadoPorque: "não consegui listar o bucket" };
  }

  const referidas = await chavesReferidas();

  // GUARDA 2: bucket com conteúdo e nenhuma referência cheira a query errada.
  if (objetos.length > 0 && referidas.size === 0) {
    return {
      ...vazio,
      vistos: objetos.length,
      abortadoPorque:
        "o bucket tem objetos e a base não referiu nenhum — provável base errada ou coluna mudada",
    };
  }

  const orfas: R2Object[] = [];
  let recentes = 0;

  for (const objeto of objetos) {
    if (referidas.has(objeto.key)) continue;
    const idadeMs = agora.getTime() - objeto.lastModified.getTime();
    if (idadeMs < PRAZO_DE_GRACA_MS) {
      recentes += 1;
      continue;
    }
    orfas.push(objeto);
  }

  const relatorio: RelatorioDeOrfas = {
    vistos: objetos.length,
    referidas: referidas.size,
    recentes,
    orfas,
    bytesOrfaos: orfas.reduce((soma, o) => soma + o.bytes, 0),
    apagadas: 0,
  };

  // GUARDA 3: por omissão só se relata.
  if (dryRun) return relatorio;

  for (const orfa of orfas) {
    if (await deleteImage(orfa.key)) relatorio.apagadas += 1;
  }
  return relatorio;
}
