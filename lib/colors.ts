/*
 * Cor de marca do canal — contraste WCAG e derivação da paleta segura.
 *
 * Uma liga escolhe 1 ou 2 cores e nós temos de as pôr no ecrã sem partir a
 * legibilidade. A regra do sistema: **nunca se recusa uma cor**. Deriva-se dela
 * uma paleta que cumpre AA, e diz-se à pessoa o que foi ajustado (`notices`).
 *
 * Porquê OKLCH e não HSL: mexer na luminosidade tem de manter a cor reconhecível.
 * Em HSL, `L` significa coisas diferentes conforme o tom — amarelo a 50% brilha
 * muito mais que azul a 50%, e escurecer "10%" dá saltos imprevisíveis. Em OKLCH
 * o `L` é luminosidade percetual: escurecer um amarelo dá um amarelo escuro, não
 * um castanho lamacento.
 *
 * ÚNICO ficheiro do projeto com cores em hex fora do globals.css, e por uma razão
 * concreta: contraste é aritmética e precisa dos números das superfícies antes de
 * haver browser para resolver as vars CSS (isto corre no servidor, no render).
 */

// ── Superfícies do design system ────────────────────────────────────────────

/*
 * ESPELHO dos tokens do globals.css. Se a paleta base mudar lá, muda aqui — é a
 * única duplicação do projeto e está deliberadamente reduzida ao mínimo: só as
 * superfícies contra as quais se mede contraste.
 */
const SURFACES = {
  dark: {
    background: "#131211",
    card: "#1b1a18",
    muted: "#2b2926",
    foreground: "#f1efea",
  },
  light: {
    background: "#f6f5f1",
    card: "#fcfbf8",
    muted: "#eceae3",
    foreground: "#161512",
  },
} as const;

export type Surface = keyof typeof SURFACES;

/**
 * Os fundos onde a cor do canal pode assentar. Mede-se contra os três e vale o
 * pior — assim a cor serve em qualquer um deles sem ter de saber onde vai parar.
 *
 * O `--muted` entra na lista e não é detalhe: é o fundo do avatar do canal (onde
 * as iniciais são escritas na cor da liga) e é, dos três, o que está mais perto
 * do acento nos dois temas. Sem ele, cores ajustadas ficavam-se pelos 3,8:1
 * exactamente no sítio onde a cor do canal mais aparece.
 */
function backdrops(surface: Surface): readonly string[] {
  const { background, card, muted } = SURFACES[surface];
  return [background, card, muted];
}

/*
 * Os dois tons que o design system usa para texto assente numa cor cheia:
 * tinta (--accent-foreground, sobre o limão) e papel (--primary-foreground).
 * Um deles tem sempre de cumprir AA sobre o preenchimento da marca.
 */
const ON_FILL = ["#161512", "#f6f5f1"] as const;

/** WCAG 1.4.3 — texto normal. */
const AA_TEXT = 4.5;

/** WCAG 1.4.11 — elementos não textuais (o preenchimento tem de se ver). */
const AA_NON_TEXT = 3;

/** Salto de luminosidade do hover, em L percetual. */
const HOVER_STEP = 0.055;

/** Croma máximo do fundo suave: tinge, não pinta. */
const SOFT_CHROMA = 0.045;

// ── O que os componentes recebem ────────────────────────────────────────────

/**
 * O que o sistema de cor precisa de saber sobre um canal — e nada mais.
 *
 * De propósito estrutural e mínimo: o `Channel` de `lib/channels.ts` já satisfaz
 * este tipo tal como está, por isso `TenantScope` aceita-o sem conversão. Quando
 * a Frente E trouxer os canais da BD, basta que a linha tenha estes dois campos.
 */
export type BrandedChannel = {
  /** Cor principal da marca, em hex. */
  accentColor: string;
  /** Segunda cor, opcional — quando falta, tudo cai na principal. */
  accentColorSecondary?: string | null;
};

/** A paleta derivada. Cada entrada tem um uso e uma garantia de contraste. */
export type TenantPalette = {
  /** Texto e ícones na cor do canal. Garante AA (4,5:1) sobre as superfícies. */
  accent: string;
  /** Preenchimento de marca (linha de topo, avatar, chip). Vê-se (3:1) e aguenta texto. */
  solid: string;
  /** O texto que assenta em `solid` — tinta ou papel, o que cumprir AA. */
  onSolid: string;
  /** Hover de `solid`: afasta-se do próprio texto, nunca se aproxima. */
  solidHover: string;
  /** Fundo suave tingido da marca, onde o texto do tema continua a cumprir AA. */
  soft: string;
  /** Segunda cor como acento de texto (cai na principal quando não há segunda). */
  secondary: string;
  /** Segunda cor como preenchimento. */
  secondarySolid: string;
};

/** Um ajuste que o sistema fez à cor pedida, para o ecrã poder explicá-lo. */
export type PaletteNotice = {
  /** Onde é que o ajuste se nota. */
  role: "accent" | "solid" | "secondary";
  /** A cor que a pessoa escolheu. */
  from: string;
  /** A cor que vai aparecer. */
  to: string;
  /** Frase pronta a mostrar, em PT-PT. */
  message: string;
};

export type DerivedBrand = {
  palette: TenantPalette;
  /** Vazio quando a cor escolhida passou tal e qual. */
  notices: readonly PaletteNotice[];
  /** Rácios conseguidos, para a UI os poder mostrar em vez de prometer. */
  contrast: { accent: number; onSolid: number };
};

// ── Hex ─────────────────────────────────────────────────────────────────────

type Rgb = { r: number; g: number; b: number };
type Oklch = { l: number; c: number; h: number };

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * "#6CC24A", "6cc24a", "#6C4" → "#6cc24a". `null` se não for cor.
 *
 * Sem canal alfa de propósito: uma cor de marca semitransparente torna o
 * contraste indefinido (depende do que estiver por baixo), e a promessa de AA
 * deixava de valer.
 */
export function parseHexColor(input: string): string | null {
  const match = HEX_PATTERN.exec(input.trim());
  if (!match) return null;
  const body = match[1].toLowerCase();
  const full = body.length === 3 ? body.replace(/./g, (channel) => channel + channel) : body;
  return `#${full}`;
}

function toRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

function toHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

// ── Contraste (WCAG 2.1) ────────────────────────────────────────────────────

/** sRGB → linear (a mesma curva que a WCAG usa para a luminância relativa). */
function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function toGamma(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** Rácio de contraste entre duas cores hex. 1 = iguais, 21 = preto sobre branco. */
export function contrastBetween(a: string, b: string): number {
  const first = parseHexColor(a);
  const second = parseHexColor(b);
  if (!first || !second) return 1;
  return ratio(toRgb(first), toRgb(second));
}

/** "4,53:1" — rácios também se escrevem em PT-PT. */
export function formatContrast(value: number): string {
  return `${value.toFixed(2).replace(".", ",")}:1`;
}

// ── OKLCH (Björn Ottosson) ──────────────────────────────────────────────────

function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const long = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const medium = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const short = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const l = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const bb = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;

  return {
    l,
    c: Math.hypot(a, bb),
    // atan2 devolve radianos em (-π, π]; guardamos graus em [0, 360).
    h: (Math.atan2(bb, a) * 180) / Math.PI,
  };
}

/**
 * OKLCH → sRGB. Fora do gamut, os canais são cortados para [0,1] — e é por isso
 * que todas as medições daqui em diante são feitas sobre o resultado convertido
 * e não sobre o OKLCH pedido: mede-se o que vai mesmo aparecer no ecrã.
 */
function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    r: clamp(toGamma(4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short)),
    g: clamp(toGamma(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short)),
    b: clamp(toGamma(-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short)),
  };
}

// ── Ajuste de luminosidade ──────────────────────────────────────────────────

type Direction = "lighter" | "darker";

/**
 * Arredonda para os 8 bits por canal que o ecrã realmente mostra.
 *
 * Não é cosmética: sem isto, a procura abaixo pára numa cor contínua que cumpre
 * 4,5:1 e o arredondamento para hex empurra-a de volta para 4,47:1. Mede-se
 * sempre a cor quantizada — a que vai mesmo aparecer —, nunca a ideal.
 */
function quantize({ r, g, b }: Rgb): Rgb {
  const step = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255) / 255;
  return { r: step(r), g: step(g), b: step(b) };
}

/**
 * Empurra a cor na direção pedida até `passes` dar verdade — **o mínimo que
 * baste**, para a marca ficar o mais perto possível do que a liga escolheu.
 *
 * O caminho é parametrizado por `t` ∈ [0,1]: em t=0 está a cor original, em t=1
 * está branco ou preto puro. O croma desce ao longo do caminho porque uma cor
 * quase branca não consegue segurar saturação — e assim o extremo é sempre
 * alcançável, o que garante que a procura binária termina com resposta.
 */
function pushUntil(
  base: Oklch,
  toward: Direction,
  passes: (rgb: Rgb) => boolean,
): { rgb: Rgb; moved: boolean } {
  const target = toward === "lighter" ? 1 : 0;
  const at = (t: number) =>
    quantize(oklchToRgb({ l: base.l + (target - base.l) * t, c: base.c * (1 - t), h: base.h }));

  const original = at(0);
  if (passes(original)) return { rgb: original, moved: false };

  // Sem solução nem no extremo: devolve o extremo, que é o melhor possível.
  if (!passes(at(1))) return { rgb: at(1), moved: true };

  // `low` falha, `high` passa — 20 bissecções chegam a ~1e-6 de precisão em L.
  let low = 0;
  let high = 1;
  for (let step = 0; step < 20; step += 1) {
    const middle = (low + high) / 2;
    if (passes(at(middle))) high = middle;
    else low = middle;
  }
  return { rgb: at(high), moved: true };
}

/** O pior contraste contra os fundos onde a cor pode assentar. */
function worstAgainst(rgb: Rgb, surfaces: readonly string[]): number {
  return Math.min(...surfaces.map((hex) => ratio(rgb, toRgb(hex))));
}

/**
 * O texto (tinta ou papel) que melhor assenta nesta cor, e com que folga.
 * Exportado porque é a resposta certa sempre que alguém puser texto sobre uma
 * cor de marca que a paleta ainda não cobre — em vez de inventar um par novo.
 */
export function textColorOn(fill: string): { color: string; contrast: number } {
  const parsed = parseHexColor(fill) ?? "#000000";
  const rgb = toRgb(parsed);
  const best = ON_FILL.map((candidate) => ({
    color: candidate,
    contrast: ratio(rgb, toRgb(candidate)),
  })).sort((a, b) => b.contrast - a.contrast);
  return best[0];
}

function bestOnFill(rgb: Rgb): { color: string; contrast: number } {
  return textColorOn(toHex(rgb));
}

// ── Derivação da paleta ─────────────────────────────────────────────────────

/** Sobre fundo escuro clareia-se, sobre fundo claro escurece-se. */
function escapeDirection(surface: Surface): Direction {
  return surface === "dark" ? "lighter" : "darker";
}

function verb(direction: Direction): string {
  return direction === "lighter" ? "clareámos" : "escurecemos";
}

function deriveAccent(brand: Oklch, surface: Surface) {
  const against = backdrops(surface);
  return pushUntil(brand, escapeDirection(surface), (rgb) => worstAgainst(rgb, against) >= AA_TEXT);
}

/**
 * Preenchimento: tem de se ver sobre o fundo (3:1) **e** aguentar texto por cima
 * (4,5:1 com tinta ou papel). As duas exigências puxam para o mesmo lado — quem
 * se afasta do fundo escuro aproxima-se da tinta —, por isso uma só procura
 * resolve as duas.
 */
function deriveSolid(brand: Oklch, surface: Surface) {
  const against = backdrops(surface);
  return pushUntil(
    brand,
    escapeDirection(surface),
    (rgb) => worstAgainst(rgb, against) >= AA_NON_TEXT && bestOnFill(rgb).contrast >= AA_TEXT,
  );
}

/**
 * Fundo suave: a marca reduzida a um tingimento, ancorado na luminosidade do
 * `--muted` do tema para respeitar o ritmo do design. Se o texto do tema não se
 * ler por cima, o tingimento recua até se ler — o texto é que manda.
 */
function deriveSoft(brand: Oklch, surface: Surface): string {
  const { muted, foreground } = SURFACES[surface];
  const anchor: Oklch = {
    l: rgbToOklch(toRgb(muted)).l,
    c: Math.min(brand.c, SOFT_CHROMA),
    h: brand.h,
  };
  const ink = toRgb(foreground);
  // Recua para o lado do fundo: no tema escuro escurece, no claro clareia.
  const retreat: Direction = surface === "dark" ? "darker" : "lighter";
  return toHex(pushUntil(anchor, retreat, (rgb) => ratio(rgb, ink) >= AA_TEXT).rgb);
}

/**
 * Hover do preenchimento: afasta-se do próprio texto, nunca se aproxima. Assim o
 * `onSolid` continua válido no hover e o estado lê-se como "mais destacado".
 */
function deriveHover(solid: Rgb, onSolid: string, surface: Surface): string {
  const base = rgbToOklch(solid);
  const away: Direction = rgbToOklch(toRgb(onSolid)).l > base.l ? "darker" : "lighter";
  const shifted = quantize(
    oklchToRgb({
      ...base,
      l: Math.min(1, Math.max(0, base.l + (away === "lighter" ? HOVER_STEP : -HOVER_STEP))),
    }),
  );
  // Se o salto tirar o preenchimento do fundo, fica-se pelo `solid`.
  return worstAgainst(shifted, backdrops(surface)) >= AA_NON_TEXT ? toHex(shifted) : toHex(solid);
}

const FALLBACK_BRAND = "#6e6a61"; // --muted-foreground: neutro que cumpre nos dois temas

/**
 * A paleta segura de um canal, para uma superfície.
 *
 * Nunca falha e nunca recusa: uma cor impossível é ajustada em luminosidade até
 * cumprir AA, e o ajuste vem descrito em `notices` para o ecrã o poder contar.
 */
export function derivePalette(channel: BrandedChannel, surface: Surface): DerivedBrand {
  const requested = parseHexColor(channel.accentColor) ?? FALLBACK_BRAND;
  const brand = rgbToOklch(toRgb(requested));
  const direction = escapeDirection(surface);
  const notices: PaletteNotice[] = [];

  const accent = deriveAccent(brand, surface);
  const accentHex = toHex(accent.rgb);
  if (accent.moved) {
    notices.push({
      role: "accent",
      from: requested,
      to: accentHex,
      message: `O texto na cor do canal não se lia sobre o fundo da página, por isso ${verb(direction)} a cor o suficiente para cumprir o contraste mínimo (AA).`,
    });
  }

  const solid = deriveSolid(brand, surface);
  const solidHex = toHex(solid.rgb);
  const onSolid = bestOnFill(solid.rgb);
  if (solid.moved) {
    notices.push({
      role: "solid",
      from: requested,
      to: solidHex,
      message: `Nos blocos preenchidos com a cor do canal — a linha de topo, o avatar — ${verb(direction)} o tom para o que fica por cima se ler.`,
    });
  }

  // Segunda cor: mesmo tratamento, e quando não existe herda a principal para
  // quem consome nunca ter de saber se a liga escolheu uma ou duas.
  const secondaryInput = channel.accentColorSecondary
    ? parseHexColor(channel.accentColorSecondary)
    : null;
  let secondary = accentHex;
  let secondarySolid = solidHex;
  if (secondaryInput) {
    const secondBrand = rgbToOklch(toRgb(secondaryInput));
    const secondAccent = deriveAccent(secondBrand, surface);
    secondary = toHex(secondAccent.rgb);
    secondarySolid = toHex(deriveSolid(secondBrand, surface).rgb);
    if (secondAccent.moved) {
      notices.push({
        role: "secondary",
        from: secondaryInput,
        to: secondary,
        message: `A segunda cor também não tinha contraste que chegasse — ${verb(direction)} o tom dela da mesma maneira.`,
      });
    }
  }

  return {
    palette: {
      accent: accentHex,
      solid: solidHex,
      onSolid: onSolid.color,
      solidHover: deriveHover(solid.rgb, onSolid.color, surface),
      soft: deriveSoft(brand, surface),
      secondary,
      secondarySolid,
    },
    notices,
    contrast: {
      accent: worstAgainst(accent.rgb, backdrops(surface)),
      onSolid: onSolid.contrast,
    },
  };
}

// ── Ponte para o CSS ────────────────────────────────────────────────────────

/** Onde parte o filete de duas cores. Assimétrico de propósito: lê-se decidido. */
const RULE_SPLIT = "64%";

/**
 * O filete de co-branding pronto a usar como `background`.
 *
 * Com uma cor é lisa; com duas é um corte seco entre elas — sem mistura, que é
 * o que distingue uma barra de marca de um gradiente decorativo. Duas cores que
 * derivem para o mesmo tom dão filete liso, e ainda bem: é o que elas são.
 */
function ruleBackground(palette: TenantPalette): string {
  if (palette.solid === palette.secondarySolid) return palette.solid;
  return `linear-gradient(90deg, ${palette.solid} 0 ${RULE_SPLIT}, ${palette.secondarySolid} ${RULE_SPLIT} 100%)`;
}

/**
 * A paleta em variáveis CSS, prontas a pôr num `style`. Os nomes são os que os
 * componentes já usam (`text-(--tenant)`, `bg-(--tenant-solid)`, …) — o mapa
 * entre paleta e CSS vive só aqui.
 */
export function paletteVars(palette: TenantPalette): Record<string, string> {
  return {
    "--tenant": palette.accent,
    "--tenant-solid": palette.solid,
    "--tenant-on-solid": palette.onSolid,
    "--tenant-hover": palette.solidHover,
    "--tenant-soft": palette.soft,
    "--tenant-2": palette.secondary,
    "--tenant-2-solid": palette.secondarySolid,
    "--tenant-rule": ruleBackground(palette),
  };
}

/*
 * Cache: a mesma cor volta a ser derivada em cada render (e em cada pedido no
 * servidor). A conta é barata mas não é de graça, e o resultado é sempre o mesmo
 * para o mesmo par (cores, superfície) — função pura, cache trivial.
 */
const CACHE_LIMIT = 64;
const cache = new Map<string, DerivedBrand>();

export function derivePaletteCached(channel: BrandedChannel, surface: Surface): DerivedBrand {
  const key = `${channel.accentColor}|${channel.accentColorSecondary ?? ""}|${surface}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const derived = derivePalette(channel, surface);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, derived);
  return derived;
}
