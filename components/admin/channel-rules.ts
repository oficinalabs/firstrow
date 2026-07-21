import { z } from "zod";
import { parseHexColor } from "@/lib/colors";

/*
 * Regras de um canal — puras, sem I/O, para serem partilhadas pelo formulário e
 * por quem gravar do outro lado. Mesma ideia do `lib/event-rules.ts`: o cliente
 * valida com isto para responder na hora, o servidor volta a validar com isto
 * porque o cliente nunca é fonte de verdade.
 *
 * NOTA DE FRONTEIRA: este ficheiro vive em `components/admin/` porque a Frente F
 * só é dona de `components/` e `lib/colors*`. O sítio natural dele é
 * `lib/channel-rules.ts`, a par do `lib/event-rules.ts` — mover quando a Frente E
 * ligar isto a uma server action (é só mudar o import).
 */

/** Slugs que não podem ser de ninguém: colidem com rotas ou confundem. */
const RESERVED_SLUGS = new Set(["novo", "admin", "api", "conta", "bilhetes", "canal", "vod"]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/*
 * ============================================================================
 *  O QUE SERVE DE IMAGEM DE CANAL
 * ============================================================================
 *
 * Duas formas, e as duas se conseguem servir:
 *
 *  · caminho interno — "/brand/logo.svg", das imagens que já vieram no repo;
 *  · URL https — o que o upload devolve, do bucket R2.
 *
 * O `next/image` recusa domínios que não estejam em `images.remotePatterns`, e
 * é por isso que aceitar "https://" era, até haver upload, gravar um logo que
 * rebentava a página do canal ao renderizar. O `next.config.ts` passou a ter lá
 * o domínio público do R2 — e é por isso que isto pode alargar.
 *
 * ⚠️ **A FORMA NÃO É A PROVENIÊNCIA.** Isto responde "consegue-se servir?", que
 * é uma pergunta pura e corre igual no browser. "É NOSSO?" só se responde no
 * servidor, onde `R2_PUBLIC_URL` existe — e é lá que se responde, em
 * `app/admin/canais/actions.ts`, antes de qualquer escrita. Não são duas cópias
 * da mesma regra: são duas perguntas diferentes, e a segunda é a que conta.
 *
 * O `(?!\/)` no caminho interno não é detalhe: "//dominio.pt/x.png" começa por
 * "/" mas é um URL relativo ao protocolo, ou seja, um pedido a um servidor de
 * fora disfarçado de caminho interno.
 */
const IMAGE_PATTERN = /^\/(?!\/)[A-Za-z0-9\-._~/]*$/;

/** Um caminho de imagem interno, sem saltos para fora da pasta pública. */
function isInternalImagePath(value: string): boolean {
  return IMAGE_PATTERN.test(value) && !value.includes("..");
}

/**
 * Um URL https absoluto e bem formado. `http://` fica de fora: uma imagem em
 * claro numa página em https dá aviso de conteúdo misto em todos os browsers.
 */
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Serve de imagem de canal? (forma apenas — ver o aviso acima) */
export function isServableImage(value: string): boolean {
  return isInternalImagePath(value) || isHttpsUrl(value);
}

const MAX_NAME = 60;
const MAX_TAGLINE = 80;
const MAX_SLUG = 40;

/** Cor de arranque de um canal novo: o verde que já existe na plataforma. */
export const DEFAULT_ACCENT = "#6cc24a";

const hexColor = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => parseHexColor(value) !== null, message);

export const channelFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Dá um nome ao canal.")
    .max(MAX_NAME, `O nome não pode passar dos ${MAX_NAME} caracteres.`),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "O endereço do canal não pode ficar vazio.")
    .max(MAX_SLUG, `O endereço não pode passar dos ${MAX_SLUG} caracteres.`)
    .regex(SLUG_PATTERN, "Só letras sem acentos, números e hífens — por exemplo, liga-do-norte.")
    .refine((value) => !RESERVED_SLUGS.has(value), "Este endereço está reservado — escolhe outro."),
  tagline: z
    .string()
    .trim()
    .min(3, "Uma linha a dizer o que é a liga (aparece por baixo do nome).")
    .max(MAX_TAGLINE, `A linha não pode passar dos ${MAX_TAGLINE} caracteres.`),
  logoUrl: z
    .string()
    .trim()
    .refine((value) => value === "" || isServableImage(value), "Carrega o logo outra vez."),
  bannerUrl: z
    .string()
    .trim()
    .refine((value) => value === "" || isServableImage(value), "Carrega o banner outra vez."),
  accentColor: hexColor("Cor em hexadecimal — por exemplo, #6CC24A."),
  // Vazio = a liga só tem uma cor, que é diferente de ter uma cor errada.
  accentColorSecondary: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || parseHexColor(value) !== null,
      "Cor em hexadecimal — por exemplo, #2AA8A0.",
    ),
});

export type ChannelFormValues = z.infer<typeof channelFormSchema>;

export type ChannelFieldErrors = Partial<Record<keyof ChannelFormValues, string>>;

/**
 * Um canal pronto a gravar. **É este o tipo que a Frente F espera** — o `Channel`
 * de `lib/channels.ts` mais `accentColorSecondary`, que é o único campo novo.
 */
export type ChannelDraft = {
  slug: string;
  name: string;
  tagline: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  accentColor: string;
  /** `null` quando a liga escolheu só uma cor. */
  accentColorSecondary: string | null;
  initials: string;
};

export type ChannelFormState = {
  errors: ChannelFieldErrors;
  /** Erro que não é de nenhum campo (permissões, servidor em baixo, slug ocupado). */
  message: string;
  values: ChannelFormValues;
};

export const EMPTY_CHANNEL_VALUES: ChannelFormValues = {
  name: "",
  slug: "",
  tagline: "",
  logoUrl: "",
  bannerUrl: "",
  accentColor: DEFAULT_ACCENT,
  accentColorSecondary: "",
};

export const EMPTY_CHANNEL_FORM: ChannelFormState = {
  errors: {},
  message: "",
  values: EMPTY_CHANNEL_VALUES,
};

// ── Ajudas ──────────────────────────────────────────────────────────────────

/**
 * "Liga do Norte" → "liga-do-norte". Tira acentos em vez de os apagar, senão
 * "São João" ficava "so-joo".
 */
export function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      // Marcas diacríticas combinatórias, separadas pelo NFD acima.
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_SLUG)
      // Um corte a meio pode deixar hífen pendurado.
      .replace(/-+$/, "")
  );
}

/**
 * Iniciais para o avatar quando não há logo. As maiúsculas do nome são a melhor
 * pista que há: "SmokingBars" → SB, "Liga do Norte" → LN (as preposições ficam
 * de fora sozinhas, por serem minúsculas).
 */
export function initialsFrom(name: string): string {
  const capitals = name.match(/\p{Lu}/gu) ?? [];
  if (capitals.length >= 2) return capitals.slice(0, 2).join("");
  const letters = name.replace(/[^\p{L}\p{N}]/gu, "");
  return (letters.slice(0, 2) || "FR").toUpperCase();
}

/** O que ficou escrito, em bruto — devolvido sempre para nada se perder. */
export function readChannelFormValues(input: unknown): ChannelFormValues {
  const raw = (input ?? {}) as Record<string, unknown>;
  const text = (key: keyof ChannelFormValues, fallback = "") =>
    typeof raw[key] === "string" ? (raw[key] as string) : fallback;
  return {
    name: text("name"),
    slug: text("slug"),
    tagline: text("tagline"),
    logoUrl: text("logoUrl"),
    bannerUrl: text("bannerUrl"),
    accentColor: text("accentColor", DEFAULT_ACCENT),
    accentColorSecondary: text("accentColorSecondary"),
  };
}

export type ChannelValidation =
  | { ok: true; draft: ChannelDraft; values: ChannelFormValues }
  | { ok: false; errors: ChannelFieldErrors; values: ChannelFormValues };

/**
 * Valida o formulário de ponta a ponta. Corre tal e qual no cliente (resposta
 * imediata) e no servidor (o veredito que conta).
 *
 * Repare-se no que **não** faz: não recusa cores por causa de contraste. Uma cor
 * impossível não é um erro de formulário — é uma cor que o sistema ajusta e
 * explica (ver `derivePalette`). Recusar era pôr a pessoa a adivinhar hexadecimais.
 */
export function validateChannelForm(input: unknown): ChannelValidation {
  const values = readChannelFormValues(input);
  const parsed = channelFormSchema.safeParse(values);

  if (!parsed.success) {
    const fields = z.flattenError(parsed.error).fieldErrors;
    const first = (key: keyof ChannelFormValues) => fields[key]?.[0];
    return {
      ok: false,
      values,
      errors: {
        name: first("name"),
        slug: first("slug"),
        tagline: first("tagline"),
        logoUrl: first("logoUrl"),
        bannerUrl: first("bannerUrl"),
        accentColor: first("accentColor"),
        accentColorSecondary: first("accentColorSecondary"),
      },
    };
  }

  const data = parsed.data;
  return {
    ok: true,
    values,
    draft: {
      slug: data.slug,
      name: data.name,
      tagline: data.tagline,
      logoUrl: data.logoUrl || null,
      bannerUrl: data.bannerUrl || null,
      // Normalizadas: o que vai para a BD é sempre "#rrggbb" minúsculo.
      accentColor: parseHexColor(data.accentColor) ?? DEFAULT_ACCENT,
      accentColorSecondary: data.accentColorSecondary
        ? parseHexColor(data.accentColorSecondary)
        : null,
      initials: initialsFrom(data.name),
    },
  };
}

/**
 * O canal como a pré-visualização o mostra **enquanto se escreve** — por isso
 * nunca falha e nunca fica vazio: campos por preencher viram texto de exemplo,
 * para a pessoa ver uma página e não um esqueleto meio apagado.
 */
export function previewChannel(values: ChannelFormValues): ChannelDraft {
  const name = values.name.trim() || "O teu canal";
  return {
    slug: values.slug.trim() || slugify(name) || "canal",
    name,
    tagline: values.tagline.trim() || "Uma linha sobre a liga",
    logoUrl: isServableImage(values.logoUrl.trim()) ? values.logoUrl.trim() : null,
    bannerUrl: isServableImage(values.bannerUrl.trim()) ? values.bannerUrl.trim() : null,
    accentColor: parseHexColor(values.accentColor) ?? DEFAULT_ACCENT,
    accentColorSecondary: parseHexColor(values.accentColorSecondary),
    initials: initialsFrom(name),
  };
}
