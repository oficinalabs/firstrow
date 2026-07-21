import { NextResponse } from "next/server";
import sharp from "sharp";
import {
  checkImage,
  detectImageFormat,
  IMAGE_RULES,
  type ImageFormat,
  imageObjectKey,
  isImageKind,
  looksLikeSvg,
  SVG_REFUSAL,
} from "@/components/admin/image-upload-rules";
import { newId } from "@/lib/ids";
import { isImageStorageReady, putImage } from "@/lib/r2";
import { requireApi } from "@/server/api-guard";
import { isPlatformAdmin } from "@/server/authz";
import { inspectChannel } from "@/server/channel-access";

/*
 * ============================================================================
 *  UPLOAD DE LOGO E BANNER DE CANAL
 * ============================================================================
 *
 * O `accept="image/*"` do input não impede coisa nenhuma — arrasta-se para lá o
 * que se quiser, e um pedido feito à mão nem pelo input passa. Por isso TUDO o
 * que decide alguma coisa está deste lado, por esta ordem:
 *
 *    1. quem és e o que podes            (sessão + canal)
 *    2. o pedido tem a forma certa?      (multipart, tamanho, campos)
 *    3. o ficheiro é MESMO uma imagem?   (bytes iniciais, nunca a extensão)
 *    4. as medidas servem?               (`sharp` a ler o cabeçalho)
 *    5. só então se escreve no R2
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  QUEM PODE — dono do canal e platform_admin. STAFF NÃO.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `inspectChannel` (server/channel-access.ts) é quem responde, e por baixo dele
 * está o `canManageEvents` do `server/authz.ts` — a MESMA regra que já decide
 * quem edita a marca do canal. Não há aqui verificação nenhuma escrita à mão:
 * quem gere a liga é quem lhe põe a cara.
 *
 * O `staff` fica de fora porque opera transmissão e porta, e a imagem que a
 * liga mostra ao mundo não é operação — é identidade.
 *
 * **Os papéis são POR CANAL.** O dono da liga A que aponte este endpoint ao id
 * da liga B leva 404, o mesmo que um id inventado: a resposta não pode
 * distinguir "não é teu" de "não existe", senão bastava varrer ids para ficar a
 * saber que ligas há na plataforma. Medido em `tests/integracao/upload-de-imagens.test.ts`.
 *
 * O CASO SEM CANAL: no ecrã de criar, o canal ainda não existe e portanto não
 * há id nenhum para verificar. Aí a pergunta é a de `permitChannelCreation` —
 * criar canais é da FirstRow — e é `isPlatformAdmin` que a responde. Um dono de
 * liga leva 403 se tentar carregar imagens sem dizer para que canal são.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE A IMAGEM É SEMPRE VOLTADA A CODIFICAR
 * ────────────────────────────────────────────────────────────────────────────
 *
 * O que sai do `sharp` são pixels voltados a escrever, não os bytes que
 * chegaram. Isso resolve três coisas de uma vez:
 *
 *  · **EXIF fora.** A foto do banner podia trazer as coordenadas GPS de onde
 *    foi tirada. O `sharp` só mantém metadados se lhos pedirem, e não pedimos.
 *  · **Poliglotas mortos.** Um ficheiro que é PNG válido E outra coisa válida
 *    ao mesmo tempo deixa de o ser depois de descodificado e reescrito.
 *  · **Peso.** WebP num logo de 512 px sai tipicamente a metade do PNG, e quem
 *    o vai descarregar está num telemóvel com dados contados.
 */

/** Teto de pixels à ENTRADA. Ver a nota sobre bombas de descompressão abaixo. */
const MAX_INPUT_PIXELS = 40_000_000;

/**
 * Folga sobre o maior limite, para o cabeçalho e as fronteiras do multipart.
 * Serve só para cortar cedo um corpo absurdo; o limite a sério é por tipo.
 */
const MULTIPART_SLACK = 64 * 1024;
const MAX_BODY_BYTES =
  Math.max(...Object.values(IMAGE_RULES).map((r) => r.maxBytes)) + MULTIPART_SLACK;

/** Qualidade do WebP por tipo de imagem. */
const WEBP_QUALITY = {
  // O logo tem arestas duras e texto pequeno: um WebP agressivo faz-lhes
  // franjas. 92 é caro em bytes num ficheiro que já é pequeno, e barato em
  // aspecto num sítio onde o logo aparece a 44 px e a 96 px.
  logo: 92,
  // O banner é fotografia. 82 é o ponto em que a diferença deixa de se ver e o
  // ficheiro ainda encolhe muito.
  banner: 82,
} as const;

const problema = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status });

/** O que o `sharp` diz que é, no vocabulário do nosso detetor. */
function sharpFormat(format: string | undefined): ImageFormat | null {
  if (format === "png" || format === "webp") return format;
  if (format === "jpeg" || format === "jpg") return "jpeg";
  return null;
}

export async function POST(req: Request) {
  /*
   * Sem R2 configurado responde-se 503 e diz-se porquê. Não é 500: não há avaria
   * nenhuma — há uma capacidade desligada, que é exactamente o que o
   * `lib/startup-check.ts` já anuncia no arranque.
   */
  if (!isImageStorageReady()) {
    return problema(
      "O armazenamento de imagens ainda não está ligado. Fala connosco — o resto do canal grava na mesma.",
      503,
    );
  }

  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
    return problema("Esperava um formulário com ficheiro (multipart/form-data).", 415);
  }

  /*
   * Corte pelo `Content-Length` ANTES de ler o corpo. O cliente pode mentir no
   * cabeçalho — e por isso o tamanho real é medido outra vez lá em baixo —, mas
   * quem é honesto e enviou 40 MB por engano leva a resposta sem esperar pelo
   * upload inteiro.
   */
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return problema("A imagem é grande demais.", 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return problema("Não deu para ler o formulário enviado.", 400);
  }

  const kind = form.get("kind");
  if (!isImageKind(kind)) {
    return problema("Diz se a imagem é o logo ou o banner.", 400);
  }
  const rules = IMAGE_RULES[kind];

  // ── Quem pode ─────────────────────────────────────────────────────────────
  /*
   * O `channelId` vem do cliente e é só isso: A CHAVE DO RECURSO, como um id no
   * URL. Nunca é a autorização — quem decide é a sessão, lida no servidor, a
   * cada pedido (regra 2 do `server/api-guard.ts`).
   */
  const rawChannelId = form.get("channelId");
  const channelId = typeof rawChannelId === "string" ? rawChannelId.trim() : "";

  let scopeId: string;
  if (channelId === "") {
    // Ecrã de criar canal: ainda não há canal. Criar canais é da FirstRow.
    const gate = await requireApi(isPlatformAdmin);
    if (!gate.ok) return gate.response;
    // As imagens de um canal que ainda não existe ficam à parte, e o dono é
    // quem as carregou — assim duas pessoas a criar canais ao mesmo tempo nunca
    // se cruzam, e sabe-se de quem é o lixo se o canal nunca chegar a nascer.
    scopeId = `_novo/${gate.user.id}`;
  } else {
    const seen = await inspectChannel(channelId);
    if (seen.status === "anonymous") return problema("Precisas de iniciar sessão.", 401);
    // 404 e não 403: ver a nota do cabeçalho.
    if (seen.status === "denied") return problema("Canal não encontrado.", 404);
    scopeId = seen.channel.id;
  }

  // ── O ficheiro ────────────────────────────────────────────────────────────

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return problema("Escolhe um ficheiro de imagem.", 400);
  }
  if (file.size > rules.maxBytes) {
    return problema(checkImage(kind, { width: 0, height: 0, bytes: file.size }) ?? "", 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  /*
   * O TIPO REAL, pelos primeiros bytes. Nem a extensão nem o `Content-Type` do
   * multipart contam: são as duas coisas texto que quem envia escreve.
   */
  const format = detectImageFormat(bytes);
  if (!format) {
    return problema(
      looksLikeSvg(bytes) ? SVG_REFUSAL : "Isto não é uma imagem PNG, JPG ou WebP.",
      415,
    );
  }

  /*
   * BOMBAS DE DESCOMPRESSÃO: um PNG de 900 KB pode declarar 30000×30000 e
   * ocupar gigabytes ao descodificar — servidor em baixo, sem erro nenhum a
   * apontar para aqui. Duas defesas, e a ordem entre elas é o que importa:
   *
   *  1. `metadata()` lê o CABEÇALHO e não descodifica nada. As medidas saem
   *     baratas, e é com elas que se recusa antes de haver pixels.
   *  2. `limitInputPixels` é a rede por baixo, para o caso de o `sharp` ter de
   *     tocar nos dados na mesma.
   */
  const image = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS });

  let width: number | undefined;
  let height: number | undefined;
  try {
    const meta = await image.metadata();
    width = meta.width;
    height = meta.height;

    /*
     * O que o `sharp` leu tem de bater certo com o que os bytes iniciais
     * disseram. Um ficheiro em que as duas leituras discordam é, por definição,
     * um ficheiro a tentar parecer duas coisas — não se serve isso a ninguém.
     */
    if (sharpFormat(meta.format) !== format) {
      return problema("Este ficheiro não é a imagem que diz ser.", 415);
    }
  } catch {
    return problema("Não conseguimos ler esta imagem — está corrompida ou é grande demais.", 422);
  }

  if (!width || !height) {
    return problema("Não conseguimos medir esta imagem.", 422);
  }

  const complaint = checkImage(kind, { width, height, bytes: bytes.length });
  if (complaint) return problema(complaint, 422);

  // ── Gravar ────────────────────────────────────────────────────────────────

  let output: Buffer;
  try {
    output = await image
      // `rotate()` sem argumento aplica a orientação do EXIF e depois deita-o
      // fora. Sem isto, uma foto de telemóvel ficava deitada de lado.
      .rotate()
      .webp({ quality: WEBP_QUALITY[kind] })
      .toBuffer();
  } catch (error) {
    console.error("[uploads] converter falhou:", error);
    return problema("Não conseguimos processar esta imagem. Tenta outra.", 422);
  }

  // O nome é nosso, sempre. Ver `imageObjectKey`.
  const key = imageObjectKey({ channelId: scopeId, kind, id: newId() });
  const saved = await putImage(key, new Uint8Array(output), "image/webp");
  if (!saved.ok) {
    return problema("O armazenamento não aceitou a imagem. Tenta outra vez daqui a pouco.", 502);
  }

  return NextResponse.json(
    { url: saved.url, width, height, bytes: output.byteLength },
    { status: 201 },
  );
}
