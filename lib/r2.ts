import "server-only";
import { createHash, createHmac } from "node:crypto";

/*
 * ============================================================================
 *  CLOUDFLARE R2 — o armazenamento das imagens de canal
 * ============================================================================
 *
 * O R2 fala S3. Precisamos de DUAS operações (pôr um objeto, apagar um objeto)
 * e de nada mais: sem listagens, sem multipart, sem URLs pré-assinados, sem
 * ciclo de vida.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  PORQUE É QUE NÃO ESTÁ AQUI O @aws-sdk/client-s3
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Medido, não estimado: `pnpm add @aws-sdk/client-s3` traz **18 MB em disco e
 * 28 pacotes** para assinar dois pedidos HTTP. Nada disso chega ao browser (é
 * código de servidor), mas chega ao cold start das funções da Vercel e à
 * superfície de dependências de um projeto que tem 17 em runtime.
 *
 * O que o SDK faria por nós cabe nas ~90 linhas de `sign()` abaixo, com o
 * `node:crypto` que já existe no runtime. A troca é explícita: menos 18 MB e
 * menos 28 pacotes, mais um assinador nosso — que é código que pode estar
 * errado. Por isso está PROVADO contra o vetor oficial da AWS
 * (`tests/unidade/assinatura-r2.test.ts`) e contra o bucket a sério.
 *
 * O que se perde e é honesto dizer: retries com backoff, multipart para
 * ficheiros grandes, e checksums adicionais. Nada disso é preciso para um
 * PUT de ≤3 MB — e se um dia for, o SDK volta a ser a resposta certa.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  A CAPACIDADE DEGRADA-SE, NÃO REBENTA
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Sem as variáveis, `r2Config()` devolve `null` e quem chama responde "as
 * imagens de canal estão desligadas" — a plataforma inteira continua a
 * funcionar. É por isso que a configuração se lê à chamada e nunca no import:
 * um `throw` no topo do módulo derrubava o build de quem não tem chaves.
 * `lib/startup-check.ts` diz em voz alta o que falta, uma vez por arranque.
 */

/** Região fixa do R2. Não há escolha: a Cloudflare só aceita `auto`. */
const REGION = "auto";
const SERVICE = "s3";
const ALGORITHM = "AWS4-HMAC-SHA256";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Origem pública do bucket, sem barra final. */
  publicUrl: string;
};

/** As variáveis de que a capacidade "Imagens de canal" depende. */
export const R2_VARS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
] as const;

const read = (name: string) => (process.env[name] ?? "").trim();

/**
 * A configuração do R2, ou `null` se faltar alguma peça.
 *
 * Tudo-ou-nada de propósito: meia configuração dava um erro de rede opaco no
 * momento em que alguém carregasse uma imagem, em vez de um aviso no arranque.
 */
export function r2Config(): R2Config | null {
  const values = R2_VARS.map(read);
  if (values.some((value) => value === "")) return null;

  const [accountId, accessKeyId, secretAccessKey, bucket, publicUrl] = values;
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    // Sem barra final: é o que deixa `${publicUrl}/${key}` ser sempre correto.
    publicUrl: publicUrl.replace(/\/+$/, ""),
  };
}

/** Há armazenamento de imagens neste arranque? */
export function isImageStorageReady(): boolean {
  return r2Config() !== null;
}

/**
 * O URL público de um objeto.
 *
 * As chaves são geradas por nós (ver `imageObjectKey`) e só têm caracteres
 * seguros, mas passa-se pelo `encodeURIComponent` segmento a segmento na mesma:
 * a garantia tem de estar no código que constrói o URL, não na disciplina de
 * quem escrever a próxima função que gera chaves.
 */
export function publicUrlFor(key: string, config: R2Config): string {
  return `${config.publicUrl}/${encodeKey(key)}`;
}

/**
 * A chave de um objeto a partir do seu URL público, ou `null` se o URL não for
 * deste bucket.
 *
 * Serve duas coisas: saber se um `logoUrl` gravado é nosso (e portanto se pode
 * ser apagado), e recusar gravar um URL de fora — ver `app/admin/canais/actions.ts`.
 */
export function keyFromPublicUrl(url: string, config: R2Config): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const base = new URL(config.publicUrl);
  // Comparação por ORIGEM e não por prefixo de texto: um `startsWith` deixava
  // passar "https://pub-xxx.r2.dev.atacante.pt/…", que começa igual e é outro
  // servidor.
  if (parsed.origin !== base.origin) return null;

  const prefix = base.pathname.replace(/\/+$/, "");
  if (!parsed.pathname.startsWith(`${prefix}/`)) return null;

  const key = decodeURIComponent(parsed.pathname.slice(prefix.length + 1));
  return key === "" ? null : key;
}

/** Este URL é um objeto do nosso bucket? */
export function isOwnPublicUrl(url: string): boolean {
  const config = r2Config();
  return config !== null && keyFromPublicUrl(url, config) !== null;
}

// ── Assinatura SigV4 ────────────────────────────────────────────────────────

const sha256Hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

const hmac = (key: Uint8Array | string, data: string) =>
  createHmac("sha256", key).update(data, "utf8").digest();

/** Codifica cada segmento da chave, deixando as barras a separar. */
function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/**
 * O NÚCLEO da assinatura: dá o valor do cabeçalho `Authorization`.
 *
 * Puro e sem nada de R2 lá dentro — recebe os cabeçalhos já escolhidos, a
 * região, o serviço e o instante. É essa generalidade que o torna verificável
 * contra os **vetores oficiais da AWS** (`tests/unidade/assinatura-r2.test.ts`):
 * um assinador que só sabe falar com o nosso bucket só se pode provar contra o
 * nosso bucket, e um teste que precisa de rede e de chaves não corre em CI.
 *
 * As quatro coisas fáceis de errar aqui, e que os vetores apanham:
 *
 *  1. **A data é a mesma nos dois sítios.** `x-amz-date` e o `scope` da
 *     credencial saem do MESMO instante — calcular `new Date()` duas vezes dá
 *     uma assinatura inválida à meia-noite, uma vez por dia.
 *  2. **Os cabeçalhos assinados vão por ordem alfabética**, em minúsculas, e a
 *     lista `SignedHeaders` tem de bater certo com o bloco canónico.
 *  3. **O bloco canónico acaba em `\n`** — cada linha leva o seu. Esquecer o
 *     último dá uma assinatura errada que só se percebe por comparação.
 *  4. **O hash do corpo** vai no `x-amz-content-sha256` E na última linha do
 *     pedido canónico. Um corpo vazio é o hash da string vazia, não "".
 */
export function signRequest(options: {
  method: string;
  path: string;
  /** Query já canónica (ordenada e codificada). Vazia nas nossas operações. */
  query?: string;
  /** Cabeçalhos a assinar, em minúsculas. `host` é obrigatório. */
  headers: Record<string, string>;
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  amzDate: string;
}): string {
  const {
    method,
    path,
    query = "",
    headers,
    payloadHash,
    accessKeyId,
    secretAccessKey,
    region,
    service,
    amzDate,
  } = options;

  const date = amzDate.slice(0, 8);
  const scope = `${date}/${region}/${service}/aws4_request`;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((name) => `${name}:${headers[name].trim()}\n`).join("");
  const signedHeaders = names.join(";");

  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join(
    "\n",
  );

  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), region), service),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return (
    `${ALGORITHM} Credential=${accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`
  );
}

/** Os cabeçalhos completos de um pedido ao R2, assinatura incluída. */
function r2Headers(options: {
  method: string;
  path: string;
  payload: Uint8Array;
  contentType?: string;
  config: R2Config;
  now: Date;
}): Record<string, string> {
  const { method, path, payload, contentType, config, now } = options;

  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const payloadHash = sha256Hex(payload);

  const headers: Record<string, string> = {
    host: `${config.accountId}.r2.cloudflarestorage.com`,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["content-type"] = contentType;

  return {
    ...headers,
    Authorization: signRequest({
      method,
      path,
      headers,
      payloadHash,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: REGION,
      service: SERVICE,
      amzDate,
    }),
  };
}

// ── Operações ───────────────────────────────────────────────────────────────

async function callR2(options: {
  method: string;
  key: string;
  payload: Uint8Array;
  contentType?: string;
  config: R2Config;
}): Promise<Response> {
  const { method, key, payload, contentType, config } = options;
  const path = `/${config.bucket}/${encodeKey(key)}`;
  const headers = r2Headers({ method, path, payload, contentType, config, now: new Date() });

  return fetch(`https://${config.accountId}.r2.cloudflarestorage.com${path}`, {
    method,
    headers,
    body: method === "PUT" ? new Uint8Array(payload) : undefined,
    // O R2 é um serviço externo: nada disto deve entrar na cache do Next.
    cache: "no-store",
  });
}

/** O que uma escrita no R2 pode responder. */
export type R2Put = { ok: true; url: string } | { ok: false; error: string };

/**
 * Põe um objeto no bucket e devolve o URL público.
 *
 * Nunca lança por causa da resposta do R2: quem chama é uma rota de API que
 * precisa de traduzir a falha em status, e uma exceção aqui virava um 500 para
 * um problema que é do armazenamento e não nosso.
 */
export async function putImage(key: string, body: Uint8Array, contentType: string): Promise<R2Put> {
  const config = r2Config();
  if (!config) return { ok: false, error: "armazenamento por configurar" };

  let response: Response;
  try {
    response = await callR2({ method: "PUT", key, payload: body, contentType, config });
  } catch (error) {
    console.error("[r2] PUT falhou na rede:", error);
    return { ok: false, error: "rede" };
  }

  if (!response.ok) {
    // O corpo do erro do R2 é XML e traz o código real (`SignatureDoesNotMatch`,
    // `NoSuchBucket`, …). Vai para o log inteiro porque sem ele o diagnóstico é
    // adivinhação; nunca vai para o cliente.
    console.error(`[r2] PUT ${response.status}:`, (await response.text()).slice(0, 500));
    return { ok: false, error: `HTTP ${response.status}` };
  }

  return { ok: true, url: publicUrlFor(key, config) };
}

/**
 * Apaga um objeto. Só falha em silêncio (com log): quem chama está a limpar
 * lixo depois de uma gravação que JÁ correu bem, e falhar a limpeza não pode
 * desfazer o que a pessoa acabou de guardar.
 */
export async function deleteImage(key: string): Promise<boolean> {
  const config = r2Config();
  if (!config) return false;

  try {
    const response = await callR2({
      method: "DELETE",
      key,
      payload: new Uint8Array(),
      config,
    });
    // 204 é o normal; 404 quer dizer que já não estava lá, o que serve na mesma.
    if (response.ok || response.status === 404) return true;
    console.warn(`[r2] DELETE ${response.status} em "${key}"`);
    return false;
  } catch (error) {
    console.warn(`[r2] DELETE falhou em "${key}":`, error);
    return false;
  }
}

/**
 * Apaga o objeto por trás de um URL público NOSSO. Ignora tudo o resto.
 *
 * É a porta que `updateChannelAction` usa para não deixar a imagem antiga a
 * ocupar espaço quando o canal passa a ter outra — e a verificação de origem é
 * o que impede que um URL forjado nos ponha a apagar seja o que for.
 */
export async function deleteImageByUrl(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const config = r2Config();
  if (!config) return;

  const key = keyFromPublicUrl(url, config);
  if (key) await deleteImage(key);
}
