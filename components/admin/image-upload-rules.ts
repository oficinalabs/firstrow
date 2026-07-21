/*
 * ============================================================================
 *  REGRAS DAS IMAGENS DE CANAL — os limites, num sítio só
 * ============================================================================
 *
 * Puro, sem I/O, sem `sharp`: corre igual no browser (para dizer o que se
 * espera ANTES de haver erro) e no servidor (onde é o veredito que conta).
 * Mesma ideia do `channel-rules.ts` ao lado, e pela mesma razão — dois sítios
 * a decidir o mesmo acabam sempre por divergir.
 *
 * O logo e o banner são **a mesma coisa com números diferentes**. Por isso há
 * uma tabela e não duas funções: acrescentar um terceiro formato de imagem
 * (um poster, um patrocínio) é acrescentar uma linha, não um componente.
 *
 * NOTA DE FRONTEIRA: vive em `components/admin/` para acompanhar o
 * `channel-rules.ts`, que está aqui pela mesma razão. O sítio natural dos dois
 * é `lib/`; movem-se juntos quando alguém tiver a fronteira toda na mão.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE NÃO SE ACEITA SVG — decisão, não esquecimento
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Um SVG não é uma imagem: é XML que o browser executa. Traz `<script>`,
 * `<foreignObject>` com HTML lá dentro, `xlink:href` a buscar coisas a
 * servidores de fora, `@import` no CSS, atributos `onload=`, e `<animate>` a
 * reescrever um `href` depois de carregado. Sanitizar isso a sério é um
 * analisador de XML com lista branca — e a forma como um sanitizador falha é
 * em SILÊNCIO: passa a servir XSS guardado, com a nossa marca em cima, e nada
 * no ecrã o diz.
 *
 * A pergunta que fecha a decisão é a outra: **precisamos?** O logo aparece a
 * 44, 60 e 96 px. Um PNG de 512×512 cobre tudo isso com folga, e passa por
 * `sharp`, que o volta a codificar e portanto não deixa passar nada de lado.
 *
 * Excluir é a escolha honesta. O ecrã diz porquê, e diz antes de alguém tentar.
 */

export type ImageKind = "logo" | "banner";

/** Os formatos que aceitamos. A extensão do ficheiro não conta para nada. */
export type ImageFormat = "png" | "jpeg" | "webp";

export type ImageRules = {
  /** Como o campo se chama no ecrã. */
  label: string;
  minWidth: number;
  minHeight: number;
  /** `null` = sem teto (o banner só tem mínimo e rácio). */
  maxWidth: number | null;
  maxHeight: number | null;
  maxBytes: number;
  /** Largura ÷ altura que se espera. */
  aspect: number;
  /** Desvio aceite ao rácio, em fração (0 = exato). */
  aspectTolerance: number;
  /** A frase que aparece no ecrã ANTES de haver erro nenhum. */
  expected: string;
  /** Para que serve, em linguagem de pessoas. */
  purpose: string;
};

const MB = 1024 * 1024;

export const IMAGE_RULES: Record<ImageKind, ImageRules> = {
  logo: {
    label: "Logo",
    minWidth: 256,
    minHeight: 256,
    maxWidth: 1024,
    maxHeight: 1024,
    maxBytes: 1 * MB,
    aspect: 1,
    // Quadrado é quadrado: o logo entra numa caixa 1:1 em três sítios, e
    // 512×511 esticado 1 px é mais feio do que uma recusa que diz o que fazer.
    aspectTolerance: 0,
    expected: "Quadrado, entre 256×256 e 1024×1024, até 1 MB. PNG, JPG ou WebP.",
    purpose: "Aparece no avatar do canal e ao lado do nome. Sem logo ficam as iniciais.",
  },
  banner: {
    label: "Banner",
    minWidth: 1200,
    minHeight: 400,
    maxWidth: null,
    maxHeight: null,
    maxBytes: 3 * MB,
    aspect: 3,
    // ±10%: um banner cortado à mão nunca sai em 3:1 ao pixel, e recusar
    // 1200×390 não protege nada.
    aspectTolerance: 0.1,
    expected: "Faixa 3:1 (±10%), no mínimo 1200×400, até 3 MB. PNG, JPG ou WebP.",
    purpose: "Faixa larga no topo da página do canal. Sem banner, o topo fica liso.",
  },
};

export const IMAGE_KINDS = Object.keys(IMAGE_RULES) as ImageKind[];

/**
 * ⚠️ `includes` na lista, e **nunca** `value in IMAGE_RULES`.
 *
 * Isto esteve escrito com `in`, e o teste apanhou-o: o `in` percorre a cadeia
 * de protótipos, portanto `"__proto__" in IMAGE_RULES` é `true`. A partir daí
 * `IMAGE_RULES["__proto__"]` devolvia o `Object.prototype` — um objeto sem
 * `maxBytes`, sem `minWidth` e sem `aspect`. Toda a comparação contra
 * `undefined` dá `false`, e o `checkImage` devolvia `null`: **um pedido com
 * `kind=__proto__` passava sem verificação nenhuma de peso nem de medidas.**
 *
 * A leitura do código não mostrava isto. A medição mostrou.
 */
export function isImageKind(value: unknown): value is ImageKind {
  return typeof value === "string" && (IMAGE_KINDS as readonly string[]).includes(value);
}

/**
 * O `accept` do input. É CONFORTO — abre o seletor de ficheiros já filtrado —
 * e não segurança: qualquer pessoa arrasta o que quiser para lá, e o browser
 * deixa. Quem recusa a sério é `detectImageFormat`, no servidor.
 */
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

/** O que o SVG leva como resposta, com o porquê. Ver o cabeçalho do ficheiro. */
export const SVG_REFUSAL =
  "SVG não é aceite: um SVG é código e pode trazer script lá dentro. " +
  "Exporta em PNG (aceita fundo transparente), JPG ou WebP.";

// ── Tipo real do ficheiro ───────────────────────────────────────────────────

/*
 * A extensão e o `Content-Type` são texto que o cliente escolhe: um `.png` no
 * nome não faz um PNG, e `image/png` no cabeçalho ainda menos. O que não se
 * falsifica é o princípio do ficheiro — é o que os descodificadores leem.
 */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50]; // "WEBP", nos bytes 8..11

const startsWith = (bytes: Uint8Array, magic: number[], offset = 0) =>
  bytes.length >= offset + magic.length && magic.every((b, i) => bytes[offset + i] === b);

/**
 * O formato REAL de um ficheiro, pelos primeiros bytes. `null` para tudo o que
 * não seja PNG, JPEG ou WebP — incluindo SVG, GIF, PDF e ficheiros vazios.
 */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, PNG_MAGIC)) return "png";
  if (startsWith(bytes, JPEG_MAGIC)) return "jpeg";
  // O WebP é um contentor RIFF: as duas assinaturas TÊM de bater as duas, senão
  // um WAV (que também é RIFF) passava por imagem.
  if (startsWith(bytes, RIFF_MAGIC) && startsWith(bytes, WEBP_MAGIC, 8)) return "webp";
  return null;
}

/**
 * Parece um SVG? Só para dar a resposta certa a quem tenta — a recusa não
 * depende disto (o que não for PNG/JPEG/WebP é recusado na mesma).
 *
 * Um SVG pode começar por `<?xml`, por comentários ou por espaços em branco,
 * daí olhar-se para um pedaço do início e não para o primeiro byte.
 */
export function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, 512))
    .toLowerCase();
  return head.includes("<svg");
}

// ── Medidas ─────────────────────────────────────────────────────────────────

/** Bytes em texto de pessoa: "820 KB", "2,4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / MB).toFixed(1).replace(".", ",")} MB`;
}

/**
 * A imagem serve? `null` quando sim; a frase a mostrar quando não.
 *
 * As mensagens dizem sempre DUAS coisas — o que se esperava e o que veio —
 * porque "dimensões inválidas" obriga a pessoa a adivinhar qual das duas
 * estava errada.
 */
export function checkImage(
  kind: ImageKind,
  size: { width: number; height: number; bytes: number },
): string | null {
  const rules = IMAGE_RULES[kind];
  const { width, height, bytes } = size;
  const medida = `Este é ${width}×${height}`;

  if (bytes > rules.maxBytes) {
    return `A imagem tem ${formatBytes(bytes)} e o limite é ${formatBytes(rules.maxBytes)}. Guarda-a com menos qualidade ou mais pequena.`;
  }

  if (width < rules.minWidth || height < rules.minHeight) {
    return `${medida} e o mínimo é ${rules.minWidth}×${rules.minHeight} — esticada ficaria desfocada.`;
  }

  if (rules.maxWidth !== null && rules.maxHeight !== null) {
    if (width > rules.maxWidth || height > rules.maxHeight) {
      return `${medida} e o máximo é ${rules.maxWidth}×${rules.maxHeight}.`;
    }
  }

  // Divisão e não multiplicação cruzada: o desvio tem de ser relativo ao rácio
  // esperado, senão a tolerância de 10% valia coisas diferentes em 3:1 e 1:1.
  const ratio = width / height;
  const drift = Math.abs(ratio - rules.aspect) / rules.aspect;
  if (drift > rules.aspectTolerance) {
    if (rules.aspect === 1) {
      return `${medida} e o logo tem de ser quadrado — a mesma largura e altura.`;
    }
    const ideal = Math.round(height * rules.aspect);
    return `${medida}, e a faixa tem de ser 3:1 (±10%). Para esta altura, a largura certa anda nos ${ideal} px.`;
  }

  return null;
}

// ── Nome do ficheiro guardado ───────────────────────────────────────────────

/**
 * A chave do objeto no R2. **Nunca** inclui o nome que veio do utilizador.
 *
 * Um nome escolhido por quem carrega é um vetor de vários problemas ao mesmo
 * tempo: `../` a sair da pasta, nomes iguais a esmagarem-se uns aos outros,
 * unicode a normalizar de formas diferentes, e o nome do ficheiro do portátil
 * de alguém a ficar público para sempre. Aqui o nome é nosso, e o id aleatório
 * garante que gravar duas vezes nunca reescreve a imagem anterior — o que
 * também faz com que o URL antigo continue válido enquanto a página não muda.
 *
 * O canal vai no caminho para que se saiba de quem é cada objeto ao olhar para
 * a listagem do bucket. Não é autorização: quem autoriza é a rota.
 */
export function imageObjectKey(options: {
  channelId: string;
  kind: ImageKind;
  id: string;
  prefix?: string;
}): string {
  const { channelId, kind, id, prefix } = options;
  const base = `canais/${channelId}/${kind}-${id}.webp`;
  return prefix ? `${prefix.replace(/\/+$/, "")}/${base}` : base;
}
